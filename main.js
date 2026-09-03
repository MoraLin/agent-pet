const { app } = require("electron");
const logger = require("./src/main/logger");
const skinManager = require("./src/main/skin-manager");
const updater = require("./src/main/updater");
const sessionState = require("./src/main/session-state");
const window = require("./src/main/window");
const claudeHooks = require("./src/main/hooks/claude");
const codexHooks = require("./src/main/hooks/codex");
const server = require("./src/main/hooks/server");

const PORT = 9876;

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
  app.on("second-instance", () => {
    const win = window.getWindow();
    if (win && !win.isDestroyed()) {
      window.applyAlwaysOnTop(win);
    }
  });

  app.whenReady().then(() => {
    logger.logEvent({ source: "app", event: "started", pid: process.pid });
    if (process.platform === "darwin") {
      app.dock.hide();
    }
    claudeHooks.configureClaudeHooks(PORT);
    codexHooks.seedCodexForwardScript();
    codexHooks.configureCodexHooks();
    skinManager.seedSkinDirIfNeeded();
    window.createWindow();
    window.setupInteraction();
    const win = window.getWindow();
    sessionState.init({ win });
    updater.init({ win });
    server.startServer(PORT, win);
    updater.checkForUpdate();
    setInterval(updater.checkForUpdate, updater.UPDATE_CHECK_INTERVAL_MS);
  });
}

app.on("window-all-closed", () => {
  app.quit();
});
