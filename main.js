const { app, BrowserWindow, screen, ipcMain, Menu, dialog } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { REQUIRED: REQUIRED_SKIN_KEYWORDS, matchesKeyword } = require('./skin-keywords');

const PORT = 9876;

// The skin the app actually reads from at runtime - a writable, per-user
// copy, seeded once from the bundled default below and then left alone
// (further changes only come from the user importing a new skin via the
// right-click menu). This has to live outside the app bundle: a packaged
// build's own folder is the read-only app.asar archive, so it can't be the
// thing users overwrite when they import a skin. Same directory in dev and
// packaged builds (unlike LOG_PATH below) - there's no dev convenience
// reason to special-case it, and testing the import feature in dev this way
// actually exercises the real path.
const SKIN_DEFAULT_DIR = path.join(__dirname, 'src', 'assets', 'skin');
const SKIN_LIVE_DIR = path.join(app.getPath('userData'), 'skin');
// preload.js can't call app.getPath() itself (that's main-process-only) -
// passed through via env var instead, since preload (sandbox: false) gets a
// real process.env that mirrors this process's.
process.env.PET_SKIN_DIR = SKIN_LIVE_DIR;

// Codex CLI spawns hook commands with plain system `node`, which can't read
// inside a packaged app's app.asar - so codex-hook-forward.js has to be
// copied out to a real path first, same reasoning as SKIN_LIVE_DIR above.
// Unlike the skin folder, this file is never user-edited, so it's re-copied
// on every launch to always match the running app version.
const CODEX_FORWARD_SCRIPT_LIVE = path.join(app.getPath('userData'), 'codex-hook-forward.js');

// One-time migration from the old folder name ("nimbus", pre-rename) to the
// new one - runs before seeding so an existing user's already-imported skin
// gets carried over instead of being mistaken for a fresh install and
// silently replaced by the bundled default.
function migrateLegacyNimbusDirIfNeeded() {
  const legacyDir = path.join(app.getPath('userData'), 'nimbus');
  if (fs.existsSync(legacyDir) && !fs.existsSync(SKIN_LIVE_DIR)) {
    fs.renameSync(legacyDir, SKIN_LIVE_DIR);
  }
}

// Only seeds on first launch (or if the user's copy somehow got wiped) -
// never re-syncs over an existing live copy, since that would stomp on
// whatever skin the user last imported.
function seedSkinDirIfNeeded() {
  migrateLegacyNimbusDirIfNeeded();
  if (fs.existsSync(SKIN_LIVE_DIR) && fs.readdirSync(SKIN_LIVE_DIR).length > 0) return;
  fs.mkdirSync(SKIN_LIVE_DIR, { recursive: true });
  for (const file of fs.readdirSync(SKIN_DEFAULT_DIR)) {
    if (!file.toLowerCase().endsWith('.gif')) continue; // skip .DS_Store etc.
    fs.copyFileSync(path.join(SKIN_DEFAULT_DIR, file), path.join(SKIN_LIVE_DIR, file));
  }
}

// Permanent, low-volume event log so "why did the pet do X" can be answered
// by reading a file instead of re-adding throwaway debug instrumentation
// every time. Only logs actual problems (crashes, uncaught errors, malformed
// hook payloads, our own "this looks stuck" heuristics) - NOT routine
// animation switches or every incoming hook event, since idle/walk alone
// toggles every few seconds and would blow past the size cap within a day.
// Capped in size (rotates to a single .old backup) since this runs
// indefinitely via the LaunchAgent.
//
// In dev (npm start), __dirname is the project folder itself, so logs live
// right there - nowhere else to go look for it. In a packaged build,
// __dirname points inside the read-only app.asar archive - writes there
// fail silently (caught by logEvent's own try/catch, so this went unnoticed
// until actually testing a packaged build) - use the OS's proper writable
// per-app data dir instead.
const LOG_PATH = app.isPackaged
  ? path.join(app.getPath('userData'), 'logs', 'events.log')
  : path.join(__dirname, 'logs', 'events.log');
const LOG_MAX_BYTES = 2 * 1024 * 1024; // 2MB

function logEvent(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) {
    // best-effort logging only
  }
}

