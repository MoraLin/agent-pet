// Optional idle flourish - resolveGif(..., false) returns null if this skin
// has no dedicated eating gif, in which case scheduleRandomEat() never
// actually triggers and idle behaves exactly as before (see
// ANIMATION_GUIDELINES.md's optional-keyword pattern, same as look-left-side).
const EAT_SRC = resolveGif('eating', false);

const EAT_DURATION_MS = 2500;

let eatTimeoutId = null;

function enterEat() {
  mode = 'eat';
  clearAutoSubTimer();
  if (overrideTimeoutId) clearTimeout(overrideTimeoutId);
  setAnim('anim-eat');
  setEmote('');
  // Not enterOverride() - this is a self-triggered idle flourish, not a hook
  // reaction, so it must not touch the boredom timer (see
  // ANIMATION_GUIDELINES.md section 2).
  overrideTimeoutId = setTimeout(() => {
    enterAuto();
  }, EAT_DURATION_MS);
}

function scheduleRandomEat() {
  if (!EAT_SRC) return;
  if (eatTimeoutId) clearTimeout(eatTimeoutId);
  const delay = 8000 + Math.random() * 12000;
  eatTimeoutId = setTimeout(() => {
    if (mode === 'auto' && autoSub === 'idle') {
      enterEat();
    }
    scheduleRandomEat();
  }, delay);
}

if (EAT_SRC) new Image().src = EAT_SRC;

scheduleRandomEat();
