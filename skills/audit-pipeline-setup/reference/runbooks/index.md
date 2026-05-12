# Runbook Index

> Pipeline: S1-S5 staged document audit
> Domain: Incident-response runbooks
> Creator agent: Claude Code
> Auditor agent: Claude Code

| # | Item | Title | S1 Creator | S2 Auditor | S3 Creator | S4 Auditor | S5 Auditor | Start | End | Total |
|---|------|-------|------------|------------|------------|------------|------------|-------|-----|-------|
| 1 | 01-high-api-latency | API latency exceeds SLA threshold | done | done | done | done | done | 2026-05-01T09:00+02:00 | 2026-05-01T09:42+02:00 | 42m |
| 2 | 02-database-connection-pool | Database connection pool exhaustion | done | done | done | done | done | 2026-05-01T09:42+02:00 | 2026-05-01T10:18+02:00 | 36m |
| 3 | 03-dead-letter-queue-buildup | Dead letter queue depth exceeds threshold | done | in-progress | not-started | not-started | not-started | 2026-05-01T10:18+02:00 | | |
| 4 | 04-certificate-expiry | TLS certificate expiring within 7 days | todo | not-started | not-started | not-started | not-started | | | |
| 5 | 05-disk-usage-critical | Disk usage exceeds 90% on persistent volumes | not-started | not-started | not-started | not-started | not-started | | | |

---
Meta-audit: pending

## Retroactive Governance Pass

| # | Item | S6 Verdict | S6 Findings | S7 Rewrite | S8 Confirm |
|---|------|-----------|-------------|------------|------------|
| 1 | 01-high-api-latency | not-started | | not-started | not-started |
| 2 | 02-database-connection-pool | not-started | | not-started | not-started |
| 3 | 03-dead-letter-queue-buildup | — | | — | — |
| 4 | 04-certificate-expiry | — | | — | — |
| 5 | 05-disk-usage-critical | — | | — | — |
