const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Menu,
  shell,
} = require("electron");
const paths = require("./paths");
const { logEvent } = require("./logger");
const skinManager = require("./skin-manager");
const updater = require("./updater");

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

function getWindow() {
  return win;
}

// A native modal (the "import skin" folder picker, or any future dialog
// attached to this window) briefly takes real OS focus/key-window status
// away from this transparent overlay - macOS doesn't reliably restore its
// always-on-top level on its own afterward, so anything that shows a dialog
// on top of `win` needs to reapply this once the dialog closes.
function applyAlwaysOnTop(targetWin) {
  targetWin.setAlwaysOnTop(true, "screen-saver");
  targetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
      viewW:
        currentDisplay.bounds.width -
        Math.max(0, bounds.x - currentDisplay.bounds.x),
      viewH:
        currentDisplay.bounds.height -
        Math.max(0, bounds.y - currentDisplay.bounds.y),
    };
    if (drop) {
      payload.drop = { x: drop.screenX - bounds.x, y: drop.screenY - bounds.y };
    }
    win.webContents.send("pet-init", payload);
  }, 500);
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
      preload: paths.PRELOAD_JS,
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
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Pet renderer process gone, reloading:", details.reason);
    logEvent({
      source: "app",
      event: "render-process-gone",
      reason: details.reason,
    });
    if (win && !win.isDestroyed()) {
      win.loadFile(paths.INDEX_HTML);
    }
  });

  // Not .once(): a skin import (see importSkin()) calls win.reload(),
  // which fires 'did-finish-load' again - the freshly-reloaded page needs
  // the same menu-bar-offset-corrected viewW/viewH as the very first load,
  // not just the raw (uncorrected) window.innerWidth/innerHeight fallback.
  win.webContents.on("did-finish-load", () => sendPetInit(null));

  win.loadFile(paths.INDEX_HTML);
}

function setupInteraction() {
  ipcMain.on("pet-set-ignore-mouse-events", (_event, ignore) => {
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Uncaught renderer-side JS errors, forwarded through main so they land
  // in the same log file as everything else.
  ipcMain.on("pet-log-error", (_event, data) => {
    logEvent({ source: "renderer", ...data });
  });

  // A drag ended at this real screen point - relocate the window to whichever
  // display it's actually on if that's not the one already covered (dragging
  // within the same display is handled entirely renderer-side and needs no
  // help from here). getDisplayNearestPoint also handles a drop that lands in
  // a gap between two mismatched displays by snapping to the closest one.
  ipcMain.on("pet-drag-end", (_event, { screenX, screenY }) => {
    if (!win || win.isDestroyed()) return;
    const target = screen.getDisplayNearestPoint({ x: screenX, y: screenY });
    if (target.id === currentDisplay.id) return;
    currentDisplay = target;
    win.setBounds(target.bounds);
    sendPetInit({ screenX, screenY });
  });

  function setBoredomMs(ms) {
    boredomMs = ms;
    win.webContents.send("pet-set-boredom-ms", ms);
  }

  ipcMain.on("pet-show-context-menu", () => {
    if (!win || win.isDestroyed()) return;
    const preview = (name) => () => win.webContents.send("pet-preview", name);
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
    const availableUpdate = updater.getAvailableUpdate();
    const menu = Menu.buildFromTemplate([
      {
        label: "匯入寵物外觀... Import Skin...",
        click: () => skinManager.importSkin(win, applyAlwaysOnTop),
      },
      { type: "separator" },
      {
        label: "閒置自動走動 Auto-Wander",
        type: "checkbox",
        checked: wanderEnabled,
        click: () => {
          wanderEnabled = !wanderEnabled;
          win.webContents.send("pet-set-wander", wanderEnabled);
        },
      },
      {
        label: "睡著時間 Sleep Timer",
        submenu: [
          {
            label: "30 秒 30s",
            type: "radio",
            checked: boredomMs === 30000,
            click: () => setBoredomMs(30000),
          },
          {
            label: "90 秒(預設) 90s (Default)",
            type: "radio",
            checked: boredomMs === 90000,
            click: () => setBoredomMs(90000),
          },
          {
            label: "3 分鐘 3min",
            type: "radio",
            checked: boredomMs === 180000,
            click: () => setBoredomMs(180000),
          },
          {
            label: "5 分鐘 5min",
            type: "radio",
            checked: boredomMs === 300000,
            click: () => setBoredomMs(300000),
          },
          {
            label: "永不睡著 Never",
            type: "radio",
            checked: boredomMs === Infinity,
            click: () => setBoredomMs(Infinity),
          },
        ],
      },
      { type: "separator" },
      ...(availableUpdate
        ? [
            {
              label: `New Version (v${availableUpdate.version})`,
              icon: updater.getUpdateMenuIcon(),
              click: () => shell.openExternal(availableUpdate.url),
            },
            { type: "separator" },
          ]
        : []),
      {
        label: "重新啟動 Restart",
        click: () => {
          app.relaunch();
          app.exit(0);
        },
      },
      { type: "separator" },
      { label: "結束 Quit", click: () => app.quit() },
    ]);
    // Like the importSkin dialogs, this native popup can leave the window's
    // always-on-top level reset once it closes - reapply via the callback
    // that fires on close, whether or not an item was clicked.
    menu.popup({
      window: win,
      callback: () => {
        if (win && !win.isDestroyed()) applyAlwaysOnTop(win);
      },
    });
  });
}

module.exports = {
  getWindow,
  applyAlwaysOnTop,
  createWindow,
  setupInteraction,
};
