const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");
const paths = require("./paths");
const { logEvent } = require("./logger");
const {
  REQUIRED: REQUIRED_SKIN_KEYWORDS,
  matchesKeyword,
} = require("../../skin-keywords");

// The skin the app actually reads from at runtime - a writable, per-user
// copy, seeded once from the bundled default below and then left alone
// (further changes only come from the user importing a new skin via the
// right-click menu). This has to live outside the app bundle: a packaged
// build's own folder is the read-only app.asar archive, so it can't be the
// thing users overwrite when they import a skin.
const SKIN_DEFAULT_DIR = paths.SKIN_DEFAULT_DIR;
const SKIN_LIVE_DIR = paths.SKIN_LIVE_DIR;
// preload.js can't call app.getPath() itself (that's main-process-only) -
// passed through via env var instead, since preload (sandbox: false) gets a
// real process.env that mirrors this process's.
process.env.PET_SKIN_DIR = SKIN_LIVE_DIR;

// One-time migration from the old folder name ("nimbus", pre-rename) to the
// new one - runs before seeding so an existing user's already-imported skin
// gets carried over instead of being mistaken for a fresh install and
// silently replaced by the bundled default.
function migrateLegacyNimbusDirIfNeeded() {
  const legacyDir = path.join(paths.USER_DATA_DIR, "nimbus");
  if (fs.existsSync(legacyDir) && !fs.existsSync(SKIN_LIVE_DIR)) {
    fs.renameSync(legacyDir, SKIN_LIVE_DIR);
  }
}

// Only seeds on first launch (or if the user's copy somehow got wiped) -
// never re-syncs over an existing live copy, since that would stomp on
// whatever skin the user last imported.
function seedSkinDirIfNeeded() {
  migrateLegacyNimbusDirIfNeeded();
  if (fs.existsSync(SKIN_LIVE_DIR) && fs.readdirSync(SKIN_LIVE_DIR).length > 0)
    return;
  fs.mkdirSync(SKIN_LIVE_DIR, { recursive: true });
  for (const file of fs.readdirSync(SKIN_DEFAULT_DIR)) {
    if (!file.toLowerCase().endsWith(".gif")) continue; // skip .DS_Store etc.
    fs.copyFileSync(
      path.join(SKIN_DEFAULT_DIR, file),
      path.join(SKIN_LIVE_DIR, file),
    );
  }
}

// win/applyAlwaysOnTop are passed in explicitly by window.js's context-menu
// click handler rather than required here, so this module doesn't need to
// depend on window.js at all.
async function importSkin(win, applyAlwaysOnTop) {
  if (!win || win.isDestroyed()) return;
  // Any dialog shown on top of `win` (the folder picker below, or an
  // error alert) can leave the window's always-on-top level reset once it
  // closes - reapply no matter which path this function exits through.
  try {
    const result = await dialog.showOpenDialog(win, {
      title: "選擇存放 GIF 的資料夾",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const sourceDir = result.filePaths[0];

    let gifFiles;
    try {
      gifFiles = fs
        .readdirSync(sourceDir)
        .filter((f) => f.toLowerCase().endsWith(".gif"));
    } catch (err) {
      dialog.showMessageBoxSync(win, {
        type: "error",
        message: "無法讀取這個資料夾",
        detail: String(err),
      });
      return;
    }

    const missing = REQUIRED_SKIN_KEYWORDS.filter(
      (keyword) => !gifFiles.some((f) => matchesKeyword(f, keyword)),
    );
    if (missing.length > 0) {
      dialog.showMessageBoxSync(win, {
        type: "error",
        message: "這個資料夾缺少必要的 GIF,沒有套用",
        detail: `缺少關鍵字:${missing.join("、")}\n\n每個關鍵字都要有一個對應的 .gif 檔案(檔名格式:<前綴>-<關鍵字>.gif)。`,
      });
      return;
    }

    // Stage the new skin fully in a sibling temp directory and only touch
    // SKIN_LIVE_DIR once that staged copy is proven complete - the old
    // delete-then-copy order left the live skin deleted-but-not-yet-replaced
    // if any individual copy failed partway (disk full, a source file
    // disappearing mid-loop), with no way for seedSkinDirIfNeeded() to
    // notice and repair it since the folder wasn't empty, just broken.
    //
    // The live-directory swap itself is two renames, not one - a single
    // rename can't portably replace an existing non-empty directory
    // (POSIX rename(2) requires the destination to be empty; Windows'
    // MoveFileEx doesn't support replacing a directory target at all).
    // Both renames stay within SKIN_LIVE_DIR's own parent (same volume),
    // so each is a fast, effectively-atomic step.
    const importId = Date.now();
    const stagingDir = `${SKIN_LIVE_DIR}.importing-${importId}`;
    const backupDir = `${SKIN_LIVE_DIR}.old-${importId}`;
    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      for (const file of gifFiles) {
        fs.copyFileSync(
          path.join(sourceDir, file),
          path.join(stagingDir, file),
        );
      }

      // Re-validate what actually landed in staging, not just what we
      // intended to copy - the cheapest guard against a partial or
      // silently-wrong copy before anything live gets touched.
      const stagedFiles = fs.readdirSync(stagingDir);
      const stillMissing = REQUIRED_SKIN_KEYWORDS.filter(
        (keyword) => !stagedFiles.some((f) => matchesKeyword(f, keyword)),
      );
      if (stillMissing.length > 0) {
        throw new Error(
          `Staged copy is missing required GIFs: ${stillMissing.join(", ")}`,
        );
      }

      fs.renameSync(SKIN_LIVE_DIR, backupDir);
      try {
        fs.renameSync(stagingDir, SKIN_LIVE_DIR);
      } catch (err) {
        // Should be unreachable in practice (see comment above) - put
        // the old skin straight back rather than leaving SKIN_LIVE_DIR
        // missing.
        fs.renameSync(backupDir, SKIN_LIVE_DIR);
        throw err;
      }

      // Best-effort only - the swap already succeeded, so a leftover
      // backup folder is cosmetic clutter, not a correctness problem.
      try {
        fs.rmSync(backupDir, { recursive: true, force: true });
      } catch (err) {
        logEvent({
          source: "app",
          event: "skin_backup_cleanup_failed",
          error: String(err),
        });
      }
    } catch (err) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup only
      }
      dialog.showMessageBoxSync(win, {
        type: "error",
        message: "套用新外觀時發生錯誤",
        detail: String(err),
      });
      return;
    }

    win.reload();
  } finally {
    if (win && !win.isDestroyed()) applyAlwaysOnTop(win);
  }
}

module.exports = { SKIN_LIVE_DIR, seedSkinDirIfNeeded, importSkin };
