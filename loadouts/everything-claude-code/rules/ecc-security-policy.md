---
name: ecc-security-policy
description: Mandatory ECC security guardrails against secret leakage, injection vectors, and broken access control.
---

- **Zero Hardcoded Secrets**: Never write API keys, tokens, passwords, or private keys into source code, tests, or committed configs.
- **Injection Defense**: Use parameterized queries for all database operations, argument arrays (never shell string concatenation) for child processes, and canonical path validation against directory traversal.
- **Least Privilege & Auth Checks**: Verify caller identity and resource ownership on every mutating operation.
