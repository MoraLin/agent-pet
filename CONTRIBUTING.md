# Contributing

Thanks for considering a contribution to Agent Pet.

## Getting set up

```bash
pnpm install
pnpm start
```

See [README.md](./README.md) for full development, build, and packaging
instructions.

## Before opening a pull request

```bash
pnpm run lint
pnpm test
```

Both currently run `scripts/check-syntax.js` (a `node --check` pass over
every project file) - there's no full test suite yet, so please still
manually run the app and exercise the change you made.

If your change could affect what gets packaged into the app (anything under
`src/main/`, `main.js`, `preload.js`, `index.html`, or `package.json`'s
`build` config), also run `pnpm run build:prod` to confirm the production
bundle still builds.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), e.g.:

```
fix(hooks): prevent duplicate Codex hook registrations
feat(update): add new version notification
```

## Scope

Keep pull requests focused on one change. Match the existing code style,
and avoid unrelated refactors in the same PR - it makes review much faster.

## Releases

Releases (version bumps, git tags, and publishing) are handled by the
maintainer only - please don't include a version bump in a contribution PR
unless asked to.

## Reporting bugs

Open a GitHub issue with steps to reproduce, your OS, and (if the pet isn't
reacting to hook events) the relevant lines from `logs/events.log`. For
security issues, see [SECURITY.md](./SECURITY.md) instead of a public issue.
