// Bridges Codex CLI's hook transport (a spawned command fed JSON on stdin)
// to the pet app's existing HTTP receiver in main.js's startServer() - the
// same endpoint Claude Code's hooks already POST to directly, since Claude's
// hook type can be "http" while Codex's can only be "command". Tags the
// payload with _petSource: 'codex' so the renderer can badge it differently
// from a Claude Code session. Not "source" - Codex's own payload already
// uses that key for something else (e.g. "startup"), and clobbering it would
// throw away real information for no reason.
//
// Never blocks or fails loudly: a dead/starting pet app must not affect the
// user's actual Codex session, so every path here exits 0.
//
// Port must match main.js's PORT constant.
const http = require('http');

let body = '';
process.stdin.on('data', (chunk) => { body += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    process.exit(0);
  }
  payload._petSource = 'codex';
  const data = JSON.stringify(payload);

  const req = http.request({
    hostname: '127.0.0.1',
    port: 9876,
    path: '/event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 3000,
  }, () => process.exit(0));
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(data);
});
