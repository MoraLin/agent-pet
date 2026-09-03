const fs = require("fs");
const path = require("path");
const os = require("os");
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
// relocation changes that path) - narrow enough (the exact script filename
// we author, wrapped exactly as `node "..."`) to never match an unrelated
// hook the user configured themselves. Used below to prune stale copies of
// our own registration instead of only ever appending new ones.
function isOurCodexHookCommand(cmd) {
  return typeof cmd === "string" && /^node ".*codex-hook-forward\.js"$/.test(cmd);
}

// Codex CLI spawns hook commands with plain system `node`, which can't read
// inside a packaged app's app.asar - so codex-hook-forward.js has to be
// copied out to a real writable path first. Unlike the skin folder, this
// file is never user-edited, so it's re-copied on every launch to always
// match the running app version.
function seedCodexForwardScript() {
  fs.mkdirSync(path.dirname(paths.CODEX_FORWARD_SCRIPT_LIVE), {
    recursive: true,
  });
  fs.copyFileSync(
    paths.CODEX_FORWARD_SCRIPT_SOURCE,
    paths.CODEX_FORWARD_SCRIPT_LIVE,
  );
}

function configureCodexHooks() {
  const hooksPath = path.join(os.homedir(), ".codex", "hooks.json");
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
  const command = `node "${paths.CODEX_FORWARD_SCRIPT_LIVE}"`;
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

  writeJsonAtomic(hooksPath, config, {
    successEvent: "codex_hooks_configured",
    failureEvent: "codex_hooks_config_write_failed",
  });
}

module.exports = { seedCodexForwardScript, configureCodexHooks };
