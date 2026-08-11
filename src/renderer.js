const dinoWrap = document.getElementById('dino-wrap');
const dinoImg = document.getElementById('dino');
const emoteEl = document.getElementById('emote');

const WRAP_SIZE = 96;
const WALK_SPEED = 40; // px per second, casual wandering
const DASH_SPEED = 1400; // px per second, rushing to the corner
const BOREDOM_MS = 90000; // idle time before falling asleep

const GROUND_MARGIN = 12;
const CORNER_MARGIN = 8;
// Extra headroom above the corner-parked spot so emotes that float well
// above the box (e.g. the enlarged working pose) don't clip off-screen.
const CORNER_MARGIN_TOP = 105;

// The overlay window always matches exactly one physical display's own
// bounds - it never spans more than one. macOS treats each display as its
// own independent Space, and a window spanning multiple displays turned out
// to silently fail to actually composite on top of real app windows on
// whichever one isn't its "home" display. Dragging to another display asks
// main.js to relocate the whole window there instead (see 'pet-drag-end').
// viewW/viewH are the current display's actual safe drawable size - not
// always the same as window.innerWidth/innerHeight, since macOS can nudge
// the window a bit to clear that display's own menu bar without shrinking
// its reported size to match (see main.js's sendPetInit). These defaults
// match single-display behavior until 'pet-init' arrives (previews right
// after launch, or if petAPI isn't available).
let viewW = window.innerWidth;
let viewH = window.innerHeight;

let overrideMoving = false;
let turnActive = false; // true from UserPromptSubmit/PreToolUse until Stop

let x = Math.random() * (viewW - WRAP_SIZE);
let y = viewH - WRAP_SIZE - GROUND_MARGIN;
let dir = Math.random() < 0.5 ? 1 : -1;
let targetX = x;
let targetY = y;
let mode = 'auto'; // 'auto' | 'sleep' | override state name
let autoSub = 'idle'; // 'idle' | 'walk' (only meaningful while mode === 'auto')
let lastFrameTime = null;
let overrideTimeoutId = null;
let boredomTimeoutId = null;
let autoSubTimeoutId = null;
// Right-click toggle (see setWanderEnabled()) - when false, enterAuto()
// parks in the sleep pose instead of resuming the casual idle/walk/jump/run
// wander loop. Real hook events still play normally either way.
let wanderEnabled = true;

// Resolve a nimbus gif by keyword (e.g. 'idle', 'failed') instead of a
// hardcoded filename, so swapping in a whole new character skin - a
// differently-prefixed gif set, e.g. pingu-idle.gif instead of
// nimbus-idle.gif - just means dropping the new files into
// src/assets/nimbus/, no renaming or code changes needed. Falls back to the
// nimbus-prefixed name if petAPI isn't available (e.g. index.html opened
// directly in a browser instead of through Electron).
function resolveGif(keyword, required = true) {
  if (window.petAPI && window.petAPI.resolveGif) return window.petAPI.resolveGif(keyword, required);
  return `src/assets/nimbus/nimbus-${keyword}.gif`;
}

// idle/greet/reading fall through to the same standing pose - nimbus-idle
// is a looping GIF, so it plays continuously even though only one src is set.
const STAND_SRC = resolveGif('idle');
const READING_SRC = resolveGif('review');
const WAVE_SRC = resolveGif('waving');
const SAD_SRC = resolveGif('failed');
const IMPATIENT_SRC = resolveGif('waiting');
// A plain busy-loop, distinct from the directional running-left/right used
// while actually walking/dashing - "working" doesn't have a travel direction
// (it's parked at the corner), so it doesn't need one either.
const WORKING_SRC = resolveGif('running');
// The look-left/right-side pair is optional - not every gif pack bothers
// with a dedicated sleep pose, so a pack missing them just naps sitting in
// its regular idle pose instead of the app refusing to start.
const SLEEP_LEFT_SRC = resolveGif('look-left-side', false) || STAND_SRC;
const SLEEP_RIGHT_SRC = resolveGif('look-right-side', false) || STAND_SRC;
let currentAnimCls = null;