let win;
// Right-click toggle: when off, the pet stops the casual auto-wander loop
// (idle/walk/jump/run) and just sits in its "been idle too long" pose
// instead - still reacts normally to real Claude Code hook events, it just
// doesn't wander on its own between them. See src/renderer.js's
// setWanderEnabled().
let wanderEnabled = true;
// Right-click submenu: how long idle (no real Claude Code activity) before
// falling asleep. Mirrors src/renderer.js's own default until changed - see
// setBoredomMs().
let boredomMs = 90000;
let permissionPromptStartTime = null;
let permissionPromptSessionId = null;
let permissionPromptCwd = null;
let permissionPromptSource = null;
let impatientTimeoutId = null;
const IMPATIENT_THRESHOLD_MS = 15000; // 15 seconds

// There's no "user answered the permission prompt" hook event either - the
// next real signal is still just the approved command's own PostToolUse,
// which can be a long way off if that command runs long (e.g. a slow build).
// Without this, the pet stays stuck on "needs help"/"impatient" long after
// the human already answered and it's simply still executing. After this
// long with no resolution, assume it's been answered and downgrade to a
// working pose instead of continuing to look like it's still waiting on you.
let alertGiveUpTimeoutId = null;
const ALERT_GIVE_UP_MS = 30000; // 30 seconds

// Hooks can't tell us a Bash command is blocked on its own interactive
// prompt (e.g. a CLI's own "Do you want to proceed?") - there's no such
// event. We approximate it: if a Bash PreToolUse hasn't been followed by a
// PostToolUse within this long, treat it as possibly stuck and alert like
// a permission prompt. This will also false-positive on slow-but-normal
// commands (npm install, builds, tests) - real-world logs showed a project's
// own `tsc -b --noEmit` routinely running past 15s and re-triggering this on
// every single invocation, so this is set well above typical build/test
// command durations rather than matching the permission-prompt threshold.
let bashPendingStartTime = null;
let bashPendingSessionId = null;
let bashPendingCwd = null;
let bashPendingSource = null;
let bashPendingTimeoutId = null;
const BASH_PENDING_THRESHOLD_MS = 45000; // 45 seconds

// Hooks are global - every Claude Code session on the machine posts to the
// same pet. Without this, session B's routine PreToolUse/PostToolUse would
// silently overwrite session A's still-unresolved "needs help" alert on
// screen. While any session is alerting, other sessions' routine events are
// just dropped (not forwarded to the renderer) until they resolve; the
// underlying main.js timers above stay global/unscoped - only what's shown
// on screen is gated here.
//
// If more than one session is alerting at once, we cycle the display between
// them every ALERT_ROTATION_MS instead of only ever showing the first one -
// otherwise a second session waiting for help would be silently invisible.
const alertingSessions = new Map(); // session_id -> { cwd, source }
let displayedAlertSessionId = null;
let alertRotationTimeoutId = null;
const ALERT_ROTATION_MS = 4000;
const RESOLUTION_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure', 'Stop', 'UserPromptSubmit']);

function canDisplay(sessionId) {
  return alertingSessions.size === 0 || sessionId === displayedAlertSessionId;
}

function currentAlertPayload() {
  const info = alertingSessions.get(displayedAlertSessionId);
  return {
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    cwd: info && info.cwd,
    _petSource: info && info.source,
  };
}

function showDisplayedAlert() {
  if (!displayedAlertSessionId || !win || win.isDestroyed()) return;
  win.webContents.send('pet-event', currentAlertPayload());
}

function scheduleAlertRotation() {
  if (alertRotationTimeoutId) clearTimeout(alertRotationTimeoutId);
  alertRotationTimeoutId = null;
  if (alertingSessions.size <= 1) return; // nothing to rotate to
  alertRotationTimeoutId = setTimeout(() => {
    const ids = Array.from(alertingSessions.keys());
    const nextIdx = (ids.indexOf(displayedAlertSessionId) + 1) % ids.length;
    displayedAlertSessionId = ids[nextIdx];
    showDisplayedAlert();
    scheduleAlertRotation();
  }, ALERT_ROTATION_MS);
}

