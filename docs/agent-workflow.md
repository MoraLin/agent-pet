# Agent development workflow (Claude Code & Codex)

This is the single source of truth for how an AI agent (Claude Code, Codex, or
any other coding agent working in this repo) should finish a task, validate
it, and commit it. `AGENTS.md` and `CLAUDE.md` at the repo root both point
here instead of duplicating these rules — if you're an agent and something in
your root instructions conflicts with this file, this file wins.

For how a *human* cuts an actual release, see [`docs/releasing.md`](./releasing.md).
This file only covers everyday task commits, which is a different, much more
frequent and much lower-stakes action.

## 1. When a task is done, follow this sequence

1. `git status` and `git diff` — see the full shape of what changed.
2. Run project validation (section 2).
3. If validation passes, write a one-line summary of what changed.
4. `git add` only the files that belong to this task (section 3).
5. Create the commit (section 4).
6. Push the commit (section 7).
7. Report back using the format in section 11.

Never, as part of this flow:
- merge into `main`,
- create or push a release tag (`vX.X.X`),
- trigger a production release (`gh release create`, or anything in
  `.github/workflows/release.yml`).

Those three are decided and executed by a human only — see section 10.

## 2. Validation before commit

Run, in order:

```
pnpm run lint
pnpm test
```

If the task could affect what gets packaged into the app (anything under
`src/main/`, `main.js`, `preload.js`, `index.html`, or `package.json`'s
`build` config), also run:

```
pnpm run build
```

(`build` here means "does the app still start/package," not the release
pipeline — never run the release workflow yourself.)

If a validation step fails:
- **Do not commit.**
- Try to fix the failure if it's within the scope of the current task.
- If you can't fix it, stop and report exactly what failed and why — don't
  commit partial or broken work, and don't skip the check.

If `package.json` gains other scripts later (e.g. a real test suite replacing
`scripts/check-syntax.js`), run whatever `lint`/`test`/`build` resolve to at
the time — this file intentionally doesn't hardcode which tool implements
them.

## 3. Review the diff before staging

Before `git add`, look at:

```
git status
git diff
git diff --staged
```

Confirm:
- nothing unexpected changed,
- no leftover debug code (stray `console.log`, temporary logging taps),
- no secrets, tokens, or credentials,
- no `.env` / `.env.local`,
- no build artifacts (`dist/`, packaged binaries),
- no files unrelated to this task,
- no binary files added by accident.

Never run `git add .` (or `git add -A`) without having already reviewed
`git status` and confirmed every changed file belongs to this task. Prefer
`git add <specific files>`.

## 4. Commit message

Conventional Commits, generated from what actually changed:

```
type(scope): summary
```

Examples:
```
fix(session): preserve help state across concurrent agents
fix(hooks): prevent duplicate Codex hook registrations
feat(update): add new version notification
fix(skins): make skin import atomic
chore(release): prepare v1.2.0
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

Never write a message with no information content, e.g. "update stuff",
"changes", "fix things".

## 5. Commit scope

One clear task → one commit, as a default.

If a task's changes are all part of the same piece of work, keep them in one
commit even if they touch several files. Only split into separate commits
when the change is genuinely two independent, unrelated features or fixes.
Don't chase atomic commits to the point of fragmenting one coherent change
into many tiny ones.

## 6. Release notes

If the change is user-facing — a bug fix, a new feature, a behavior change,
or a compatibility change — update `RELEASE_NOTES.md` (both the English and
中文 sections) as part of the same commit.

If the change is internal only — refactor, tests, docs, CI, cleanup — leave
`RELEASE_NOTES.md` alone unless it has a real user-visible effect.

## 7. Push behavior

After a commit passes validation and diff review, push it — including on
`main`:
```
git push origin <current-branch>
```
or, if it has no upstream yet:
```
git push -u origin <current-branch>
```

The human reviews pushed commits on GitHub after the fact rather than
gating each push beforehand. This doesn't relax anything else in this file —
validation (section 2), diff review (section 3), and the release
restrictions (section 10) still apply exactly as written before any push.

## 8. Pre-existing changes that aren't yours

If the working tree already had uncommitted changes before this task started,
and you can't clearly tell they belong to the current task:

- Do not revert, overwrite, reset, stash, or commit them.
- Stop before staging/committing anything and tell the human what
  pre-existing changes you found.

Never run `git reset --hard`, `git checkout .`, or `git clean -fd` as part of
this workflow.

## 9. Never commit secrets

Before committing, confirm the staged diff contains none of:
`.env`, `.env.local`, API keys, tokens, GitHub PATs, `DOWNLOADS_REPO_TOKEN`,
Upstash credentials, signing certificates, private keys.

Check this even for files covered by `.gitignore` — a file only avoids being
committed because it's ignored if it was never force-added.

## 10. Never automate a release

Even if `package.json`'s version or `RELEASE_NOTES.md` changed as part of a
task, never run:
```
git tag ...
git push --tags
gh release create ...
```
Releases stay human-decided:
human review → merge → human creates `vX.X.X` tag → GitHub Actions release
pipeline (`.github/workflows/release.yml`) takes it from there. See
`docs/releasing.md`.

## 11. Final report format

After finishing (whether or not a commit was made), report:

```
Validation:
- lint: pass/fail
- test: pass/fail
- build: pass/fail/skipped (state why if skipped)

Git:
- branch: ...
- commit: <hash> (or "none")
- message: ...
- pushed: yes/no

Changes:
- <short bullet list of what changed>
```

If no commit was made, state exactly why (validation failure, unrelated
pre-existing changes, task not actually finished, etc.).
