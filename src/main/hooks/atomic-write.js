const fs = require("fs");
const path = require("path");
const { logEvent } = require("../logger");

// Shared by hooks/claude.js and hooks/codex.js - both write a hook-config
// JSON file that also holds the *user's own* unrelated settings, so
// corrupting it is worse than just breaking the pet. Writing straight to
// `targetPath` with fs.writeFileSync() truncates it immediately, so a
// crash/power-loss/disk-full partway through the write (before this fix)
// left a half-written or empty JSON file with no automatic recovery
// (review Finding 2). Instead, the full new content is written to a
// same-directory temp file first, and only swapped into place with a single
// fs.renameSync() once that succeeds - rename() replacing an existing
// *file* (not a directory, see the different Finding 1 fix for the skin
// folder) is a single, effectively-atomic syscall on both POSIX and
// Windows, so there's no window where targetPath is missing or partial:
// either the rename succeeds and it's fully replaced, or it fails and
// targetPath is untouched.
function writeJsonAtomic(targetPath, data, { successEvent, failureEvent }) {
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + "\n");
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, `${targetPath}.bak`);
    }
    fs.renameSync(tempPath, targetPath);
    logEvent({ source: "app", event: successEvent });
    return true;
  } catch (err) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // best-effort cleanup only
    }
    logEvent({ source: "app", event: failureEvent, error: String(err) });
    return false;
  }
}

module.exports = { writeJsonAtomic };
