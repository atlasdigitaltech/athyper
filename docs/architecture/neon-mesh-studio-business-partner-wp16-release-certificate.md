# Business Partner WP16 release certificate

Status: **candidate — deployment approval pending**

Release date: 2026-08-28

Scope: NEON internal onboarding plus governed MESH profile/bank event delivery to NEON

## Automated evidence

| Gate | Required result | Evidence status |
|---|---|---|
| MESH delivery typecheck | pass | pass |
| MESH delivery/security/privacy/load tests | all pass | pass — bounded 100-event drain, quarantine, retry, reconciliation and telemetry-label privacy |
| Platform host typecheck | pass | pass |
| Platform host regression | all pass | pass — 89 tests |
| NEON projection/account-bank regression | all pass | pass — 27 tests and typecheck |
| Database contract suite | all pass or accepted unrelated baseline | pass — 122 tests; 71 seed files linted |
| Prometheus rule validation | both configurations valid | pass — three rule files and active seven-file configuration validated by Prometheus 3.11.2 `promtool` |
| Runtime image | immutable digest, API/worker/scheduler parity | candidate built — `sha256:258498c76645cb3fe4cfff6e71501fc266d01f6fed2a39dbff61a67ab9295e20`; staged parity deployment pending |
| Live delivery/reconciliation | exact event receipt and zero unexplained drift | pending staged environment |
| DR/replay rehearsal | restored isolated planes reconcile with no master writes | pending release exercise |
| Rollback rehearsal | flags off, leases preserved, prior image healthy | pending release exercise |

## Security and privacy assertions

- Cross-plane worker consumes only five allowlisted MESH Business Partner event types.
- Recipient tenant and event ID must be UUIDs before delivery.
- NEON services revalidate schema, hash, recipient binding, ordering, relationship/account mapping, and sensitive-field exclusions.
- Quarantined content is permanently stopped and alerted; transient failures use bounded exponential retry.
- Metrics carry only operation, kind, and outcome—never tenant, partner, relationship, event ID, payload, bank fields, or error text.
- The worker has no Business Partner master materialization path.

## Approval record

The release remains uncertified until the pending gates above contain immutable evidence references and the following owners sign the release ticket: Product, Procurement/Supplier Management, Data Governance/Privacy, Security, NEON Operations, MESH Operations, and Database/DR.
