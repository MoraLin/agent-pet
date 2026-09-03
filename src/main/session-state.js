const { logEvent } = require("./logger");

let win = null;

// Called once by main.js right after the window is created, so the
// functions below can push updates to it without every module that needs
// this state also needing a direct require() on window.js.
function init({ win: theWin }) {
  win = theWin;
}

// Keyed by session_id (not a single shared slot) - hooks are global and
// multiple sessions can have permission prompts in flight at once. A single
// shared slot meant a second session's prompt silently clobbered the first
// session's timers: its impatient/give-up timeouts got cancelled and
// replaced by the new session's, so the first session's entry in
// alertingSessions never got cleaned up and sat there forever, blocking
// canDisplay() for every other session's events too (confirmed live: a pet
// process with one such orphaned entry stopped reacting to ANY new
// UserPromptSubmit/PreToolUse from a completely different, healthy session
// until the app was restarted).
// session_id -> { cwd, source, impatientTimeoutId, giveUpTimeoutId }
const pendingPermissionPrompts = new Map();
const IMPATIENT_THRESHOLD_MS = 15000; // 15 seconds

// There's no "user answered the permission prompt" hook event either - the
// next real signal is still just the approved command's own PostToolUse,
// which can be a long way off if that command runs long (e.g. a slow build).
// Without this, the pet stays stuck on "needs help"/"impatient" long after
// the human already answered and it's simply still executing. After this
// long with no resolution, assume it's been answered and downgrade to a
// working pose instead of continuing to look like it's still waiting on you.
const ALERT_GIVE_UP_MS = 60000; // 60 seconds

// Hooks can't tell us a Bash command is blocked on its own interactive
// prompt (e.g. a CLI's own "Do you want to proceed?") - there's no such
// event. We approximate it: if a Bash PreToolUse hasn't been followed by a
// PostToolUse within this long, treat it as possibly stuck and alert like
// a permission prompt. This will also false-positive on slow-but-normal
// commands (npm install, builds, tests) - real-world logs showed a project's
// own `tsc -b --noEmit` routinely running past 15s and re-triggering this on
// every single invocation, so this is set well above typical build/test
// command durations rather than matching the permission-prompt threshold.
// Keyed by session_id for the same reason as pendingPermissionPrompts above.
// session_id -> { cwd, source, timeoutId }
const pendingBashCalls = new Map();
const BASH_PENDING_THRESHOLD_MS = 45000; // 45 seconds

// Hooks are global - every Claude Code session on the machine posts to the
// same pet. Without this, session B's routine PreToolUse/PostToolUse would
// silently overwrite session A's still-unresolved "needs help" alert on
// screen. While any session is alerting, other sessions' routine events are
// just dropped (not forwarded to the renderer) until they resolve; the
// underlying timers above stay global/unscoped - only what's shown on
// screen is gated here.
//
// If more than one session is alerting at once, we cycle the display between
// them every ALERT_ROTATION_MS instead of only ever showing the first one -
// otherwise a second session waiting for help would be silently invisible.
const alertingSessions = new Map(); // session_id -> { cwd, source, state: 'waving' | 'impatient' }
let displayedAlertSessionId = null;
let alertRotationTimeoutId = null;
const ALERT_ROTATION_MS = 4000;

function canDisplay(sessionId) {
  return alertingSessions.size === 0 || sessionId === displayedAlertSessionId;
}

// Reflects whichever state the displayed session is actually in - a session
// that already escalated to impatient (see markImpatient below) must keep
// showing that on every rotation tick, not get reset back to the initial
// waving payload just because showDisplayedAlert() ran again.
function currentAlertPayload() {
  const info = alertingSessions.get(displayedAlertSessionId);
  if (info && info.state === "impatient") {
    return {
      hook_event_name: "ImpatientTimeout",
      cwd: info.cwd,
      _petSource: info.source,
    };
  }
  return {
    hook_event_name: "Notification",
    notification_type: "permission_prompt",
    cwd: info && info.cwd,
    _petSource: info && info.source,
  };
}

function showDisplayedAlert() {
  if (!displayedAlertSessionId || !win || win.isDestroyed()) return;
  win.webContents.send("pet-event", currentAlertPayload());
}

function scheduleAlertRotation() {
  if (alertRotationTimeoutId) clearTimeout(alertRotationTimeoutId);
  alertRotationTimeoutId = null;
  if (alertingSessions.size <= 1) return; // nothing to rotate to
  alertRotationTimeoutId = setTimeout(() => {
    const ids = Array.from(alertingSessions.keys());
    const nextIdx = (ids.indexOf(displayedAlertSessionId) + 1) % ids.length;
    displayedAlertSessionId = ids[nextIdx];
    showDisplayedAlert();
    scheduleAlertRotation();
  }, ALERT_ROTATION_MS);
}

