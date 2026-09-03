const fs = require("fs");
const path = require("path");
const os = require("os");
const { logEvent } = require("../logger");
const { writeJsonAtomic } = require("./atomic-write");

// Merges the hooks this pet needs into the user's ~/.claude/settings.json,
// without clobbering whatever else is already in there (permissions, theme,
// other hooks on the same event, etc). Safe to run on every launch - it
// skips events that already have our exact URL registered. Runs regardless
// of dev vs packaged, so a packaged app is truly "double-click and done" -
// no separate script to run, no settings.json to hand-edit.
const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "Notification",
  "PreCompact",
  "PostCompact",
];
const HOOK_MATCHER_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
]);

function configureClaudeHooks(port) {
  const hookUrl = `http://localhost:${port}/event`;
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch (err) {
      // Don't touch a file we can't safely parse - and don't let this stop
      // the pet itself from starting up.
      logEvent({
        source: "app",
        event: "hooks_config_parse_failed",
        error: String(err),
      });
      return;
    }
  }

  settings.hooks = settings.hooks || {};
  const hasOurHook = (entries) =>
    (entries || []).some((entry) =>
      (entry.hooks || []).some((h) => h.type === "http" && h.url === hookUrl),
    );

  let changed = false;
  for (const event of HOOK_EVENTS) {
    if (hasOurHook(settings.hooks[event])) continue;
    const matcher = HOOK_MATCHER_EVENTS.has(event) ? ".*" : undefined;
    const entry =
      matcher != null
        ? { matcher, hooks: [{ type: "http", url: hookUrl, timeout: 5 }] }
        : { hooks: [{ type: "http", url: hookUrl, timeout: 5 }] };
    settings.hooks[event] = [...(settings.hooks[event] || []), entry];
    changed = true;
  }

  if (!changed) return;

  writeJsonAtomic(settingsPath, settings, {
    successEvent: "hooks_configured",
    failureEvent: "hooks_config_write_failed",
  });
}

module.exports = { configureClaudeHooks };
