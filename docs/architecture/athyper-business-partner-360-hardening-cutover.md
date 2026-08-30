# Business Partner 360 hardening, cutover, and retirement

Status: In progress (BS360-10); P0 database/service security evidence passed, browser capture and independent approval pending

## Implemented controls

- Safe bounded route telemetry covers latency, response size, section/state/reason, completeness, redaction, reveal outcome, and MESH fallback without BP, principal, cursor, purpose text, or field values as labels.
- Grafana dashboards and Prometheus alerts cover summary/section SLOs, errors, payloads, completeness fallback, redaction/reveal, materialization failures, MESH fallback, and legacy traffic.
- The release feature is seeded as an experiment at 0%; existing operator rollout state is never overwritten by DDL replay.
- Promotion and legacy retirement are independently evaluated. A privacy, contract, definition, or exceeded-threshold result demands rollback.
- Query keys include tenant, principal, BP, section, role, organization, company, legal entity, effective date, permission epoch, and cursor where applicable.
- The responsive shell provides a mobile section picker, focus transfer after URL navigation, visible keyboard focus, 44px targets, 320px reflow, and logical RTL alignment.
- Tenant-leading indexes were added only for the bounded request history, bank verification, and effective certification readers identified by the Phase 1 access paths.
- The disposable [P0 security, privacy and data-integrity evidence](./athyper-business-partner-360-security-privacy-evidence.md) now records live forced-RLS/IDOR/scope matrices, six transactional rollback probes, concurrency/replay results, restricted-value scans and person/workforce boundaries. Independent approval is still required before canary.

## Release evidence ledger

| Gate | Repository evidence | Remaining environment evidence |
| --- | --- | --- |
| Functional | Seven fixture families, manifest/policy/service tests, governed action contracts | Full acceptance journey against a release environment |
| Data | Typed materialization and authoritative reader tests | Production-shaped reconciliation sample |
| Security/privacy | Disposable live RLS/IDOR/scope/owner matrices, six-stage rollback, replay/expiry guard, risk-negative and restricted-value scans, person/MESH/export denials | Independent security/privacy review and approval |
| Contract | v1 parsers, compatibility adapter, risk-negative schemas | Consumer compatibility certification |
| Performance | Bounded readers, cursor contracts, tenant-leading indexes, SLO alerts/gates | `EXPLAIN (ANALYZE, BUFFERS)` on high-cardinality sanitized data and browser timing evidence |
| Resilience | Definition fallback, isolated MESH fallback, release evaluator | Injected STUDIO/MESH failure rehearsal |
| UX | Keyboard/focus/target/reflow/RTL implementation checks | WCAG 2.2 AA assistive-technology, browser, localization, zoom and contrast sign-off |
| Operations | Dashboard, alerts, rollout/retirement evaluator, operations runbook | On-call rehearsal and owner approvals |

No row marked as remaining may be treated as passed from repository evidence alone. Canary enablement and legacy deletion are intentionally not performed by this build.

The available development NEON database was inspected read-only on 2026-08-30. The three target relations contained estimated cardinalities of 1, 0, and 0 rows, and the release-index migration was not yet applied there. It is therefore unsuitable for high-cardinality `EXPLAIN (ANALYZE, BUFFERS)` evidence; no performance claim is derived from it and no migration was applied solely for this check.

## Cutover invariants

The canonical URL does not change. Scope and permission changes abort requests and invalidate only exact caller/scope coordinates. Historical views remain read-only. Unsupported providers degrade their own section. The compatibility endpoint is monitored but not expanded. Database changes are additive throughout rollout so feature rollback does not require destructive data rollback.
