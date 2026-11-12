---
name: owasp-security-audit
description: Systematic security and reliability audit checklist for code changes, IPC boundaries, and file operations.
---

# Security & Reliability Audit Checklist

1. **Trust Boundaries**: Identify every untrusted input (network responses, git repositories, user-supplied paths, iframe messages).
2. **Filesystem Safety**: Ensure paths are validated against `..`, symlinks, and root escapes; use atomic writes via temp files.
3. **Command Execution**: Pass arguments as arrays rather than shell-interpolated strings.
4. **Secrets Hygiene**: Verify no credentials leak into error strings, logs, or frontend state.
