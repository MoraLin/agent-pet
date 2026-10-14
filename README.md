# Agent Pet

**English** ・ [繁體中文](./README.zh-TW.md)

Agent Pet is a desktop pet (an Electron app) that reacts to what your AI coding companion — Claude Code or Codex CLI — is doing in real time. It switches animation to match the agent's current state: idle, working, reading code, needs help, error. The pet's entire look comes from a set of GIF files, so you can swap it for any compatible character pack whenever you want.

🌐 [Official site](https://agent-pet-site.vercel.app) ・ 📦 [GitHub Releases](https://github.com/MoraLin/AgentPet-Downloads/releases)

## Features

- Idles and wanders on its own when nothing's happening, occasionally hopping or dashing across the screen
- Switches animation live as Claude Code / Codex works: typing away, reading code, needing help, hitting an error, and more
- The pet's look is entirely GIF-driven — swap the whole skin from the right-click menu, no coding required
- Desktop builds available for macOS (Apple Silicon / Intel) and Windows

## Supported agents

- Claude Code (CLI / VS Code extension / terminal)
- Codex CLI

**Not currently supported: the Claude desktop app (the claude.ai app) or the ChatGPT desktop app.** Neither exposes the same hooks mechanism that lets an external program receive work-status events, so installing Agent Pet alongside them would just show a pet wandering on its own, never reacting to your conversation.

## Download / Getting started

The fastest way to get started is downloading a prebuilt release:

- **[GitHub Releases](https://github.com/MoraLin/AgentPet-Downloads/releases)** — installers for macOS (Apple Silicon / Intel) and Windows

For what to expect when you first open it (and the OS security warnings you may see), see "Unsigned beta builds" below. To modify the code or build it yourself from source, see "Development" / "Build" below.

## Custom pets

The pet's entire look comes from a set of GIF files, matched to animations by **keyword in the filename**, not a hardcoded filename — so swapping in a new pet just takes:

1. Grab a character's GIF pack from [codex-pets.net](https://codex-pets.net/) (or draw your own set, as long as the filenames follow the keyword rules below).
2. Right-click the pet and choose **"Import Skin..."**, then pick the extracted folder. The app checks that folder for all the required GIFs — if everything's there, it applies the new skin immediately; if anything's missing, it tells you exactly what, instead of applying a half-broken set.

Filenames follow the pattern `<any-prefix>-<keyword>.gif` (e.g. `dinosaur-idle.gif`). The keywords are:

| Keyword                                            | Maps to                                                 |
| --------------------------------------------------- | -------------------------------------------------------- |
| `idle`                                              | Idle, greeting, being petted                              |
| `running-left` / `running-right`                    | Casual wandering, a random dash (direction picks the file) |
| `running`                                           | Working in place (typing, thinking, organizing context, etc.) |
| `jumping`                                           | A random hop                                              |
| `review`                                            | Reading code                                               |
| `waiting`                                           | Impatient (detected as stuck)                              |
| `waving`                                            | Needs help (a permission prompt)                            |
| `failed`                                            | Error (a tool call failed)                                 |
| `look-left-side` / `look-right-side` (**optional**) | Asleep after being idle too long (direction picks the file) |
| `success` (**optional**)                            | A turn just finished — falls back to the idle pose without this |
| `eating` (**optional**)                             | An occasional idle snack-break flourish                     |
| `playing` (**optional**)                            | An occasional idle play flourish                            |

A missing **optional** keyword just falls back to another pose, or simply never triggers that flourish; every other keyword needs a matching file. For the deeper animation/skin rules (adding a custom animation, how the default skin is seeded in dev), see [`docs/ANIMATION_GUIDELINES.md`](./docs/ANIMATION_GUIDELINES.md).

## How it works

```
Claude Code / Codex hook  ->  local Agent Pet event receiver  ->  pet animation state
```

Agent Pet runs an event receiver in the background, bound only to your own machine (`127.0.0.1`). On launch it automatically configures the hooks for both Claude Code and Codex — no settings file to hand-edit. When a hook fires, the event is sent to this receiver, and Agent Pet switches the pet's animation based on what it says.

Codex works a little differently: whenever the hook command's content changes, Codex asks you to re-review and re-trust it in `/hooks`. That's Codex's own security mechanism, not a bug — Agent Pet detects this and shows a notice telling you what to do.

## Development

Requires [pnpm](https://pnpm.io/) (this project is managed with pnpm, not npm) and Node.js `>=22.13`.

```bash
git clone <this-repo>
cd AgentPet
pnpm install
pnpm start
```

Validate:

```bash
pnpm run lint
pnpm test
```

The pet launched via `pnpm start` lives as long as that terminal window does. If you want it to start on login and relaunch after a crash, macOS has LaunchAgents, and Windows/Linux have Task Scheduler / a systemd user service respectively — same idea, check your platform's own docs for the details.

## Build

```bash
pnpm run dist        # macOS, Apple Silicon (arm64) → dist/Agent-Pet-arm64.dmg
pnpm run dist:x64    # macOS, Intel (x64)          → dist/Agent-Pet-x64.dmg
pnpm run dist:win    # Windows x64 (portable .exe) → dist/Agent-Pet-win.exe
```

The three commands don't affect each other and can each be re-run independently. To share the app with someone, just hand them that one file — no need for the whole project folder, and they don't need Node.js installed either.

## Unsigned beta builds

Agent Pet is still in beta, and the macOS and Windows builds are **not code-signed yet**. You may see an OS security warning when you first open it — this is expected, not a sign the file is broken:

- **macOS**: a file that traveled over the network (carrying a quarantine flag) may show "is damaged and can't be opened" instead of "unidentified developer" — it isn't actually damaged, that's just how the OS handles an unsigned app.
- **Windows**: SmartScreen usually blocks it — click "More info" → "Run anyway" to continue. If "Smart App Control" is enabled, unsigned apps are blocked outright with no "Run anyway" option.

If you'd rather not run an unsigned executable, see "Development" / "Build" above and build it yourself from source after reviewing the code. **We don't recommend disabling Smart App Control or any other OS security protection just to run Agent Pet** — unsigned doesn't mean dangerous, but it doesn't mean fully safe either, so use your own judgment.

## Documentation

- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — want to contribute code
- [`docs/SECURITY.md`](./docs/SECURITY.md) — reporting a security issue
- [`docs/ASSETS-LICENSE.md`](./docs/ASSETS-LICENSE.md) — licensing for pet art/icons
- [`docs/ANIMATION_GUIDELINES.md`](./docs/ANIMATION_GUIDELINES.md) — deeper details on the animation/skin system
- [`docs/agent-workflow.md`](./docs/agent-workflow.md) — the workflow an AI coding agent (Claude Code / Codex) should follow when helping develop this project

## License

The source code is MIT licensed — see [`LICENSE`](./LICENSE). The pet GIF art and some icons are **not covered by the MIT license** — see [`docs/ASSETS-LICENSE.md`](./docs/ASSETS-LICENSE.md).