function claimAlert(sessionId, cwd, source) {
  const isNewSession = !alertingSessions.has(sessionId);
  // Preserve an already-escalated 'impatient' state instead of resetting to
  // 'waving' - a session can get re-claimed while still actively alerting
  // (e.g. the Bash-pending heuristic re-arming for a session whose real
  // permission_prompt already escalated), and that must not visibly regress
  // the pet back to the calmer pose mid-wait.
  const existing = alertingSessions.get(sessionId);
  alertingSessions.set(sessionId, {
    cwd,
    source,
    state: existing ? existing.state : "waving",
  });
  if (!displayedAlertSessionId) {
    displayedAlertSessionId = sessionId;
    showDisplayedAlert();
  }
  if (isNewSession) scheduleAlertRotation();
}

// Called when a session's own impatient timer (see IMPATIENT_THRESHOLD_MS
// above) fires. Updates that session's stored state so it keeps showing
// impatient on every future rotation tick, and - if it's the one on screen
// right now - repaints immediately instead of waiting for the next tick.
function markImpatient(sessionId) {
  const info = alertingSessions.get(sessionId);
  if (!info) return;
  info.state = "impatient";
  if (sessionId === displayedAlertSessionId) showDisplayedAlert();
}

function releaseAlert(sessionId) {
  if (!alertingSessions.delete(sessionId)) return;
  if (displayedAlertSessionId === sessionId) {
    const [next] = alertingSessions.keys();
    displayedAlertSessionId = next || null;
    if (displayedAlertSessionId) showDisplayedAlert();
  }
  scheduleAlertRotation();
}

function sendToPet(petPayload, sessionId) {
  if (!canDisplay(sessionId)) return;
  if (win && !win.isDestroyed()) {
    win.webContents.send("pet-event", petPayload);
  }
}

// Shared by both a real permission_prompt Notification and the
// BashPendingTimeout heuristic (trackBashCall below) - both represent "the
// pet should show waiting/impatient until this session gives a sign of
// life," and both need the same 15s/60s safety-net timers. Without this, a
// claim made only via the Bash-pending heuristic had no give-up timer of
// its own: if that session's CLI was then killed/interrupted (so it never
// sends a real resolution event), the claim sat in alertingSessions forever,
// blocking canDisplay() for every other session indefinitely.
function startPermissionPromptTimers(sessionId, cwd, source) {
  claimAlert(sessionId, cwd, source);

  const prior = pendingPermissionPrompts.get(sessionId);
  if (prior) {
    clearTimeout(prior.impatientTimeoutId);
    clearTimeout(prior.giveUpTimeoutId);
  }

  const entry = { cwd, source };
  entry.impatientTimeoutId = setTimeout(() => {
    // Still waiting - trigger impatient animation
    logEvent({ source: "heuristic", event: "ImpatientTimeout" });
    markImpatient(sessionId);
  }, IMPATIENT_THRESHOLD_MS);
  entry.giveUpTimeoutId = setTimeout(() => {
    logEvent({
      source: "heuristic",
      event: "AlertGiveUp",
      session_id: sessionId,
      cwd,
    });
    pendingPermissionPrompts.delete(sessionId);
    releaseAlert(sessionId);
    sendToPet(
      { hook_event_name: "PreToolUse", tool_name: "Bash", cwd },
      sessionId,
    );
  }, ALERT_GIVE_UP_MS);
  pendingPermissionPrompts.set(sessionId, entry);
}

// Track a Bash call for the "possibly stuck on its own prompt" alert -
// called for PreToolUse+Bash with a valid session_id.
function trackBashCall(sessionId, cwd, source) {
  const prior = pendingBashCalls.get(sessionId);
  if (prior) clearTimeout(prior.timeoutId);

  const entry = { cwd, source };
  entry.timeoutId = setTimeout(() => {
    logEvent({ source: "heuristic", event: "BashPendingTimeout" });
    // startPermissionPromptTimers() -> claimAlert() already pushes this to
    // the renderer via showDisplayedAlert() when it becomes the shown
    // session (or it'll pick it up on the next rotation tick otherwise) -
    // an extra sendToPet() here would just repeat the identical payload.
    startPermissionPromptTimers(sessionId, cwd, source);
    pendingBashCalls.delete(sessionId);
  }, BASH_PENDING_THRESHOLD_MS);
  pendingBashCalls.set(sessionId, entry);
}

// Clears both pendingPermissionPrompts and the alert for a session that
// just resolved (Stop/UserPromptSubmit/PostToolUse/PostToolUseFailure) -
// consolidated from two separately-written blocks in the old startServer()
// that happened to already trigger on the exact same event set, so bundling
// them here doesn't change when either one fires.
function resolveSession(sessionId) {
  const pending = pendingPermissionPrompts.get(sessionId);
  if (pending) {
    clearTimeout(pending.impatientTimeoutId);
    clearTimeout(pending.giveUpTimeoutId);
    pendingPermissionPrompts.delete(sessionId);
  }
  releaseAlert(sessionId);
}

// Clears the Bash-pending tracking once the call actually finishes (normally
// or with an error) - same trigger event set as resolveSession above, kept
// separate since it's tracking a different Map.
function resolveBashPending(sessionId) {
  const pending = pendingBashCalls.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingBashCalls.delete(sessionId);
  }
}

module.exports = {
  init,
  startPermissionPromptTimers,
  trackBashCall,
  resolveSession,
  resolveBashPending,
  sendToPet,
};
