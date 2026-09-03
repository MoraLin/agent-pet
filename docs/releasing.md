# Releasing Agent Pet

## Day-to-day (every change, not just releases)

1. Make the change.
2. Run `pnpm run lint && pnpm run test` locally (currently both run `scripts/check-syntax.js` - see the note below).
3. Update `RELEASE_NOTES.md` with what changed, under the section matching the *next* version (Stability fixes / New features / Behavior changes, English and 中文).
4. Commit / open a PR as usual. A human reviews and merges to `main`.

`RELEASE_NOTES.md` is reviewed like any other file in the PR - by the time a release happens, its content has already been read by a human, not generated on the fly.

## Cutting a real release

1. Bump `"version"` in `package.json` (e.g. `1.1.0` → `1.2.0`).
2. Confirm `RELEASE_NOTES.md`'s top section (`# Agent Pet v1.2.0`) matches the new version and reads the way you want the public release notes to read.
3. Commit and merge that to `main`.
4. Tag and push:
   ```
   git tag v1.2.0
   git push origin v1.2.0
   ```
5. GitHub Actions (`.github/workflows/release.yml`) takes it from there:
   - verifies the tag matches `package.json`'s version (fails the run if not),
   - runs lint + test,
   - builds macOS (arm64 + x64) and Windows on native runners,
   - if everything passes, publishes a GitHub Release to `MoraLin/AgentPet-Downloads` with `RELEASE_NOTES.md` as the body and the three installers attached.
6. Watch the Actions run. If the release job fails because a release for that tag already exists, it did **not** overwrite anything - delete the existing release on `AgentPet-Downloads` first if that's really what you want, then re-run.

Nothing in this pipeline pushes a tag, publishes a release, or overwrites an existing one on its own - a human always runs step 4.

## One-time GitHub setup

- Create a fine-grained personal access token scoped **only** to `MoraLin/AgentPet-Downloads`, with **Contents: Read and write** permission and nothing else.
- Add it as a repository secret on this repo (the source repo, not Downloads) named `DOWNLOADS_REPO_TOKEN`.

## Note on lint/test

`pnpm run lint` and `pnpm run test` currently both call `scripts/check-syntax.js`, which only runs `node --check` on every project `.js` file - it catches syntax errors, not logic bugs or regressions. There is no real ESLint config or test suite yet. Replace these scripts (and this note) once real tooling exists; the release workflow will pick up whatever `lint`/`test` do without changes.
