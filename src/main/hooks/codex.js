const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { BrowserWindow } = require("electron");
const paths = require("../paths");
const { logEvent } = require("../logger");
const { writeJsonAtomic } = require("./atomic-write");

// Same idea as hooks/claude.js, but for ~/.codex/hooks.json. Codex's hook
// transport only supports spawning a command (fed JSON on stdin), not an
// HTTP POST like Claude Code's "http" hook type - so this points at
// codex-hook-forward.js instead of a URL directly. Limited to the event
// names we actually turn into pet reactions (see mapHookEvent in
// src/renderer.js and the PermissionRequest normalization in hooks/server.js);
// Codex also has SessionEnd/SubagentStart/SubagentStop, but nothing here
// reacts to those yet.
const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "PreCompact",
  "PostCompact",
];
const CODEX_HOOK_MATCHER_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

// Recognizes a hook entry as "one of ours" regardless of which past
// CODEX_FORWARD_SCRIPT_LIVE path it points to (an app rename or userData
// relocation changes that path), and regardless of which command form
// wrapped it (see buildCodexHookCommand) - narrow enough (the exact script
// filename we author, launched by `node` or by our own env-var-prefixed
// Electron invocation) to never match an unrelated hook the user configured
// themselves. Used below to prune stale copies of our own registration
// instead of only ever appending new ones.
function isOurCodexHookCommand(cmd) {
  return (
    typeof cmd === "string" &&
    /"[^"]*codex-hook-forward\.js"$/.test(cmd) &&
    (/^node "/.test(cmd) || cmd.includes("ELECTRON_RUN_AS_NODE=1"))
  );
}

