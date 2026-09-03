#!/usr/bin/env node
// Production packaging step, run by `pnpm run dist`/`dist:x64`/`dist:win`
// before electron-builder. Bundles the main process (main.js pulls in the
// entire src/main/** dependency graph automatically - no manual file list
// to keep in sync) and preload.js into single minified, comment-free files
// under build-prod/, so the packaged app.asar no longer ships src/main's
// module structure or its inline comments. Renderer/DOM code, GIFs, and
// icons are copied through unchanged - out of scope for this step.
//
// Dev workflow (`pnpm start` / `electron .`) never reads build-prod/ - it
// always runs the real main.js/preload.js at the project root, unaffected
// by anything here.
//
// esbuild throws on a bundling error, which aborts this script with a
// non-zero exit - the `&&` in the dist* scripts then never reaches
// electron-builder, so a broken bundle can't silently fall back to
// packaging raw source.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "build-prod");

function clean() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function bundle(entryRelPath, outName) {
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, entryRelPath)],
    outfile: path.join(OUT_DIR, outName),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
  });
}

function copy(relPath) {
  fs.cpSync(path.join(ROOT, relPath), path.join(OUT_DIR, relPath), {
    recursive: true,
  });
}

function writePackageJson() {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const prodPkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description,
    main: "main.js",
    license: rootPkg.license,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "package.json"),
    JSON.stringify(prodPkg, null, 2),
  );
}

clean();
bundle("main.js", "main.js");
bundle("preload.js", "preload.js");
copy("index.html");
copy("style.css");
copy("codex-hook-forward.js");
copy(path.join("src", "renderer.js"));
copy(path.join("src", "anims"));
copy(path.join("src", "assets"));
writePackageJson();

console.log(`Production bundle written to ${path.relative(ROOT, OUT_DIR)}/`);