// Warm the browser's image cache up front so cycling frames during an
// animation doesn't hit disk/decode latency and show a stale frame.
// Jump/run each warm their own frames in their own file.
[STAND_SRC, READING_SRC, WAVE_SRC, SAD_SRC, IMPATIENT_SRC, WORKING_SRC, SLEEP_LEFT_SRC, SLEEP_RIGHT_SRC].forEach((src) => {
  const img = new Image();
  img.src = src;
});

// All frame sets are padded to match the standing image's apparent size, so
// the head sits at a consistent height in the box across every animation.
const EMOTE_TOP_DEFAULT = '-22px';
const EMOTE_LEFT_DEFAULT = '50%';

// There's no separate walk pose in the nimbus set, only running - so casual
// wandering (anim-walk) reuses the same direction-specific running gif as an
// actual dash (anim-run). Sleep has its own look-left/right-side pair for
// the same reason. Unlike run (which locks direction for one straight dash),
// walking can flip direction several times without ever leaving anim-walk,
// so the src has to be able to update mid-animation too - see
// updateDirectionalGif(), called every frame from setPosition().
const DIRECTIONAL_GIF_ANIMS = new Set(['anim-walk', 'anim-run', 'anim-sleep']);
let directionalGifDir = 0;

function setDirectionalGif() {
  directionalGifDir = dir;
  if (currentAnimCls === 'anim-sleep') {
    dinoImg.src = dir === -1 ? SLEEP_LEFT_SRC : SLEEP_RIGHT_SRC;
  } else {
    dinoImg.src = dir === -1 ? RUN_LEFT_SRC : RUN_RIGHT_SRC;
  }
}

function updateDirectionalGif() {
  if (!DIRECTIONAL_GIF_ANIMS.has(currentAnimCls) || dir === directionalGifDir) return;
  setDirectionalGif();
}

function setAnim(cls) {
  if (cls === currentAnimCls) return;
  currentAnimCls = cls;
  if (cls === 'anim-walk' || cls === 'anim-run') {
    // running-left/right are drawn facing the right way already, unlike the
    // old reversed-art frames - pick the matching one instead of mirroring.
    setDirectionalGif();
  } else if (cls === 'anim-wave') {
    // Nimbus GIFs loop on their own once assigned - no interval needed.
    dinoImg.src = WAVE_SRC;
  } else if (cls === 'anim-jump') {
    dinoImg.src = JUMP_SRC;
  } else if (cls === 'anim-sad') {
    dinoImg.src = SAD_SRC;
  } else if (cls === 'anim-impatient') {
    dinoImg.src = IMPATIENT_SRC;
  } else if (cls === 'anim-sleep') {
    setDirectionalGif();
  } else if (cls === 'anim-reading') {
    dinoImg.src = READING_SRC;
  } else if (cls === 'anim-working') {
    // No dedicated "working" gif - there's no real hook event for "review"
    // specifically either (only the PreToolUse Read/Grep/Glob heuristic
    // above), so anything else that counts as "Claude is doing work"
    // (editing, thinking, compacting, generic tool calls) just shows a
    // plain busy-loop instead. It's parked at the corner with no travel
    // direction, so unlike run/walk/sleep it doesn't need the left/right pick.
    dinoImg.src = WORKING_SRC;
  } else {
    // pet/pat/success (and idle/greet) have no nimbus gif - their timers and
    // hook logic below are untouched, they're just not routed to a distinct
    // pose here, so they fall through to the idle gif instead.
    dinoImg.src = STAND_SRC;
  }
  dinoImg.className = cls;
  emoteEl.style.top = EMOTE_TOP_DEFAULT;
  emoteEl.style.left = EMOTE_LEFT_DEFAULT;
}