function claimAlert(sessionId, cwd, source) {
  const isNewSession = !alertingSessions.has(sessionId);
  alertingSessions.set(sessionId, { cwd, source });
  if (!displayedAlertSessionId) {
    displayedAlertSessionId = sessionId;
    showDisplayedAlert();
  }
  if (isNewSession) scheduleAlertRotation();
}

function releaseAlert(sessionId) {
  if (!alertingSessions.delete(sessionId)) return;
  if (displayedAlertSessionId === sessionId) {
    const [next] = alertingSessions.keys();
    displayedAlertSessionId = next || null;
    if (displayedAlertSessionId) showDisplayedAlert();
  }
  scheduleAlertRotation();
}

function sendToPet(petPayload, sessionId) {
  if (!canDisplay(sessionId)) return;
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet-event', petPayload);
  }
}

// Merges the hooks this pet needs into the user's ~/.claude/settings.json,
// without clobbering whatever else is already in there (permissions, theme,
// other hooks on the same event, etc). Safe to run on every launch - it
// skips events that already have our exact URL registered. Runs regardless
// of dev vs packaged, so a packaged app is truly "double-click and done" -
// no separate script to run, no settings.json to hand-edit.
const HOOK_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'Stop', 'Notification', 'PreCompact', 'PostCompact',
];
const HOOK_MATCHER_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);
const HOOK_URL = `http://localhost:${PORT}/event`;

function configureClaudeHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (err) {
      // Don't touch a file we can't safely parse - and don't let this stop
      // the pet itself from starting up.
      logEvent({ source: 'app', event: 'hooks_config_parse_failed', error: String(err) });
      return;
    }
  }

  settings.hooks = settings.hooks || {};
  const hasOurHook = (entries) => (entries || []).some((entry) =>
    (entry.hooks || []).some((h) => h.type === 'http' && h.url === HOOK_URL)
  );

  let changed = false;
  for (const event of HOOK_EVENTS) {
    if (hasOurHook(settings.hooks[event])) continue;
    const matcher = HOOK_MATCHER_EVENTS.has(event) ? '.*' : undefined;
    const entry = matcher != null
      ? { matcher, hooks: [{ type: 'http', url: HOOK_URL, timeout: 5 }] }
      : { hooks: [{ type: 'http', url: HOOK_URL, timeout: 5 }] };
    settings.hooks[event] = [...(settings.hooks[event] || []), entry];
    changed = true;
  }

  if (!changed) return;

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    logEvent({ source: 'app', event: 'hooks_configured' });
  } catch (err) {
    logEvent({ source: 'app', event: 'hooks_config_write_failed', error: String(err) });
  }
}

function seedCodexForwardScript() {
  fs.mkdirSync(path.dirname(CODEX_FORWARD_SCRIPT_LIVE), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'codex-hook-forward.js'), CODEX_FORWARD_SCRIPT_LIVE);
}

// Same idea as configureClaudeHooks() above, but for ~/.codex/hooks.json.
// Codex's hook transport only supports spawning a command (fed JSON on
// stdin), not an HTTP POST like Claude Code's "http" hook type - so this
// points at codex-hook-forward.js instead of HOOK_URL directly. Limited to
// the event names we actually turn into pet reactions (see mapHookEvent in
// src/renderer.js and the PermissionRequest normalization in startServer());
// Codex also has SessionEnd/SubagentStart/SubagentStop, but nothing here
// reacts to those yet.
const CODEX_HOOK_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PermissionRequest', 'Stop', 'PreCompact', 'PostCompact',
];
const CODEX_HOOK_MATCHER_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

function configureCodexHooks() {
  const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
  let config = {};
  if (fs.existsSync(hooksPath)) {
    try {
      config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    } catch (err) {
      logEvent({ source: 'app', event: 'codex_hooks_config_parse_failed', error: String(err) });
      return;
    }
  }

  config.hooks = config.hooks || {};
  const command = `node "${CODEX_FORWARD_SCRIPT_LIVE}"`;
  const hasOurHook = (entries) => (entries || []).some((entry) =>
    (entry.hooks || []).some((h) => h.type === 'command' && h.command === command)
  );

  let changed = false;
  for (const event of CODEX_HOOK_EVENTS) {
    if (hasOurHook(config.hooks[event])) continue;
    const matcher = CODEX_HOOK_MATCHER_EVENTS.has(event) ? '.*' : undefined;
    const entry = matcher != null
      ? { matcher, hooks: [{ type: 'command', command, timeout: 5, async: true }] }
      : { hooks: [{ type: 'command', command, timeout: 5, async: true }] };
    config.hooks[event] = [...(config.hooks[event] || []), entry];
    changed = true;
  }

  if (!changed) return;

  try {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    if (fs.existsSync(hooksPath)) {
      fs.copyFileSync(hooksPath, `${hooksPath}.bak`);
    }
    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2) + '\n');
    logEvent({ source: 'app', event: 'codex_hooks_configured' });
  } catch (err) {
    logEvent({ source: 'app', event: 'codex_hooks_config_write_failed', error: String(err) });
  }
}

