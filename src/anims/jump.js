const JUMP_SRC = resolveGif('jumping');

// While wandering on foot, occasionally hop for a moment then keep walking.
// The hop actually lifts the sprite off the ground (not just a pose swap),
// so it reads as a real jump rather than the art just changing shape in place.
const JUMP_DURATION_MS = 700;
const JUMP_HEIGHT = 34;

let jumpTimeoutId = null;
let jumping = false;
let jumpBaseY = 0;
let jumpStartTime = 0;

function enterJump() {
  mode = 'jump';
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  jumping = true;
  jumpBaseY = y;
  jumpStartTime = performance.now();
  setAnim('anim-jump');
  setEmote('');
  overrideTimeoutId = setTimeout(() => {
    jumping = false;
    y = jumpBaseY;
    enterAuto();
  }, JUMP_DURATION_MS);
}

function scheduleRandomJump() {
  if (jumpTimeoutId) clearTimeout(jumpTimeoutId);
  const delay = 4000 + Math.random() * 8000;
  jumpTimeoutId = setTimeout(() => {
    if (mode === 'auto' && autoSub === 'walk') {
      enterJump();
    }
    scheduleRandomJump();
  }, delay);
}

new Image().src = JUMP_SRC;

scheduleRandomJump();
