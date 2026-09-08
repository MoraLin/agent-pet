// Optional idle flourish - resolveGif(..., false) returns null if this skin
// has no dedicated playing gif, in which case scheduleRandomPlay() never
// actually triggers and idle behaves exactly as before (see
// docs/ANIMATION_GUIDELINES.md's optional-keyword pattern, same as look-left-side).
const PLAY_SRC = resolveGif('playing', false);

const PLAY_DURATION_MS = 2500;

let playTimeoutId = null;

function enterPlay() {
  mode = 'play';
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  setAnim('anim-play');
  setEmote('');
  // Not enterOverride() - this is a self-triggered idle flourish, not a hook
  // reaction, so it must not touch the boredom timer (see
  // docs/ANIMATION_GUIDELINES.md section 2).
  overrideTimeoutId = setTimeout(() => {
    enterAuto();
  }, PLAY_DURATION_MS);
}

function scheduleRandomPlay() {
  if (!PLAY_SRC) return;
  if (playTimeoutId) clearTimeout(playTimeoutId);
  const delay = 8000 + Math.random() * 12000;
  playTimeoutId = setTimeout(() => {
    if (mode === 'auto' && autoSub === 'idle') {
      enterPlay();
    }
    scheduleRandomPlay();
  }, delay);
}

if (PLAY_SRC) new Image().src = PLAY_SRC;

scheduleRandomPlay();
