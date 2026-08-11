const RUN_LEFT_SRC = resolveGif('running-left');
const RUN_RIGHT_SRC = resolveGif('running-right');

// Occasionally break into an actual sprint to a new random spot instead of
// the usual slow amble. Speed ramps up from a stop instead of moving at a
// constant rate, so it reads as a sudden burst rather than just a faster walk.
const RUN_MAX_SPEED = 260;
const RUN_ACCEL_MS = 450;
// Below this, a random spot would be too close to read as a real dash across
// the screen, so re-roll until the target is far enough away.
const RUN_MIN_DISTANCE = 300;

let runTimeoutId = null;
let runStartTime = 0;

function pickRunTarget() {
  let nx = x;
  let ny = y;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    nx = Math.random() * (viewW - WRAP_SIZE);
    ny = Math.random() * (viewH - WRAP_SIZE);
    if (Math.hypot(nx - x, ny - y) >= RUN_MIN_DISTANCE) break;
  }
  targetX = nx;
  targetY = ny;
}

function enterRun() {
  mode = 'run';
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  pickRunTarget();
  // Face the target immediately instead of waiting for the next movement
  // frame to catch up, so the turn reads as instant when the dash starts.
  if (Math.abs(targetX - x) > 0.01) {
    dir = targetX > x ? 1 : -1;
  }
  setPosition();
  runStartTime = performance.now();
  setAnim('anim-run');
  setEmote('');
}

function scheduleRandomRun() {
  if (runTimeoutId) clearTimeout(runTimeoutId);
  const delay = 6000 + Math.random() * 10000;
  runTimeoutId = setTimeout(() => {
    if (mode === 'auto') {
      enterRun();
    }
    scheduleRandomRun();
  }, delay);
}

[RUN_LEFT_SRC, RUN_RIGHT_SRC].forEach((src) => {
  const img = new Image();
  img.src = src;
});

scheduleRandomRun();
