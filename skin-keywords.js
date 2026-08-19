// Single source of truth for which gif keywords a character skin must
// provide, and how a filename is checked against one - shared between
// main.js (validating a folder the user picks to import) and preload.js
// (resolveGif(), used at runtime by the renderer). Keep this list in sync
// with src/renderer.js's resolveGif() call sites and README.md's keyword
// table if a new state gets wired up to a gif.
const REQUIRED = [
  'idle',
  'running',
  'running-left',
  'running-right',
  'jumping',
  'review',
  'waiting',
  'waving',
  'failed',
];

// Not every gif pack bothers with a dedicated sleep/success/eating/playing
// pose - callers fall back to another gif, or (for eat/play) just never
// trigger the flourish at all, if these are absent (see resolveGif's
// required=false).
const OPTIONAL = ['look-left-side', 'look-right-side', 'success', 'eating', 'playing'];

// A hyphen must sit right before the keyword - "running" and "running-left"
// legitimately coexist as distinct files, and a character-name prefix can
// have its own hyphens (e.g. "yier-bubu-failed.gif"), so matching is done
// from the end of the filename, not by splitting off everything before the
// first hyphen.
function matchesKeyword(filename, keyword) {
  const name = filename.replace(/\.[^.]+$/, '');
  return name === keyword || name.endsWith(`-${keyword}`);
}

module.exports = { REQUIRED, OPTIONAL, matchesKeyword };
