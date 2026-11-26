---
name: aliyun-observability-safety
description: 'Enforce zero-secret local aliyun CLI credentials, dynamic region discovery, read-only-first diagnostics, and latest non-deprecated Alibaba Cloud monitoring tools.'
---

# Alibaba Cloud Observability Safety & Hygiene

- **Zero Secrets in Chat or Loadout**: Never ask for, store, echo, or log `ALIBABA_CLOUD_ACCESS_KEY_ID` or `ALIBABA_CLOUD_ACCESS_KEY_SECRET` in chat, files, or command output. Rely on existing local `aliyun` CLI profiles/SSO (`aliyun configure list` checks status without printing secrets).
- **Dynamic Region Resolution**: Do not assume a hardcoded region. Resolve the target region from the user's request, the active `aliyun` CLI profile, or dynamic discovery (`aliyun ecs DescribeRegions`), and clarify only if multiple regions match.
- **Read-Only Before Mutation**: Querying logs, metrics, traces, datasets, and alert history is safe by default. Always summarize target resources and obtain explicit user approval before creating, modifying, or deleting alert rules, SLS indexes, dashboards, LoongCollector pipelines, or SAS security alert dispositions.
- **Latest Official Tools Only**: Use the unified `alibabacloud-sls` skill instead of superseded standalone SLS skills (`alibabacloud-sls-query`, `alibabacloud-sls-alerting`, `alibabacloud-sls-dashboard`, `alibabacloud-sls-index-config-management`, `alibabacloud-loongcollector-ops`, `alibabacloud-sls-agent-workflow`, `alibabacloud-sls-cli-guidance`, `alibabacloud-sls-sdk-guidance`), and do not recommend the deprecated Python v1 `mcp-server-aliyun-observability` package.