// The display the window is currently sized to match exactly. A window that
// spans multiple displays turned out to silently fail to composite on top of
// real app windows on whichever display macOS doesn't consider its "home" -
// each display is its own independent Space, and a window only reliably
// paints on the one it's actually attached to (confirmed by comparing a
// direct framebuffer capture, which rendered the pet correctly, against a
// real screenshot, which didn't show it - on one specific display only).
// So the window always matches exactly one display's bounds; dragging to
// another display relocates it there instead of letting it span both.
let currentDisplay = null;

function sendPetInit(drop) {
  if (!win || win.isDestroyed()) return;
  // macOS can silently nudge a window away from the x/y it was given (e.g.
  // to clear that display's own menu bar) - observed drifting for a few
  // hundred ms after a move/resize before settling. Reading bounds right
  // away can still catch it mid-nudge, so wait a beat before trusting them.
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const payload = {
      viewW: currentDisplay.bounds.width - Math.max(0, bounds.x - currentDisplay.bounds.x),
      viewH: currentDisplay.bounds.height - Math.max(0, bounds.y - currentDisplay.bounds.y),
    };
    if (drop) {
      payload.drop = { x: drop.screenX - bounds.x, y: drop.screenY - bounds.y };
    }
    win.webContents.send('pet-init', payload);
  }, 500);
}

// A native modal (the "import skin" folder picker, or any future dialog
// attached to this window) briefly takes real OS focus/key-window status
// away from this transparent overlay - macOS doesn't reliably restore its
// always-on-top level on its own afterward, so anything that shows a dialog
// on top of `win` needs to reapply this once the dialog closes.
function applyAlwaysOnTop(targetWin) {
  targetWin.setAlwaysOnTop(true, 'screen-saver');
  targetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createWindow() {
  currentDisplay = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    x: currentDisplay.bounds.x,
    y: currentDisplay.bounds.y,
    width: currentDisplay.bounds.width,
    height: currentDisplay.bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Only the preload script (still fully trusted, local code) needs
      // this - it uses fs.readdirSync to resolve skin gif filenames by
      // keyword. The renderer itself stays isolated/non-integrated above.
      sandbox: false,
    },
  });

  applyAlwaysOnTop(win);
  win.setIgnoreMouseEvents(true, { forward: true });

  // The window is fully transparent, so a crashed renderer just looks like
  // the pet silently vanished with no way to tell what happened. Reload the
  // page instead of leaving it dead.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Pet renderer process gone, reloading:', details.reason);
    logEvent({ source: 'app', event: 'render-process-gone', reason: details.reason });
    if (win && !win.isDestroyed()) {
      win.loadFile('index.html');
    }
  });

  // Not .once(): a skin import (see importSkin()) calls win.reload(),
  // which fires 'did-finish-load' again - the freshly-reloaded page needs
  // the same menu-bar-offset-corrected viewW/viewH as the very first load,
  // not just the raw (uncorrected) window.innerWidth/innerHeight fallback.
  win.webContents.on('did-finish-load', () => sendPetInit(null));

  win.loadFile('index.html');
}

