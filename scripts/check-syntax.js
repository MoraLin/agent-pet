#!/usr/bin/env node
// Minimal, honest stand-in for "npm run lint" / "npm test" until this
// project has real ESLint config and a real test suite - see
// docs/releasing.md. Walks every project JS file (skipping node_modules,
// dist, and .git) and runs `node --check` on each one, catching syntax
// errors before a release build ever starts. This does NOT catch logic
// bugs, only parse errors - it's a cheap safety net, not test coverage.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "build-prod"]);

function collectJsFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const files = collectJsFiles(ROOT, []);
let failed = false;

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failed = true;
    console.error(`SYNTAX ERROR: ${path.relative(ROOT, file)}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
  }
}

if (failed) {
  console.error(`\nSyntax check failed.`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} file(s).`);
