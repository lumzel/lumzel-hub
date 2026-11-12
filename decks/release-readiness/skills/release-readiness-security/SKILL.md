---
name: release-readiness-security
description: Perform a pre-release security, secret exposure, dependency risk, and permission boundary audit on pending release changes.
disable-model-invocation: true
---

# Release Security & Credential Audit

Audit the workspace and release diff for security regressions before publishing or deploying.

## Procedure

1. **Secret & Credential Hygiene**: Check tracked files and recent diffs for hardcoded tokens, API keys, private keys, `.env` leaks, debug endpoints, orunsafe default credentials.
2. **Permission & Trust Surface**: Review changes to auth middleware, capability manifests, CORS/CSP rules, shell/process execution, file path handling, and SQL/command interpolation.
3. **Dependency & Supply-Chain Changes**: Inspect lockfile and manifest diffs (`pnpm-lock.yaml`, `package-lock.json`, `Cargo.lock`, `uv.lock`, `go.sum`) for newly added packages, unpinned git dependencies, or install scripts. Run native audit commands if available offline/locally without modifying files.
4. **Findings Report**: Rank findings by severity (`Critical`, `High`, `Medium`, `Low`), citing `file:line`, concrete exploit/failure scenario, and minimal remediation. Explicitly note any checks that passed cleanly.
