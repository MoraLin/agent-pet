const path = require("path");
const { app } = require("electron");

// app.getAppPath() resolves to the directory containing package.json in
// dev, or the app.asar root in a packaged build - the same place main.js's
// own __dirname already pointed to before this refactor (main.js lives at
// the app root either way), but computed centrally here so modules moved
// into subdirectories (src/main/, src/main/hooks/) don't each need their
// own fragile "../../.." relative-to-__dirname arithmetic. Safe to call at
// module-load time, before app.whenReady() - same as app.getPath('userData')
// below, which this codebase already relied on pre-ready.
const APP_ROOT = app.getAppPath();
const USER_DATA_DIR = app.getPath("userData");

module.exports = {
  APP_ROOT,
  USER_DATA_DIR,

  // Bundled with the app itself - read-only in a packaged build (inside
  // app.asar).
  PRELOAD_JS: path.join(APP_ROOT, "preload.js"),
  INDEX_HTML: path.join(APP_ROOT, "index.html"),
  SKIN_DEFAULT_DIR: path.join(APP_ROOT, "src", "assets", "skin"),
  UPDATE_ICON_PNG: path.join(
    APP_ROOT,
    "src",
    "assets",
    "icons",
    "update-available.png",
  ),
  CODEX_FORWARD_SCRIPT_SOURCE: path.join(APP_ROOT, "codex-hook-forward.js"),

  // Writable per-user runtime data - would fail silently (or not exist at
  // all) if pointed at the read-only app bundle in a packaged build.
  SKIN_LIVE_DIR: path.join(USER_DATA_DIR, "skin"),
  CODEX_FORWARD_SCRIPT_LIVE: path.join(
    USER_DATA_DIR,
    "codex-hook-forward.js",
  ),
  // In dev (npm start), the log stays next to the project itself (APP_ROOT)
  // for easy access instead of being buried in the OS's per-app data dir -
  // only a packaged build uses USER_DATA_DIR, since APP_ROOT there is the
  // read-only app.asar archive and writes to it fail silently.
  LOG_PATH: app.isPackaged
    ? path.join(USER_DATA_DIR, "logs", "events.log")
    : path.join(APP_ROOT, "logs", "events.log"),
};
