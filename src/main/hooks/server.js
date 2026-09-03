const http = require("http");
const { app, dialog } = require("electron");
const { logEvent } = require("../logger");
const sessionState = require("../session-state");

const RESOLUTION_EVENTS = new Set([
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "UserPromptSubmit",
]);

function startServer(port, win) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/event") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.writeHead(200).end();
      try {
        const payload = JSON.parse(body);
        // Codex's hooks engine has no dedicated permission-prompt event like
        // Claude Code's Notification - PermissionRequest is its equivalent.
        // Normalizing it into the same shape here means every heuristic below
        // (timers, alert rotation, mapHookEvent) handles both sources without
        // being duplicated.
        if (payload && payload.hook_event_name === "PermissionRequest") {
          payload.hook_event_name = "Notification";
          payload.notification_type = "permission_prompt";
        }
        const eventName = payload && payload.hook_event_name;
        // A session_id that isn't a real non-empty string must never reach
        // session-state's Maps as a key - every payload missing it (or
        // sharing the same missing-ness) would otherwise collide on the
        // literal `undefined` key, silently clobbering an unrelated
        // session's timers/alert the same way two real sessions used to
        // before session_id was used as the key at all (see review Finding
        // 5). Sessions genuinely don't need session_id for events that
        // never touch that state (SessionStart, a non-Bash PreToolUse,
        // PreCompact/PostCompact), so those are left completely alone here
        // and still reach sendToPet() below as normal.
        const rawSessionId = payload && payload.session_id;
        const sessionId =
          typeof rawSessionId === "string" && rawSessionId.length > 0
            ? rawSessionId
            : null;
        const needsSessionId =
          (eventName === "Notification" &&
            payload.notification_type === "permission_prompt") ||
          (eventName === "PreToolUse" && payload.tool_name === "Bash") ||
          RESOLUTION_EVENTS.has(eventName);
        if (needsSessionId && !sessionId) {
          logEvent({
            source: "app",
            event: "missing_session_id",
            hook_event_name: eventName,
            tool_name: payload.tool_name,
          });
        }

        if (eventName === "PostToolUseFailure") {
          logEvent({
            source: "hook",
            event: eventName,
            tool_name: payload.tool_name,
            session_id: payload.session_id,
            cwd: payload.cwd,
          });
        }

        // Track permission prompts for impatient animation. The notification's
        // message text varies ("Do you want to proceed?" etc.) so we key off
        // notification_type, which is reliably "permission_prompt".
        if (
          eventName === "Notification" &&
          payload.notification_type === "permission_prompt" &&
          sessionId
        ) {
          sessionState.startPermissionPromptTimers(
            sessionId,
            payload.cwd,
            payload._petSource,
          );
        }

        // Clear timing when permission is resolved. The prompt being answered
        // doesn't fire its own event - the next sign of life is normally the
        // approved tool call actually finishing (PostToolUse), which can
        // happen well before Stop if more steps follow in the same turn.
        if (RESOLUTION_EVENTS.has(eventName) && sessionId) {
          sessionState.resolveSession(sessionId);
        }

        // Track Bash calls for the "possibly stuck on its own prompt" alert.
        if (eventName === "PreToolUse" && payload.tool_name === "Bash" && sessionId) {
          sessionState.trackBashCall(sessionId, payload.cwd, payload._petSource);
        }

        // Clear once the Bash call actually finishes (normally or with an error).
        if (RESOLUTION_EVENTS.has(eventName) && sessionId) {
          sessionState.resolveBashPending(sessionId);
        }

        sessionState.sendToPet(payload, payload.session_id);
      } catch (err) {
        logEvent({
          source: "app",
          event: "malformed_hook_payload",
          error: String(err),
        });
      }
    });
  });

  // A failed listen() (most commonly EADDRINUSE - a stray leftover process,
  // or an unrelated app already using this port) used to only get logged:
  // createWindow() already ran before startServer() in the startup sequence,
  // so the pet was already on screen doing its normal idle animation by the
  // time this async error fires, with nothing telling the user it can never
  // receive a single Claude Code/Codex event again (review Finding 4). The
  // hook server isn't an optional feature of this app - a failure to bind
  // is fatal: surface it clearly and quit, rather than run indefinitely in
  // a "looks alive, is deaf" state. Guarded so this can't run twice -
  // listen() is only ever called once here, but the app should still only
  // ever show one dialog/exit once no matter what.
  let listenErrorHandled = false;
  server.on("error", (err) => {
    if (listenErrorHandled) return;
    listenErrorHandled = true;

    logEvent({
      source: "app",
      event: "server_listen_failed",
      error: String(err),
      code: err.code,
    });

    const message =
      err.code === "EADDRINUSE"
        ? `Port ${port} 已經被其他程式占用,Agent Pet 需要這個 port 才能接收 Claude Code / Codex 的事件。\n\n請先關閉占用這個 port 的程式(可能是另一個沒有正常結束的 Agent Pet,或是其他使用同一個 port 的軟體),再重新啟動 Agent Pet。`
        : `Agent Pet 的事件接收服務啟動失敗(${err.code || err.message}),無法接收 Claude Code / Codex 的事件。`;
    dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : null, {
      type: "error",
      title: "Agent Pet 無法啟動",
      message,
    });

    if (win && !win.isDestroyed()) win.destroy();
    app.exit(1);
  });

  server.listen(port, "127.0.0.1");
}

module.exports = { startServer };
