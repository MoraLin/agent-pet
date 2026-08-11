const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { matchesKeyword } = require('./nimbus-keywords');

// main.js sets this before creating the window - it's the writable, per-user
// copy of the skin (seeded from the bundled src/assets/nimbus/ on first
// launch, then live-updated in place by the "import skin" feature). Falls
// back to the bundled read-only copy if the env var is somehow missing.
const NIMBUS_DIR = process.env.PET_NIMBUS_DIR || path.join(__dirname, 'src', 'assets', 'nimbus');

// Match by keyword (e.g. 'idle', 'failed') instead of requiring an exact
// filename, so dropping a differently-prefixed gif set into NIMBUS_DIR (e.g.
// jimao-idle.gif instead of nimbus-idle.gif) just works - no renaming, no
// code changes on the renderer side. See nimbus-keywords.js for the matching
// rule and why it can't just split off everything before the first hyphen.
function resolveGif(keyword, required = true) {
  const match = fs.readdirSync(NIMBUS_DIR).find((f) => matchesKeyword(f, keyword));
  if (!match) {
    if (!required) return null;
    throw new Error(`No nimbus gif found for keyword "${keyword}" in ${NIMBUS_DIR}`);
  }
  // An absolute path, not one relative to index.html - NIMBUS_DIR now lives
  // outside the app bundle (in userData), so a path relative to the page's
  // own location wouldn't reach it.
  return path.join(NIMBUS_DIR, match);
}

contextBridge.exposeInMainWorld('petAPI', {
  resolveGif,
  onEvent: (callback) => {
    ipcRenderer.on('pet-event', (_event, payload) => callback(payload));
  },
  onPreview: (callback) => {
    ipcRenderer.on('pet-preview', (_event, name) => callback(name));
  },
  onInit: (callback) => {
    ipcRenderer.on('pet-init', (_event, data) => callback(data));
  },
  onSetWander: (callback) => {
    ipcRenderer.on('pet-set-wander', (_event, enabled) => callback(enabled));
  },
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('pet-set-ignore-mouse-events', ignore);
  },
  showContextMenu: () => {
    ipcRenderer.send('pet-show-context-menu');
  },
  logError: (data) => {
    ipcRenderer.send('pet-log-error', data);
  },
  dragEnd: (data) => {
    ipcRenderer.send('pet-drag-end', data);
  },
});
