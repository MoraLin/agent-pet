const fs = require("fs");
const path = require("path");
const paths = require("./paths");

// Permanent, low-volume event log so "why did the pet do X" can be answered
// by reading a file instead of re-adding throwaway debug instrumentation
// every time. Only logs actual problems (crashes, uncaught errors, malformed
// hook payloads, our own "this looks stuck" heuristics) - NOT routine
// animation switches or every incoming hook event, since idle/walk alone
// toggles every few seconds and would blow past the size cap within a day.
// Capped in size (rotates to a single .old backup) since this runs
// indefinitely via the LaunchAgent.
const LOG_PATH = paths.LOG_PATH;
const LOG_MAX_BYTES = 2 * 1024 * 1024; // 2MB

function logEvent(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
    fs.appendFileSync(
      LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
    );
  } catch (err) {
    // best-effort logging only
  }
}

module.exports = { logEvent, LOG_PATH };