// Whether a plain `node` on PATH can actually run - same thing Codex's
// spawned shell would try. Checked fresh each call (cheap - a few ms) rather
// than cached, since it only ever runs once per app startup anyway.
function hasSystemNode() {
  try {
    execFileSync("node", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Codex runs "command" hooks through the system shell (cmd.exe /c on
// Windows, the user's $SHELL on POSIX), whose PATH frequently has no `node`
// on it at all - Codex CLI ships its own private Node runtime that it never
// adds to PATH, so a plain `node "..."` command silently fails to spawn and
// the hook never fires (see https://github.com/openai/codex hooks docs).
//
// Codex also requires the user to re-review/trust a hook in `/hooks`
// whenever its exact command text changes (it hashes the command), so this
// only switches away from plain `node` on machines where it's actually
// missing - anyone whose `node "..."` already works keeps that exact
// command forever and never gets silently re-flagged for review after an
// app update. Machines without a system `node` fall back to running the
// forward script with this Electron app's own binary, which behaves as a
// plain Node runtime when ELECTRON_RUN_AS_NODE=1 is set - guaranteed to
// exist since it's the same binary already running the pet. Those machines
// do need a one-time re-trust in Codex's `/hooks` UI, but they were already
// receiving no events at all, so that's a strict improvement.
function buildCodexHookCommand() {
  const script = paths.CODEX_FORWARD_SCRIPT_LIVE;
  if (hasSystemNode()) {
    return `node "${script}"`;
  }
  const execPath = process.execPath;
  return process.platform === "win32"
    ? `set ELECTRON_RUN_AS_NODE=1 && "${execPath}" "${script}"`
    : `ELECTRON_RUN_AS_NODE=1 "${execPath}" "${script}"`;
}

// The command built by buildCodexHookCommand() can't read inside a packaged
// app's app.asar - so codex-hook-forward.js has to be copied out to a real
// writable path first. Unlike the skin folder, this file is never
// user-edited, so it's re-copied on every launch to always match the
// running app version.
function seedCodexForwardScript() {
  fs.mkdirSync(path.dirname(paths.CODEX_FORWARD_SCRIPT_LIVE), {
    recursive: true,
  });
  fs.copyFileSync(
    paths.CODEX_FORWARD_SCRIPT_SOURCE,
    paths.CODEX_FORWARD_SCRIPT_LIVE,
  );
}

// Codex re-flags a hook for manual review in `/hooks` any time its command
// text changes on disk - even reverting to a previously-trusted value still
// triggers this (confirmed by hand, not just from Codex's docs), so there's
// no way for us to write a genuinely different command and have it "just
// work" for the user. The best available fix is telling them what to do the
// moment it happens, instead of a pet that silently stops reacting to Codex
// with no clue why.
//
// A plain OS-native dialog (dialog.showMessageBox/Sync) can't bold or color
// specific words, and the exact commands to run (/hooks, t) get lost in a
// wall of same-weight black text - so this loads a small standalone window
// instead, which can highlight them. Not parented/modal to the pet's own
// window (that's a transparent always-on-top overlay, not a normal window)
// and doesn't block configureCodexHooks()'s caller - it just pops up on its
// own alongside the pet.
function notifyHooksNeedTrust() {
  const notice = new BrowserWindow({
    width: 460,
    height: 230,
    center: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: "Agent Pet",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  notice.loadFile(paths.CODEX_HOOKS_NOTICE_HTML);
}

function configureCodexHooks() {
  const hooksPath = path.join(os.homedir(), ".codex", "hooks.json");
  // Only used to decide whether to bother the user with notifyHooksNeedTrust()
  // below - Codex itself creates this directory on first run, so its absence
  // means Codex isn't actually installed/used here, and a "go trust this in
  // Codex" popup would just be confusing noise.
  const codexLooksInstalled = fs.existsSync(path.join(os.homedir(), ".codex"));
  let config = {};
  if (fs.existsSync(hooksPath)) {
    try {
      config = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    } catch (err) {
      logEvent({
        source: "app",
        event: "codex_hooks_config_parse_failed",
        error: String(err),
      });
      return;
    }
  }

  config.hooks = config.hooks || {};
  const command = buildCodexHookCommand();
  const hasOurHook = (entries) =>
    (entries || []).some((entry) =>
      (entry.hooks || []).some(
        (h) => h.type === "command" && h.command === command,
      ),
    );

  let changed = false;
  for (const event of CODEX_HOOK_EVENTS) {
    // Drop stale copies of our own hook (old app-identity paths) before
    // deciding whether to add the current one - a plain exact-match check
    // has no way to recognize "this is an old version of us", so it only
    // ever appended, never pruned (review Finding 3). Anything that isn't
    // our own command - including a user's own unrelated hooks on the same
    // event - is left untouched.
    let prunedAny = false;
    const prunedEntries = (config.hooks[event] || [])
      .map((entry) => {
        const keptHooks = (entry.hooks || []).filter((h) => {
          const isStaleOwnHook =
            h.type === "command" &&
            isOurCodexHookCommand(h.command) &&
            h.command !== command;
          if (isStaleOwnHook) prunedAny = true;
          return !isStaleOwnHook;
        });
        return { ...entry, hooks: keptHooks };
      })
      .filter((entry) => entry.hooks.length > 0);
    config.hooks[event] = prunedEntries;
    if (prunedAny) changed = true;

    if (hasOurHook(config.hooks[event])) continue;
    const matcher = CODEX_HOOK_MATCHER_EVENTS.has(event) ? ".*" : undefined;
    const entry =
      matcher != null
        ? {
            matcher,
            hooks: [{ type: "command", command, timeout: 5, async: true }],
          }
        : { hooks: [{ type: "command", command, timeout: 5, async: true }] };
    config.hooks[event] = [...config.hooks[event], entry];
    changed = true;
  }

  if (!changed) return;

  const wrote = writeJsonAtomic(hooksPath, config, {
    successEvent: "codex_hooks_configured",
    failureEvent: "codex_hooks_config_write_failed",
  });
  if (wrote && codexLooksInstalled) notifyHooksNeedTrust();
}

module.exports = { seedCodexForwardScript, configureCodexHooks };