function setEmote(text, floaty) {
  emoteEl.textContent = text || '';
  emoteEl.classList.toggle('show', !!text);
  emoteEl.classList.toggle('emote-float', !!floaty);
  // Plain emoji never contain letters/digits - this is a cwd project-name
  // label tacked on (e.g. "❗claude-pet"), which needs different styling
  // (smaller, no wrap, a background pill) to stay readable.
  emoteEl.classList.toggle('emote-label', /[a-zA-Z0-9]/.test(text || ''));
}

// The old run artwork was drawn facing left by default, opposite of every
// other set (which face right), so its mirror needed to be inverted to line
// up with the direction of travel. Kept for any future reversed-facing set.
const REVERSED_FACING_ANIMS = new Set(['anim-run']);

// Position AND facing are combined into a single GPU-composited transform
// (rather than left/top + a separate scaleX class) so fast corner-dashes
// don't thrash layout on this fully-transparent window and leave ghosting.
function setPosition() {
  const facingLeft = dir === -1;
  const mirror = REVERSED_FACING_ANIMS.has(currentAnimCls) ? !facingLeft : facingLeft;
  // running-left/right.gif already face the right way per direction, so the
  // sprite itself must never be CSS-mirrored during anim-walk/anim-run - only
  // the dust trail emote below still needs `mirror` to flip sides with travel
  // direction (anim-walk has no emote, so this only actually matters for run).
  const imageMirror = DIRECTIONAL_GIF_ANIMS.has(currentAnimCls) ? false : mirror;
  dinoWrap.style.transform = `translate(${x}px, ${y}px) scaleX(${imageMirror ? -1 : 1})`;
  // The emote's counter-flip has to track whichever way the wrap actually
  // mirrored, not raw travel direction, since reversed-art sets (run) mirror
  // on the opposite direction from everything else.
  dinoWrap.classList.toggle('mirrored', mirror);
  // Walking can change direction several times without ever leaving
  // anim-walk (setAnim only fires once on entry) - keep the sprite in sync.
  updateDirectionalGif();
}

function clearAutoSubTimer() {
  if (autoSubTimeoutId) {
    clearTimeout(autoSubTimeoutId);
    autoSubTimeoutId = null;
  }
}

function pickNewTarget() {
  targetX = Math.random() * (viewW - WRAP_SIZE);
  targetY = Math.random() * (viewH - WRAP_SIZE);
}

function scheduleAutoSub() {
  clearAutoSubTimer();
  if (mode !== 'auto') return;
  const isWalk = autoSub === 'walk';
  const delay = isWalk ? 3000 + Math.random() * 3000 : 2000 + Math.random() * 3000;
  autoSubTimeoutId = setTimeout(() => {
    if (mode !== 'auto') return;
    autoSub = autoSub === 'walk' ? 'idle' : 'walk';
    if (autoSub === 'walk') {
      pickNewTarget();
    }
    setAnim(autoSub === 'walk' ? 'anim-walk' : 'anim-idle');
    scheduleAutoSub();
  }, delay);
}

// Idempotent: a countdown already in flight keeps running rather than being
// restarted from zero. Only resetBoredom() (real activity - hook events,
// clicking/petting) should push the deadline back out; the self-triggered
// idle flourishes (jump/run/eat) are themselves part of being bored and
// must not keep the clock from ever reaching BOREDOM_MS.
function scheduleBoredom() {
  if (boredomTimeoutId) return;
  boredomTimeoutId = setTimeout(() => {
    boredomTimeoutId = null;
    enterSleep();
  }, BOREDOM_MS);
}

function resetBoredom() {
  if (boredomTimeoutId) {
    clearTimeout(boredomTimeoutId);
    boredomTimeoutId = null;
  }
}

// jump/run/eat/ball/yawn each define their own frames, entry function, and
// scheduleRandomX() in src/anims/<name>.js - see ANIMATION_GUIDELINES.md.
// They're loaded as plain scripts after this one, so they share this file's
// top-level scope (mode, x/y/dir, setAnim, enterAuto, etc.) directly.

