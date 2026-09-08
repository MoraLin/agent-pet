# Security

Agent Pet is a desktop pet that reacts to local Claude Code / Codex CLI hook
events. This document explains a few deliberate design decisions that a
security review of this repository will likely flag, so they read as
documented tradeoffs rather than oversights.

## Main pet window: `sandbox: false`

The main pet window (`src/main/window.js`) is created with `sandbox: false`.
This is intentional, not an oversight:

- `contextIsolation: true` **remains enabled**.
- `nodeIntegration: false` **remains disabled**.
- The window only ever loads this app's own bundled local `index.html` /
  `src/renderer.js` - it never loads remote content, and there is no
  navigation to arbitrary URLs.
- The reason `sandbox` is off is that `preload.js` uses `fs.readdirSync` to
  resolve which skin GIF file matches a given animation keyword. A fully
  sandboxed preload script cannot use Node's `fs` module directly.

Given the renderer never executes remote or attacker-controlled code, the
practical risk is low. A cleaner long-term fix would be to move that
directory listing into the main process and expose it over IPC instead, so
`sandbox: true` becomes possible - this is tracked as a future improvement,
not a blocker.

The separate notice window used to tell the user when Codex needs to
re-trust the hook (`src/main/hooks/codex.js`) *is* fully sandboxed
(`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`), since
it has no need to read the filesystem.

## Local HTTP server

The hook event receiver (`src/main/hooks/server.js`) runs a plain HTTP
server used to receive hook events from Claude Code and from
`codex-hook-forward.js`:

- It binds to **`127.0.0.1` only** - it is never reachable from the network,
  only from other processes on the same machine.
- Request bodies are capped at **64 KB**; larger requests are rejected and
  the connection is closed before the body is fully buffered.
- Malformed JSON is caught and logged, not treated as an error that crashes
  the app.
- There is no authentication on the `/event` endpoint. Any other process
  running as the same OS user could POST a hook payload. This is an
  accepted tradeoff for a local, single-user desktop tool: nothing reachable
  through this endpoint constructs a shell command, writes to an arbitrary
  filesystem path, or performs any privileged operation - the worst case is
  a spoofed pet animation or a misleading log entry (see below).

## What a hook payload can and cannot do

Every field from a hook payload (`cwd`, `tool_name`, `session_id`,
`_petSource`, etc.) is traced through `src/renderer.js` and
`src/main/session-state.js`. None of it is ever:

- used to construct a shell command or passed to `child_process`,
- used to construct or write to a filesystem path,
- rendered as HTML (`innerHTML`) or evaluated (`eval`) - text is inserted via
  `document.createTextNode` / `element.src =`, not HTML parsing.

At most, payload data affects which animation plays, what text/icon appears
in the on-screen alert bubble, and internal timers/log entries.

## Reporting a vulnerability

If you find a security issue in this repository, please use GitHub's
private vulnerability reporting (repository **Security** tab → **Report a
vulnerability**) instead of opening a public issue.
