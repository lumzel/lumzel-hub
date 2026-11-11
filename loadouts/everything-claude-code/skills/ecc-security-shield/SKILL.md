---
name: ecc-security-shield
description: Perform an OWASP Top 10 and AgentShield security audit across code changes, secrets, auth boundaries, and dependencies.
---

# ECC Security Shield Audit (`AgentShield`)

Run a comprehensive security review across modified files, configuration, and dependencies before shipping.

## Audit Checklist

1. **Secrets & Credentials**:
   - Zero hardcoded API keys, tokens, private keys, or connection strings in source, tests, or config files.
   - Verify `.env*` files are ignored and secrets are read from validated environment variables or secret stores.
2. **Input Validation & Injection Defense**:
   - Validate all external inputs at system boundaries (schema validation via Zod/serde/pydantic).
   - Parameterized queries only (no string-interpolated SQL); no unescaped shell command concatenation; sanitize HTML/Markdown rendering against XSS.
3. **Authentication & Authorization**:
   - Verify resource-level ownership checks (IDOR prevention), session/token expiration, and least-privilege permissions.
4. **Error Handling & Information Disclosure**:
   - Never leak stack traces, internal paths, or secret values in user-facing error responses or logs.
5. **Dependency & Supply Chain**:
   - Flag known vulnerable packages, unpinned execution scripts, or unsafe deserialization.