function enterAuto() {
  // Wandering turned off from the right-click menu - park in the sleep pose
  // instead of resuming the idle/walk/jump/run loop. Whatever called
  // enterAuto() (turn end, drag end, boredom, etc.) still gets a valid
  // "back to a resting state" outcome, just this resting state instead.
  if (!wanderEnabled) {
    enterSleep();
    return;
  }
  mode = 'auto';
  overrideMoving = false;
  setEmote('');
  if (autoSub === 'walk') {
    pickNewTarget();
  }
  setAnim(autoSub === 'walk' ? 'anim-walk' : 'anim-idle');
  setPosition();
  scheduleAutoSub();
  scheduleBoredom();
}

function enterSleep() {
  mode = 'sleep';
  overrideMoving = false;
  clearAutoSubTimer();
  setAnim('anim-sleep');
  setEmote('');
}

function setWanderEnabled(enabled) {
  wanderEnabled = enabled;
  if (!enabled && mode === 'auto') {
    enterSleep();
  } else if (enabled && mode === 'sleep') {
    enterAuto();
  }
}

function enterOverride(animClass, emoji, duration, moveToCorner, onEnd, keepBoredom) {
  mode = 'override';
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  if (!keepBoredom) resetBoredom();
  setAnim(animClass);
  setEmote(emoji, !!moveToCorner);
  overrideMoving = !!moveToCorner;
  if (moveToCorner) {
    targetX = viewW - WRAP_SIZE - CORNER_MARGIN;
    targetY = CORNER_MARGIN_TOP;
  }
  if (duration != null) {
    overrideTimeoutId = setTimeout(onEnd || enterAuto, duration);
  }
}

// Parked at the corner between tool calls within the same turn, instead of
// wandering off, so it doesn't flicker back and forth all turn long. Stays
// in the working pose (not idle) since gaps here - e.g. a background shell
// still running - still mean work is in progress, not downtime.
// Actually resumes the dash to the corner (not just freezes in place),
// since whatever called this may have been interrupted mid-dash and never
// actually arrived - otherwise "working" ends up parked wherever that
// happened to be instead of the corner.
function enterCornerWorking() {
  mode = 'override';
  clearAutoSubTimer();
  overrideMoving = true;
  targetX = viewW - WRAP_SIZE - CORNER_MARGIN;
  targetY = CORNER_MARGIN_TOP;
  setAnim('anim-working');
  setEmote('');
}

function stepToward(dt, speed) {
  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(speed * dt, dist);
  const nx = x + (dx / dist) * step;
  const ny = y + (dy / dist) * step;
  if (Math.abs(nx - x) > 0.01) {
    dir = nx > x ? 1 : -1;
  }
  x = nx;
  y = ny;
  setPosition();
  return false;
}

function movementLoop(ts) {
  if (lastFrameTime === null) lastFrameTime = ts;
  const dt = (ts - lastFrameTime) / 1000;
  lastFrameTime = ts;

  if (mode === 'auto' && autoSub === 'walk') {
    if (stepToward(dt, WALK_SPEED)) pickNewTarget();
  } else if (mode === 'override' && overrideMoving) {
    stepToward(dt, DASH_SPEED);
  } else if (mode === 'jump' && jumping) {
    const t = Math.min((ts - jumpStartTime) / JUMP_DURATION_MS, 1);
    y = jumpBaseY - JUMP_HEIGHT * 4 * t * (1 - t);
    setPosition();
  } else if (mode === 'run') {
    const t = Math.min((ts - runStartTime) / RUN_ACCEL_MS, 1);
    const speed = RUN_MAX_SPEED * t * t;
    if (stepToward(dt, speed)) {
      enterAuto();
    }
  }

  requestAnimationFrame(movementLoop);
}

