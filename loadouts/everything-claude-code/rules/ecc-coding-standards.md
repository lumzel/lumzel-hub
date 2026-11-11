---
name: ecc-coding-standards
description: Core ECC coding standards enforcing immutability, small focused files (<800 lines), explicit error handling, and boundary validation.
---

- **Immutability First**: Always return new objects/collections instead of mutating parameters or shared state in place.
- **Many Small Files over Monoliths**: Keep functions under 50 lines, files under 400 lines (800 max), and nesting depth <= 4 levels.
- **Explicit Error Handling**: Handle errors at every I/O and IPC boundary with clear context; never silently swallow exceptions or use bare `.unwrap()` on fallible runtime inputs.
- **Validate at System Boundaries**: Parse and validate all external payloads (user input, API responses, CLI args, file configs) using strict schemas at entry points.
- **No Debug Leftovers**: Remove `console.log`, `dbg!`, and temporary debug prints before finalizing any change.
