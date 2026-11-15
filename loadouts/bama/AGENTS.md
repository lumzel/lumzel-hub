# BAMA: Build Any Mac App

Build native macOS apps end-to-end with Swift and SwiftUI. Based on [daveebbelaar/bama](https://github.com/daveebbelaar/bama) by Dave Ebbelaar (MIT License; see bundled `LICENSE`). Reply in the user's language.

## Workflow Path

Follow the BAMA pipeline from idea to verified native macOS app:

```text
idea -> research -> clone (optional) -> app-brief -> user-stories -> new-mac-app
     -> mac-design + design-system + app-icon -> improve-loop (ux, code, design, verify, commit) -> repeat
```

When the user asks where to start or gives an open-ended request, start with `bama` to route to the next skill. Read the matching skill's `SKILL.md` and its sibling references before acting.

## Bundled Skills by Stage

- **Start**:
  - `bama`: pipeline router that identifies the current project state and next skill.
  - `app-brief`: turns an idea, research, or BAMA spec into a one-page `docs/BRIEF.md`.
  - `new-mac-app`: scaffolds a working Swift Package `.app` bundle (Swift 6.2, SwiftData, `build.sh`, Icon Composer icon, snapshot mode, self-test, 4pt grid checks, git).
- **Plan**:
  - `research`: parallel research tracks (Market, Reviews, Features, Design, Platform) saved to `docs/research/`.
  - `clone`: walks an existing Mac, Electron, or web app, saves full-resolution screenshots, and writes `docs/screens/INDEX.md`.
  - `user-stories`: turns a brief, research, or screen index into milestone stories with checkable `[snap]`, `[self]`, and `[unit]` acceptance criteria in `docs/STORIES.md`.
- **Design**:
  - `ux-design`: per-story UX pass covering naming, flow, presentation surface, states, wording, and accessibility (`UX:` block + `docs/GLOSSARY.md`).
  - `mac-design`: native macOS 26+ & Liquid Glass rules, app shells, toolbars, menus, settings, patterns, and `scripts/hig.sh` to query Apple HIG pages.
  - `design-system`: native look with user-selectable accent colors, Swift tokens (`UI/Theme.swift`), and `design/DESIGN-SYSTEM.md`.
  - `layout-grid`: 4pt `Space` scale plus `tools/grid-lint.sh`, `tools/check-layout.swift`, and a debug grid overlay.
  - `design-kit`: custom branded UI components, three token layers, custom window chrome, and an interactive parts gallery.
  - `design-from-app`: measures sizes, typography, and colors from reference screenshots (`scripts/measure.swift`) and compares pixel diffs (`scripts/compare.swift`).
  - `app-icon`: authors a Liquid Glass Icon Composer `.icon` bundle and renders an all-appearances review sheet via `ictool`.
- **Code**:
  - `swift-swiftui`: Swift 6 main-actor concurrency, `@Observable`, SwiftData, AppKit bridges, and compiler diagnostics.
  - `os-integrations`: global hotkeys, menu bar extras, floating `NSPanel`, Accessibility (`AXUIElement`), `ScreenCaptureKit`, Shortcuts/App Intents, URL schemes, and permissions.
  - `performance`: measure-first profiling with `sample`, `xcrun xctrace` (`Time Profiler`, `Hangs`, `Animation Hitches`, `Allocations`, `Energy Log`), `footprint`, `leaks`, and GPU compositing.
  - `improve-architecture`: milestone architecture check-in for hot spots, deeper modules, seams, and behavior-preserving refactors.
  - `agent-cli`: adds a binary CLI, local Unix socket bridge, and optional MCP server (`<app> mcp`) so agents can drive the running app live.
- **Ship**:
  - `build-and-verify`: runs `./build.sh`, captures light/dark window snapshots and layout probes, runs grid checks, and requires visual inspection of every rendered PNG.
  - `test-mac-app`: Swift Testing unit tests in `<App>KitTests`, `--selftest` on a `/tmp` store, key/menu audits, and debug bridge verification.
  - `improve-loop`: autonomous story-by-story build, snapshot, compare, fix, and single-story commit loop across a milestone.

## Lumzel Runtime Adaptations

Upstream BAMA skills were authored as a bucketed Claude Code / Codex plugin (`skills/<stage>/<name>/`). In Lumzel, all skills are installed flat under `skills/<name>/`:

- **Cross-skill links & skill calls**: When a `SKILL.md` says `Call the Skill tool with <name>`, read and follow the installed `<name>` skill (`SKILL.md` and its sibling references). Resolve cross-bucket relative links such as `../../design/mac-design/patterns.md`, `../../ship/build-and-verify/existing-app.md`, or `../../code/os-integrations/recipes.md` to the sibling skill directory (`../mac-design/patterns.md`, `../build-and-verify/existing-app.md`, `../os-integrations/recipes.md`).
- **Skill scripts & templates**: Resolve `${CLAUDE_SKILL_DIR}` to the current skill's installed directory (next to its `SKILL.md`), where `scripts/` and `template/` are bundled.
- **Parallel research (`research`)**: Use Lumzel's `invoke_subagent` (with `research` or `self` subagents) alongside `search_web` / `read_url_content` to execute parallel research tracks.
- **Computer use & browser (`clone`, `test-mac-app`)**: Use Lumzel's built-in `built-in-computer-use` (`computer_*` tools) for native/Electron macOS apps and `built-in-browser` (`browser_*` tools) for web apps instead of Claude-specific `mcp__computer-use__*` names.
- **Upstream example specs**: BAMA's 12 reference app specs (`window-snapper.md`, `window-switcher.md`, `launcher.md`, `clipboard-history.md`, `text-snippets.md`, `color-picker.md`, `screenshots.md`, `screen-recorder.md`, `menu-bar-stats.md`, `toolbox.md`, `creator-tools.md`, `dev-toolkit.md`) live upstream at `https://github.com/daveebbelaar/bama/tree/main/specs`.

## Requirements & Guardrails

- **Toolchain**: Targets macOS 26+ and Xcode 26+ (Swift 6.2). On macOS 15, update `Package.swift` to `.macOS(.v15)` and `Info.plist.in` `LSMinimumSystemVersion` to `15`, and avoid Liquid Glass APIs.
- **Permissions**: Full-resolution window capture (`window-shot.sh`, `tools/snap.sh`) requires **Screen Recording** permission for the host terminal/app; `clone` computer-use and Accessibility-based features require **Accessibility** permission in System Settings.
- **Code signing**: `build.sh` uses an `Apple Development` certificate if available or ad-hoc signing otherwise (ad-hoc builds re-prompt for TCC permissions after rebuilds).
- **Network**: `mac-design/scripts/hig.sh` fetches Apple Human Interface Guidelines JSON from `developer.apple.com` and caches it in `~/Library/Caches/bama/hig/`.
- **Data safety**: Never run self-tests, seed data, or snapshots against a user's real database in `~/Library/Application Support/<App>/` (`APP_STORE` must stay in `/tmp`). Never commit `.trace` files or reference app screenshots (`docs/screens/*.png`) to public repositories.