// Hooks are global, so the alert could belong to any of several concurrent
// Claude Code sessions with no visual way to tell which - show the project
// folder name (last path segment of cwd) alongside the alert so it's at
// least identifiable, without building full per-session pets.
function cwdLabel(cwd) {
  if (!cwd) return '';
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function mapHookEvent(payload) {
  const name = payload && payload.hook_event_name;
  switch (name) {
    case 'SessionStart':
      return { anim: 'anim-greet', emoji: '👋', duration: 2400 };
    case 'UserPromptSubmit':
      return { anim: 'anim-working', emoji: '💭', duration: null, corner: true };
    case 'PreToolUse': {
      const tool = payload.tool_name || '';
      if (['Edit', 'Write', 'NotebookEdit'].includes(tool)) {
        return { anim: 'anim-working', emoji: '⌨️', duration: null, corner: true };
      }
      if (['Read', 'Grep', 'Glob'].includes(tool)) {
        return { anim: 'anim-reading', emoji: '🔍', duration: null, corner: true };
      }
      return { anim: 'anim-working', emoji: '⚙️', duration: null, corner: true };
    }
    case 'PostToolUse':
      // corner: true even though this is brief - if PreToolUse's dash to the
      // corner hasn't finished yet (fast tool calls often beat DASH_SPEED
      // there), dropping the corner flag here would freeze the dino wherever
      // it happened to be mid-dash instead of actually reaching the corner.
      return { anim: 'anim-working', emoji: '✨', duration: 1200, corner: true };
    case 'PostToolUseFailure':
      return { anim: 'anim-sad', emoji: '', duration: 3000, corner: true };
    case 'Stop':
      return { anim: 'anim-success', emoji: '', duration: 3000 };
    case 'Notification':
      // Only react to permission prompts ("Do you want to proceed?" etc.).
      // Other notifications (e.g. the idle-waiting reminder) fall through
      // to the mid-turn working fallback instead of the alert dance.
      // No duration: keep waving until the prompt is actually resolved and
      // the next hook event supersedes this, rather than reverting to the
      // working pose after a fixed few seconds while still awaiting input.
      if (payload.notification_type === 'permission_prompt') {
        const label = cwdLabel(payload.cwd);
        return { anim: 'anim-wave', emoji: label ? `❗${label}` : '❗', duration: null, corner: true };
      }
      return null;
    case 'PreCompact':
      return { anim: 'anim-working', emoji: '🗜️', duration: null, corner: true };
    case 'PostCompact':
      return { anim: 'anim-working', emoji: '✨', duration: 1200, corner: true };
    case 'ImpatientTimeout': {
      const label = cwdLabel(payload.cwd);
      return { anim: 'anim-impatient', emoji: label, duration: null, corner: true };
    }
    default:
      return null;
  }
}

// Stop fires once per turn, including around interactions like
// AskUserQuestion that pause for user input but aren't really "done" -
// more work often follows right after. So Stop doesn't end things
// immediately: it waits a grace period, cancelled if more work shows up.
let stopGraceTimeoutId = null;
const STOP_GRACE_MS = 5000;

function scheduleTurnEnd() {
  if (stopGraceTimeoutId) clearTimeout(stopGraceTimeoutId);
  stopGraceTimeoutId = setTimeout(() => {
    stopGraceTimeoutId = null;
    turnActive = false;
    enterAuto();
  }, STOP_GRACE_MS);
}

if (window.petAPI) {
  window.petAPI.onEvent((payload) => {
    const name = payload && payload.hook_event_name;
    // Notification fires for idle-wait reminders too, not just permission
    // prompts - only a permission prompt should count as "turn still active"
    // and cancel the pending return to auto idle/wander.
    const isPermissionPrompt = name === 'Notification' && payload.notification_type === 'permission_prompt';
    if (name === 'UserPromptSubmit' || name === 'PreToolUse' || name === 'PreCompact' || isPermissionPrompt) {
      turnActive = true;
      if (stopGraceTimeoutId) {
        clearTimeout(stopGraceTimeoutId);
        stopGraceTimeoutId = null;
      }
    } else if (name === 'Stop') {
      scheduleTurnEnd();
    }
    // Any hook event not explicitly mapped above still means work is
    // happening mid-turn, so default to the working pose rather than
    // leaving the pet stuck in whatever animation played previously.
    const mapped = mapHookEvent(payload) ||
      (turnActive ? { anim: 'anim-working', emoji: '⌨️', duration: null, corner: true } : null);
    if (mapped) {
      const onEnd = turnActive ? enterCornerWorking : undefined;
      enterOverride(mapped.anim, mapped.emoji, mapped.duration, mapped.corner, onEnd);
    }
  });
}

function previewAnim(name) {
  switch (name) {
    case 'idle':
      autoSub = 'idle';
      enterAuto();
      break;
    case 'walk':
      autoSub = 'walk';
      enterAuto();
      break;
    case 'jump':
      enterJump();
      break;
    case 'sleep':
      enterSleep();
      break;
    case 'greet':
      enterOverride('anim-greet', '👋', 2400);
      break;
    case 'thinking':
      enterOverride('anim-working', '💭', 4000, true);
      break;
    case 'working':
      enterOverride('anim-working', '⌨️', 4000, true);
      break;
    case 'reading':
      enterOverride('anim-reading', '🔍', 4000, true);
      break;
    case 'stepDone':
      enterOverride('anim-working', '✨', 1200);
      break;
    case 'happy':
      enterOverride('anim-success', '', 3000);
      break;
    case 'alert':
      enterOverride('anim-wave', '❗', 4000, true);
      break;
    case 'sad':
      enterOverride('anim-sad', '', 3000, true);
      break;
    case 'pet':
      enterOverride('anim-pet', '', 1500);
      break;
    case 'impatient':
      enterOverride('anim-impatient', '', 3000, true);
      break;
    case 'run':
      enterRun();
      break;
    default:
      break;
  }
}

if (window.petAPI && window.petAPI.onPreview) {
  window.petAPI.onPreview(previewAnim);
}

if (window.petAPI && window.petAPI.onSetWander) {
  window.petAPI.onSetWander(setWanderEnabled);
}

if (window.petAPI && window.petAPI.onInit) {
  // Sent once at launch (viewW/viewH only) and again after every
  // cross-display relocation (viewW/viewH plus where the drag actually
  // dropped it, in the new window's own local coordinates).
  window.petAPI.onInit(({ viewW: vw, viewH: vh, drop }) => {
    viewW = vw;
    viewH = vh;
    if (drop) {
      x = Math.min(Math.max(drop.x, 0), viewW - WRAP_SIZE);
      y = Math.min(Math.max(drop.y, 0), viewH - WRAP_SIZE);
      mode = 'auto';
      autoSub = 'idle';
      enterAuto();
    } else {
      // The initial spawn position was picked before this arrived, against
      // the single-display fallback - clamp it into the real display now
      // that we know its actual safe size.
      const clampedX = Math.min(Math.max(x, 0), viewW - WRAP_SIZE);
      const clampedY = Math.min(Math.max(y, 0), viewH - WRAP_SIZE);
      if (clampedX !== x || clampedY !== y) {
        x = clampedX;
        y = clampedY;
        setPosition();
      }
    }
  });
}

const DRAG_THRESHOLD = 4;
let dragActive = false;
let dragStartX = 0;
let dragStartY = 0;
let dragGrabOffsetX = 0;
let dragGrabOffsetY = 0;
let dragMoved = false;

const PAT_SWAY_MAX_DEG = 16;
const PAT_SWAY_PER_PX = 0.15;

function startPat() {
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  resetBoredom();
  mode = 'pat';
  overrideMoving = false;
  setAnim('anim-pat');
  setEmote('');
}

function updatePatSway(dx) {
  const angle = Math.max(-PAT_SWAY_MAX_DEG, Math.min(PAT_SWAY_MAX_DEG, dx * PAT_SWAY_PER_PX));
  dinoImg.style.setProperty('--sway-angle', `${angle}deg`);
}

function endPat() {
  dinoImg.style.removeProperty('--sway-angle');
  // If a turn is still active, petting/dragging shouldn't bump the pet out
  // of working mode into full auto-wander - go back to parked-working
  // instead, same as any other momentary interruption mid-turn.
  if (turnActive) {
    enterCornerWorking();
  } else {
    enterAuto();
  }
}

function handleClick() {
  enterOverride('anim-pet', '', 1500, false, turnActive ? enterCornerWorking : undefined);
}

// Hover detection: window is click-through everywhere except over the dino,
// so the OS lets clicks pass through to whatever is underneath elsewhere.
// While patting is in progress we force the window to stay interactive so a
// fast mouse move can never slip outside the dino's box and drop it.
let mouseOverPet = false;
let hoveringHead = false;
const HEAD_ZONE_FRACTION = 0.45; // top portion of the box counted as "head"

window.addEventListener('mousemove', (e) => {
  if (dragActive) {
    if (!dragMoved) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragMoved = true;
      startPat();
    }
    // Clamped to the current display's own window, same as any other
    // movement - dragging past its edge just sticks to the edge visually.
    // Actually moving to another display is decided on drop, from the real
    // screen point (see mouseup below), not from this local position.
    const maxX = viewW - WRAP_SIZE;
    const maxY = viewH - WRAP_SIZE;
    const newX = Math.min(Math.max(e.clientX - dragGrabOffsetX, 0), maxX);
    const newY = Math.min(Math.max(e.clientY - dragGrabOffsetY, 0), maxY);
    if (newX !== x) {
      dir = newX > x ? 1 : -1;
    }
    x = newX;
    y = newY;
    setPosition();
    updatePatSway(e.clientX - dragStartX);
    return;
  }

  const rect = dinoWrap.getBoundingClientRect();
  const over =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;
  if (over !== mouseOverPet) {
    mouseOverPet = over;
    if (window.petAPI) window.petAPI.setIgnoreMouseEvents(!over);
  }

  // Petting: moving the cursor onto the dino's head triggers the same happy
  // reaction as a click. Edge-triggered on entry so it doesn't restart the
  // animation on every pixel of movement while lingering there.
  const inHead = over && e.clientY <= rect.top + rect.height * HEAD_ZONE_FRACTION;
  if (inHead && !hoveringHead) {
    handleClick();
  }
  hoveringHead = inHead;
});

dinoWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  dragActive = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragGrabOffsetX = e.clientX - x;
  dragGrabOffsetY = e.clientY - y;
});

window.addEventListener('mouseup', (e) => {
  if (!dragActive || e.button !== 0) return;
  dragActive = false;
  if (dragMoved) {
    // Handles the common case (dropped on the same display) immediately -
    // if it actually landed on a different one, main.js relocates the whole
    // window there and a follow-up 'pet-init' corrects position/mode once
    // that's settled (see the onInit handler above).
    endPat();
    if (window.petAPI && window.petAPI.dragEnd) {
      window.petAPI.dragEnd({ screenX: e.screenX, screenY: e.screenY });
    }
  } else {
    handleClick();
  }
});

dinoWrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (window.petAPI) window.petAPI.showContextMenu();
});

// Surface uncaught errors to the permanent log instead of letting them
// vanish into a devtools console nobody has open.
window.addEventListener('error', (e) => {
  if (window.petAPI) {
    window.petAPI.logError({ event: 'uncaught_error', message: e.message, filename: e.filename, lineno: e.lineno });
  }
});
window.addEventListener('unhandledrejection', (e) => {
  if (window.petAPI) {
    window.petAPI.logError({ event: 'unhandled_rejection', reason: String(e.reason) });
  }
});

setPosition();
enterAuto();
requestAnimationFrame(movementLoop);
