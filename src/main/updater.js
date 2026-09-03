const https = require("https");
const { app, nativeImage } = require("electron");
const paths = require("./paths");
const { logEvent } = require("./logger");

// Reuses the GitHub Release the user already cuts for every build (see
// AgentPet-Downloads repo) as the version source of truth, instead of
// maintaining a separate version-manifest file - "ship a new version" and
// "the update check sees it" end up being the same action.
const UPDATE_CHECK_URL =
  "https://api.github.com/repos/MoraLin/AgentPet-Downloads/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day - see conversation with user
const UPDATE_CHECK_TIMEOUT_MS = 5000;

// Set once a newer release is found - read by window.js's context menu
// builder to show a persistent "download the new version" item, and
// survives after the on-pet badge (src/renderer.js's showUpdateBadge())
// fades out.
let availableUpdate = null;
let win = null;

// Loaded once at module-load time, not on every right-click menu open -
// nativeImage can't load .svg directly (see its docs' supported-extensions
// list), so the source SVG (src/assets/icons/update-available.svg, also
// used by the on-pet badge via a plain <img>) has a matching rasterized
// .png for this.
const UPDATE_MENU_ICON = nativeImage
  .createFromPath(paths.UPDATE_ICON_PNG)
  .resize({ width: 16, height: 16 });

function init({ win: theWin }) {
  win = theWin;
}

// Compares two dotted version strings numerically per segment - a plain
// string/lexicographic compare would wrongly rank "1.10.0" below "1.2.0".
// Missing trailing segments count as 0, so "1.2" == "1.2.0".
function isNewerVersion(remoteVersion, localVersion) {
  const remoteParts = remoteVersion.split(".").map(Number);
  const localParts = localVersion.split(".").map(Number);
  const len = Math.max(remoteParts.length, localParts.length);
  for (let i = 0; i < len; i++) {
    const r = remoteParts[i] || 0;
    const l = localParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

// Never blocks startup and never surfaces as an error to the user - a failed
// check (offline, GitHub rate-limited, releases repo renamed) just means no
// notification this cycle, same as if nothing had changed. Only failures are
// logged, not routine "already up to date" checks, to avoid a log line every
// single day for the common case.
function checkForUpdate() {
  const req = https.get(
    UPDATE_CHECK_URL,
    {
      headers: { "User-Agent": "Agent-Pet-App" },
      timeout: UPDATE_CHECK_TIMEOUT_MS,
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const release = JSON.parse(body);
          const remoteVersion = String(release.tag_name || "").replace(
            /^v/,
            "",
          );
          const localVersion = app.getVersion();
          if (!remoteVersion || !isNewerVersion(remoteVersion, localVersion))
            return;

          logEvent({
            source: "app",
            event: "update_available",
            remoteVersion,
            localVersion,
          });
          availableUpdate = {
            version: remoteVersion,
            url:
              release.html_url ||
              "https://github.com/MoraLin/AgentPet-Downloads/releases/latest",
          };
          if (win && !win.isDestroyed()) {
            win.webContents.send("pet-update-available", {
              version: remoteVersion,
            });
          }
        } catch (err) {
          logEvent({
            source: "app",
            event: "update_check_parse_failed",
            error: String(err),
          });
        }
      });
    },
  );
  req.on("error", (err) => {
    logEvent({
      source: "app",
      event: "update_check_failed",
      error: String(err),
    });
  });
  req.on("timeout", () => req.destroy());
}

module.exports = {
  init,
  checkForUpdate,
  isNewerVersion,
  UPDATE_CHECK_INTERVAL_MS,
  getAvailableUpdate: () => availableUpdate,
  getUpdateMenuIcon: () => UPDATE_MENU_ICON,
};
