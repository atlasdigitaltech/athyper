# Business Partner 360 operations runbook

Status: Phase 1 release candidate. The feature remains disabled by default (`rollout_pct = 0`) until the evidence gates below pass.

## Safety rules

- Never copy response bodies, request payloads, reveal values, subject identifiers, tax data, bank data, workforce data, or evidence into tickets, logs, dashboard labels, or chat.
- Use only tenant, route template, section code, state, reason code, redaction class, provider, and rollout stage as diagnostic dimensions.
- A security/privacy or contract regression is an immediate rollback signal. Do not suppress the alert to continue a rollout.
- The legacy aggregate route remains available during rollback and retirement observation.

## Promotion procedure

1. Keep `neon.business_partner.view_360` at 0% and enable explicit internal test tenants.
2. Record the eight release-gate approvals and run `evaluateBusinessPartner360Release` with at least 60 minutes and 100 internal requests.
3. Promote only a named canary cohort. Observe for at least 24 hours and 1,000 requests.
4. Broaden only after the evaluator returns `promote`; observe broad rollout for at least seven days and 10,000 requests.
5. At each stage confirm summary p95 ≤ 500 ms, section p95 ≤ 750 ms, errors ≤ 1%, MESH fallback ≤ 5%, summary p95 payload ≤ 75 KiB, and section p95 payload ≤ 100 KiB.

The guarded controller supports only `status`, `enable-internal`,
`promote-canary`, `promote-broad`, `rollback`, and `retirement-check`. It has no
legacy deletion action. Use `status` before every proposed transition:

```sh
pnpm --filter @athyper/server-db db:operate:neon:business-partner-360-rollout -- \
  --action=status \
  --database-url=postgresql://postgres@127.0.0.1:55432/athyper_neon \
  --environment=local
```

Mutation commands require an exact action/environment confirmation and actor
UUID. Internal enable requires all eight approval records. Canary requires the
latest internal observation to return `promote`; broad requires the latest
canary observation to return `promote`. The controller serializes changes with
an advisory lock and writes only named tenant overrides until broad promotion.

After the minimum live window, record a stage observation from Prometheus with
`db:record:neon:business-partner-360-observation`. The observer refuses an
inactive/mismatched rollout stage, incomplete approvals, a short window, absent
metrics, or a non-local build-stage database. It records the request count,
SLOs, payloads, definition failures and legacy aggregate calls without subject
dimensions.

Use the **Business Partner 360 — Release and Operations** dashboard. Save a time-bounded dashboard snapshot and approval references; never export raw event bodies.

## Operational rehearsal

Run the guarded rehearsal only against the local disposable acceptance database:

```sh
pnpm rehearse:bp360:operations -- \
  --confirm=RUN-BP360-OPERATIONAL-READINESS \
  --neon-database-url=postgresql://postgres@127.0.0.1:55432/athyper_neon \
  --approval-ledger=docs/architecture/evidence/business-partner-360-release-approvals.json \
  --output=docs/architecture/evidence/business-partner-360-operational-readiness.json
```

The command fails closed for a non-local or differently named database. It
rehearses STUDIO fallback, MESH degradation, stale cursor, permission-epoch,
materialization rollback and reveal controls; evaluates safe synthetic metrics;
validates the dashboard and production Alertmanager routing; and reports
approval completeness. It never sends email or pages a real receiver.

For the supervised on-call/support exercise, assign one incident commander, one
service operator, one Security/Privacy responder and one support analyst. Give
them only these synthetic cases: definition absent, MESH timeout, stale cursor,
materialization failure and suspected reveal leakage. Require each participant
to identify the owning section, safe evidence fields, escalation target,
rollback trigger and recovery check from this runbook. Record participant IDs,
timestamps and a durable restricted evidence reference outside this document.
Do not mark Operations or Resilience approved until the supervised exercise and
real notification-path acknowledgement are recorded.

The checked-in approval ledger is deliberately pending. Each of functional,
data, security/privacy, contract, performance, resilience, UX and operations
requires exactly one `approved` record with an accountable approver, offset-aware
timestamp and durable evidence reference. A boolean test result is not an
approval.

## Rollback

Set the feature rollout to 0% and remove explicit tenant assignments. Confirm the canonical route renders the compatibility experience, in-flight 360 calls drain, and no new reveal command is accepted from the disabled UI. Roll back application code only if database migrations are forward-compatible; do not remove typed rows or indexes during an incident. Page Security for privacy/authorization failures and the owning service team for SLO/resilience failures.

## Definition fallback

When `BP_360_DEFINITION_UNAVAILABLE` rises, verify publication compatibility and the last-valid local definition. Canonical identity must remain available and completeness must fail closed. Roll back rollout if no compatible last-valid definition exists. Never hand-edit a requirement pack in NEON.

## MESH outage or incompatible response

Confirm only Network is degraded and local received/accepted/published evidence remains visible with stale/unavailable provenance. The adapter budget is 1.5 seconds. Check relationship authorization and schema compatibility without replaying person/workforce payloads. Disable the live adapter if fallback exceeds 5%; core 360 stays enabled unless another gate fails.

## Stale cursor

Confirm the client receives the stable stale-cursor reason, clears only the affected section page chain, and restarts from the first opaque cursor. Do not decode or modify cursor contents. Escalate repeated cursor invalidation with route template, section, tenant, and observation window only.

## Permission change or purpose expiry

Advance the permission epoch, invalidate all caller-scoped query keys, abort in-flight requests, close sensitive drawers, and verify the next request is re-authorized. A reveal after purpose/elevation expiry or a replay attempt must fail and create a safe audit event.

## Failed materialization

Verify the request remains retryable or failed according to its owning workflow and that BP master rows, typed children, snapshot, audit, outbox, and request status did not partially commit. Compare the application fingerprint and stable reason code; do not inspect unrestricted JSON for restricted values.

## Reveal incident

Immediately set the feature to 0% for affected tenants, revoke active elevation/reveal capability, preserve access-audit identifiers, and page Security and Privacy. Scan API/log/snapshot/HTML/analytics/browser artifacts using value hashes or synthetic canaries, never by printing production secrets. Record purpose, expiry, redaction class, command outcome, and affected time window. Resume only after security/privacy gates are rerun and approved.

## Support triage

For a support case capture time window, tenant, route template, section, state/reason, permission epoch, rollout stage, and correlation ID. Classify as visibility, scope, definition, section provider, MESH fallback, stale cursor, or materialization. Deep-link to the owning module; do not request screenshots of revealed values.

## Legacy retirement

Retirement is a separate change. `evaluateBusinessPartner360Retirement` must report approved after zero known consumers and zero legacy calls for 30 consecutive days, v1 compatibility passes, at least three distinct owner approvals are recorded, and rollback is approved. Remove the endpoint and monolithic component only in that separately reviewed change.

The governed consumer inventory includes the UI rollback fallback, gateway
operation, HTTP compatibility route, service adapter and repository delegate.
Migrate the UI consumer only after broad rollout is stable; retain the other
boundaries until the separate retirement review. The 30-day traffic evidence
must come from a telemetry store with at least 30 days of retention or from a
durable sequence of approved daily observations. A local 24-hour Prometheus
store cannot qualify retirement.
