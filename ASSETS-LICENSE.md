# Assets License

The [MIT License](./LICENSE) in this repository covers the **source code
only** (all `.js`, `.html`, `.css` files, build scripts, and configuration).
It does **not** automatically extend to the bundled artwork below. Each
asset group is licensed as stated here.

## Project-owned artwork (covered by the same MIT terms as the code)

These were created for this project and are not third-party work:

- `build/icon.png`, `build/icon.icns` — the app's own dinosaur mascot icon.
- `src/assets/icons/app-icon.png` — the same icon, resized, used inside the
  Codex re-trust notice window.
- `src/assets/icons/success.svg` — a plain checkmark-in-circle shape;
  generic and not distinctive enough to be separately protectable.

`src/assets/icons/claude.png`/`.svg` and `codex.png`/`.svg` are **not**
project-owned artwork - see the dedicated Font Awesome section below.

## Font Awesome Free icons (`claude.png`/`.svg`, `codex.png`/`.svg`, `update-available.png`/`.svg`)

These icons are from [Font Awesome Free](https://fontawesome.com/),
provided by **Fonticons, Inc.**, used here under the applicable Font
Awesome Free license (see <https://fontawesome.com/license/free>). They are
**not** Agent Pet-owned artwork.

- `src/assets/icons/claude.svg`, `src/assets/icons/codex.svg` are the
  original Font Awesome Free SVG icons, unmodified apart from the fill
  color. Font Awesome's own license/copyright comment is preserved inside
  each file.
- `src/assets/icons/claude.png`, `src/assets/icons/codex.png` are
  **rasterized derivatives of those same Font Awesome Free SVG icons**
  (rendered to a 256×256 PNG for use as an `<img>` badge in the pet UI) -
  the same Font Awesome attribution above applies to them as well.
- `src/assets/icons/update-available.svg` (the desktop update-badge glyph,
  visually a downward arrow into a tray/bracket shape, consistent with Font
  Awesome's "Arrow Down To Bracket" design) is a Font Awesome Free SVG icon,
  unmodified apart from the fill color. It had no embedded Font Awesome
  license comment in this repository; the standard Font Awesome Free v7.3.1
  attribution comment has been added to the file to match the other icons
  above, inferred from consistency with them rather than independently
  re-verified against Font Awesome's own file for this specific icon.
- `src/assets/icons/update-available.png` is a **rasterized derivative of
  that same Font Awesome Free SVG icon** (128×128 PNG, used for the
  right-click menu's update notification item) - the same Font Awesome
  attribution applies to it as well.

"Claude" and "Codex" are used here only as the badge/alert labels to
identify which supported CLI (Claude Code or Codex) a hook event came from.
Any brand names and trademarks referenced by the icon names or by this
project's documentation remain the property of their respective owners
(Anthropic, PBC and OpenAI, respectively). Their use in Agent Pet does not
imply endorsement of, or affiliation with, Agent Pet by either company.

## Dinosaur pet artwork (`src/assets/skin/dinosaur-*.gif`)

The default bundled pet skin (the 12 `dinosaur-*.gif` files under
`src/assets/skin/`) was created specifically for Agent Pet, based on
original creative direction by the project author, with generative AI
assistance.

**Copyright © 2026 Mora Lin. All rights reserved.**

This artwork is project-owned, but it is **not** covered by the MIT License
above - it is licensed separately, as follows:

- You may use, copy, and redistribute this artwork **as bundled with Agent
  Pet** (including in forks, mirrors, or redistributions of this repository
  or its built application that keep the artwork as Agent Pet's default
  pet skin).
- Standalone redistribution of this artwork on its own (outside of Agent
  Pet), resale, repackaging as part of another product, or any other
  commercial use of the artwork independent of Agent Pet, requires separate
  permission from the copyright holder.

## Third-party skins linked from the README

The README points to [codex-pets.net](https://codex-pets.net/) as a source
for *additional/replacement* skins a user can download and apply themselves
via "Import Skin". Those are third-party assets the user opts into
individually at runtime - they are never bundled with this repository or
its builds, so they are out of scope for this file.
