# Agent instructions

If you are Codex (or any other coding agent reading this file by convention),
the rules for finishing and committing a task in this repo live in one place:

**[docs/agent-workflow.md](./docs/agent-workflow.md)**

Read that file before ending any task that changes code. In short: run
`pnpm run lint` / `pnpm test` (and `pnpm run build` if the change could affect
the packaged app), review the diff, commit with a Conventional Commit
message, and never merge `main`, create a release tag, or trigger a release
yourself.

For how an actual release is cut (a human-only process), see
[docs/releasing.md](./docs/releasing.md).
