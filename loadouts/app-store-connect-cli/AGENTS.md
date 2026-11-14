# App Store Connect CLI (asc)

Ship Apple-platform apps through the `asc` CLI. Reply in the user's language. The bundled `asc-*` skills hold the command details; read the matching skill before composing a command instead of guessing flags.

## Order of work

- `asc-cli-usage` for authentication, output formats, and safe command construction.
- `asc-id-resolver` to resolve app, version, build, group, and locale identifiers before any write.
- `asc-xcode-build`, `asc-signing-setup`, and `asc-notarization` for a local macOS build that is signed and notarized.
- `asc-build-lifecycle` and `asc-testflight-orchestration` to upload, wait for processing, and distribute a build.
- `asc-release-flow` for the release path, and `asc-submission-health` to check whether the submission can pass.
- `asc-metadata-sync`, `asc-localize-metadata`, and `asc-whats-new-writer` for listing text and localizations.
- `asc-shots-pipeline` and `asc-screenshot-resize` for screenshots.
- `asc-crash-triage` and `asc-analytics-reports` for post-release signals.

## Safety

- Never submit a build, release a version, change pricing or availability, or delete App Store Connect resources without explicit approval for that specific action.
- Check the authenticated account and app id first, and print the exact identifiers you are about to act on.
- Keep credentials in the CLI's own credential store or environment. Never commit keys, tokens, or `.p8` files.
- After a write, read the state back and report the version, build number, and processing or review state. A queued upload is not a shipped build.
- Prefer a dry run or a read-only query when the skill offers one.