function setupInteraction() {
  ipcMain.on('pet-set-ignore-mouse-events', (_event, ignore) => {
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Uncaught renderer-side JS errors, forwarded through main so they land
  // in the same log file as everything else.
  ipcMain.on('pet-log-error', (_event, data) => {
    logEvent({ source: 'renderer', ...data });
  });

  // A drag ended at this real screen point - relocate the window to whichever
  // display it's actually on if that's not the one already covered (dragging
  // within the same display is handled entirely renderer-side and needs no
  // help from here). getDisplayNearestPoint also handles a drop that lands in
  // a gap between two mismatched displays by snapping to the closest one.
  ipcMain.on('pet-drag-end', (_event, { screenX, screenY }) => {
    if (!win || win.isDestroyed()) return;
    const target = screen.getDisplayNearestPoint({ x: screenX, y: screenY });
    if (target.id === currentDisplay.id) return;
    currentDisplay = target;
    win.setBounds(target.bounds);
    sendPetInit({ screenX, screenY });
  });

  async function importSkin() {
    if (!win || win.isDestroyed()) return;
    // Any dialog shown on top of `win` (the folder picker below, or an
    // error alert) can leave the window's always-on-top level reset once it
    // closes - reapply no matter which path this function exits through.
    try {
      const result = await dialog.showOpenDialog(win, {
        title: '選擇存放 GIF 的資料夾',
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return;
      const sourceDir = result.filePaths[0];

      let gifFiles;
      try {
        gifFiles = fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith('.gif'));
      } catch (err) {
        dialog.showMessageBoxSync(win, { type: 'error', message: '無法讀取這個資料夾', detail: String(err) });
        return;
      }

      const missing = REQUIRED_SKIN_KEYWORDS.filter(
        (keyword) => !gifFiles.some((f) => matchesKeyword(f, keyword))
      );
      if (missing.length > 0) {
        dialog.showMessageBoxSync(win, {
          type: 'error',
          message: '這個資料夾缺少必要的 GIF,沒有套用',
          detail: `缺少關鍵字:${missing.join('、')}\n\n每個關鍵字都要有一個對應的 .gif 檔案(檔名格式:<前綴>-<關鍵字>.gif)。`,
        });
        return;
      }

      try {
        // Replace, not merge - a stale leftover from the old skin could
        // collide with the new one's own keyword match (e.g. an old
        // running.gif left behind).
        for (const file of fs.readdirSync(SKIN_LIVE_DIR)) {
          fs.unlinkSync(path.join(SKIN_LIVE_DIR, file));
        }
        for (const file of gifFiles) {
          fs.copyFileSync(path.join(sourceDir, file), path.join(SKIN_LIVE_DIR, file));
        }
      } catch (err) {
        dialog.showMessageBoxSync(win, { type: 'error', message: '套用新外觀時發生錯誤', detail: String(err) });
        return;
      }

      win.reload();
    } finally {
      if (win && !win.isDestroyed()) applyAlwaysOnTop(win);
    }
  }

  function setBoredomMs(ms) {
    boredomMs = ms;
    win.webContents.send('pet-set-boredom-ms', ms);
  }

  ipcMain.on('pet-show-context-menu', () => {
    if (!win || win.isDestroyed()) return;
    const preview = (name) => () => win.webContents.send('pet-preview', name);
    // 這版想做單純一點，先把整個「預覽動畫」選單藏起來 - 之後要開放測試再打開。
    // {
    //   label: '預覽動畫',
    //   submenu: [
    //     { label: '待機', click: preview('idle') },
    //     { label: '走路', click: preview('walk') },
    //     { label: '跳躍', click: preview('jump') },
    //     { label: '睡覺', click: preview('sleep') },
    //     { label: '打招呼', click: preview('greet') },
    //     { label: '思考中', click: preview('thinking') },
    //     { label: '打字工作中', click: preview('working') },
    //     { label: '看代碼', click: preview('reading') },
    //     { label: '單步完成', click: preview('stepDone') },
    //     { label: '需要協助', click: preview('alert') },
    //     { label: '出錯', click: preview('sad') },
    //     { label: '不耐煩', click: preview('impatient') },
    //     { label: '跑步', click: preview('run') },
    //     // 摸摸/開心(anim-success) 還沒有對應的 skin GIF,觸發後畫面上跟
    //     // 待機沒有分別 - 暫時把預覽選項藏起來，等有素材了再打開。吃東西/玩球/
    //     // 打哈欠這幾個花拳已經整個刪掉了，不會再出現。
    //     // { label: '開心', click: preview('happy') },
    //     // { label: '摸摸', click: preview('pet') },
    //   ],
    // },
    // { type: 'separator' },
    const menu = Menu.buildFromTemplate([
      {
        label: '匯入寵物外觀... Import Skin...',
        click: importSkin,
      },
      { type: 'separator' },
      {
        label: '閒置自動走動 Auto-Wander',
        type: 'checkbox',
        checked: wanderEnabled,
        click: () => {
          wanderEnabled = !wanderEnabled;
          win.webContents.send('pet-set-wander', wanderEnabled);
        },
      },
      {
        label: '睡著時間 Sleep Timer',
        submenu: [
          { label: '30 秒 30s', type: 'radio', checked: boredomMs === 30000, click: () => setBoredomMs(30000) },
          { label: '90 秒(預設) 90s (Default)', type: 'radio', checked: boredomMs === 90000, click: () => setBoredomMs(90000) },
          { label: '3 分鐘 3min', type: 'radio', checked: boredomMs === 180000, click: () => setBoredomMs(180000) },
          { label: '5 分鐘 5min', type: 'radio', checked: boredomMs === 300000, click: () => setBoredomMs(300000) },
          { label: '永不睡著 Never', type: 'radio', checked: boredomMs === Infinity, click: () => setBoredomMs(Infinity) },
        ],
      },
      { type: 'separator' },
      {
        label: '重新啟動 Restart',
        click: () => {
          app.relaunch();
          app.exit(0);
        },
      },
      { type: 'separator' },
      { label: '結束 Quit', click: () => app.quit() },
    ]);
    // Like the importSkin dialogs, this native popup can leave the window's
    // always-on-top level reset once it closes - reapply via the callback
    // that fires on close, whether or not an item was clicked.
    menu.popup({ window: win, callback: () => { if (win && !win.isDestroyed()) applyAlwaysOnTop(win); } });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/event') {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.writeHead(200).end();
      try {
        const payload = JSON.parse(body);
        // Codex's hooks engine has no dedicated permission-prompt event like
        // Claude Code's Notification - PermissionRequest is its equivalent.
        // Normalizing it into the same shape here means every heuristic below
        // (timers, alert rotation, mapHookEvent) handles both sources without
        // being duplicated.
        if (payload && payload.hook_event_name === 'PermissionRequest') {
          payload.hook_event_name = 'Notification';
          payload.notification_type = 'permission_prompt';
        }
        const eventName = payload && payload.hook_event_name;

        if (eventName === 'PostToolUseFailure') {
          logEvent({
            source: 'hook',
            event: eventName,
            tool_name: payload.tool_name,
            session_id: payload.session_id,
            cwd: payload.cwd,
          });
        }

        // Track permission prompts for impatient animation. The notification's
        // message text varies ("Do you want to proceed?" etc.) so we key off
        // notification_type, which is reliably "permission_prompt".
        if (eventName === 'Notification' && payload.notification_type === 'permission_prompt') {
          claimAlert(payload.session_id, payload.cwd, payload._petSource);
          permissionPromptStartTime = Date.now();
          permissionPromptSessionId = payload.session_id;
          permissionPromptCwd = payload.cwd;
          permissionPromptSource = payload._petSource;
          if (impatientTimeoutId) clearTimeout(impatientTimeoutId);
          impatientTimeoutId = setTimeout(() => {
            if (permissionPromptStartTime !== null) {
              // Still waiting - trigger impatient animation
              logEvent({ source: 'heuristic', event: 'ImpatientTimeout' });
              sendToPet({
                hook_event_name: 'ImpatientTimeout',
                cwd: permissionPromptCwd,
                _petSource: permissionPromptSource,
              }, permissionPromptSessionId);
            }
            impatientTimeoutId = null;
          }, IMPATIENT_THRESHOLD_MS);

          if (alertGiveUpTimeoutId) clearTimeout(alertGiveUpTimeoutId);
          const giveUpSessionId = payload.session_id;
          const giveUpCwd = payload.cwd;
          alertGiveUpTimeoutId = setTimeout(() => {
            // Guard against a newer prompt (possibly a different session)
            // having since overwritten these - only act if still the same one.
            if (permissionPromptStartTime !== null && permissionPromptSessionId === giveUpSessionId) {
              logEvent({ source: 'heuristic', event: 'AlertGiveUp', session_id: giveUpSessionId, cwd: giveUpCwd });
              permissionPromptStartTime = null;
              permissionPromptSessionId = null;
              permissionPromptCwd = null;
              permissionPromptSource = null;
              if (impatientTimeoutId) clearTimeout(impatientTimeoutId);
              impatientTimeoutId = null;
              releaseAlert(giveUpSessionId);
              sendToPet({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: giveUpCwd }, giveUpSessionId);
            }
            alertGiveUpTimeoutId = null;
          }, ALERT_GIVE_UP_MS);
        }

        // Clear timing when permission is resolved. The prompt being answered
        // doesn't fire its own event - the next sign of life is normally the
        // approved tool call actually finishing (PostToolUse), which can
        // happen well before Stop if more steps follow in the same turn.
        if (eventName === 'Stop' || eventName === 'UserPromptSubmit' ||
            eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') {
          permissionPromptStartTime = null;
          permissionPromptSessionId = null;
          permissionPromptCwd = null;
          permissionPromptSource = null;
          if (impatientTimeoutId) clearTimeout(impatientTimeoutId);
          impatientTimeoutId = null;
          if (alertGiveUpTimeoutId) clearTimeout(alertGiveUpTimeoutId);
          alertGiveUpTimeoutId = null;
        }
        if (RESOLUTION_EVENTS.has(eventName)) {
          releaseAlert(payload.session_id);
        }

        // Track Bash calls for the "possibly stuck on its own prompt" alert.
        if (eventName === 'PreToolUse' && payload.tool_name === 'Bash') {
          bashPendingStartTime = Date.now();
          bashPendingSessionId = payload.session_id;
          bashPendingCwd = payload.cwd;
          bashPendingSource = payload._petSource;
          if (bashPendingTimeoutId) clearTimeout(bashPendingTimeoutId);
          bashPendingTimeoutId = setTimeout(() => {
            if (bashPendingStartTime !== null) {
              logEvent({ source: 'heuristic', event: 'BashPendingTimeout' });
              claimAlert(bashPendingSessionId, bashPendingCwd, bashPendingSource);
              sendToPet({
                hook_event_name: 'Notification',
                notification_type: 'permission_prompt',
                cwd: bashPendingCwd,
                _petSource: bashPendingSource,
              }, bashPendingSessionId);
            }
            bashPendingTimeoutId = null;
          }, BASH_PENDING_THRESHOLD_MS);
        }

        // Clear once the Bash call actually finishes (normally or with an error).
        if (eventName === 'PostToolUse' || eventName === 'PostToolUseFailure' ||
            eventName === 'Stop' || eventName === 'UserPromptSubmit') {
          bashPendingStartTime = null;
          bashPendingSessionId = null;
          bashPendingCwd = null;
          bashPendingSource = null;
          if (bashPendingTimeoutId) clearTimeout(bashPendingTimeoutId);
          bashPendingTimeoutId = null;
        }

        sendToPet(payload, payload.session_id);
      } catch (err) {
        logEvent({ source: 'app', event: 'malformed_hook_payload', error: String(err) });
      }
    });
  });

  // Without this, a port conflict (e.g. the pet already running, or a
  // second instance launched by mistake) is an uncaught exception that
  // silently kills the whole app - no window, no error visible anywhere.
  server.on('error', (err) => {
    logEvent({ source: 'app', event: 'server_listen_failed', error: String(err) });
  });

  server.listen(PORT, '127.0.0.1');
}

// Windows has no OS-level guard against launching the same .exe twice - unlike
// macOS, where Finder/Dock re-activate an already-running app instead of
// starting a second process, and a launchd LaunchAgent refuses to bootstrap a
// label that's already loaded. Without this lock, every duplicate launch on
// Windows (a stray Startup shortcut, a stuck old process, a re-run script)
// stacked another full-screen pet window on top of the last one instead of
// being turned away.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      applyAlwaysOnTop(win);
    }
  });

  app.whenReady().then(() => {
    logEvent({ source: 'app', event: 'started', pid: process.pid });
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    configureClaudeHooks();
    seedCodexForwardScript();
    configureCodexHooks();
    seedSkinDirIfNeeded();
    createWindow();
    setupInteraction();
    startServer();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
