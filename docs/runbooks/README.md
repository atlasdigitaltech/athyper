# Operational Runbooks

**Status:** Final — ops-validated Sprint 44 (44-11), published Sprint 46  
**Linked from:** `GET /docs` (Swagger UI → Guides → Runbooks)

Runbooks for the most operationally critical subsystems in the athyper platform.
All six runbooks were validated end-to-end by the ops team in staging during Sprint 44 (task 44-11).

| # | Runbook | System | Priority | Status |
|---|---------|--------|----------|--------|
| RB-01 | [Outbox Drain Monitoring + Recovery](rb-01-outbox-drain.md) | INT — event.outbox / BullMQ | P1 | Final |
| RB-02 | [Audit Partition Lifecycle](rb-02-audit-partition-lifecycle.md) | AUD — log.audit_log monthly partitions | P1 | Final |
| RB-03 | [Legal Hold Activation + Release](rb-03-legal-hold.md) | AUD/GOV — governance.legal_hold | P1 | Final |
| RB-04 | [IdP / Keycloak Sync Troubleshooting](rb-04-idp-kc-sync.md) | IAM — master.principal / KC admin API | P1 | Final |
| RB-05 | [Workflow Recovery: Stuck Instances](rb-05-workflow-recovery.md) | WFL — event.work_item / WorkflowEngine | P1 | Final |
| RB-06 | [Descriptor Cache Invalidation](rb-06-descriptor-cache.md) | META — Redis / snapshot.entity_compiled | P2 | Final |

## Conventions

- **SQL blocks** — run against the tenant's database with `app_role` unless otherwise noted.
- **API calls** — use an internal service token or `ops-admin` role; replace `{tenant}` and `{id}` placeholders.
- **BullMQ** — all queue operations via Bull Board UI at `/admin/jobs` or via `redis-cli`; see each runbook for exact key patterns.
- **Severity**: P1 = revenue-impacting or compliance-blocking; P2 = degraded UX, no data loss.
