# Business Partner production rollout

Status: prepared; target rehearsal and owner approval pending. Production qualification remains blocked.

## Release input

Use the source revision, immutable image digests, gates and thresholds in
`deploy/releases/business-partner-p9.yaml`. Its current revision is a historical
release coordinate; it does not identify the uncommitted 2026-09-05 build.
The release owner must select the actual built revision and image set and retain
matching evidence before authorizing rollout. Never relabel a local test as
production evidence.

Before scheduling the rollout, complete the gate collection in
[business-partner-p9-qualification.md](business-partner-p9-qualification.md).
Assign named Neon, MESH, Studio/IAM, security/privacy, operations and product owners.
Preserve the exact prior active definition/deployment heads and image digests for
all three planes. Retain a verified backup and the supported upgrade baseline.
R4 change cases require the v2 case contract and the native change materializer;
older pinned cases must not have their immutable snapshots rewritten.

## Canary and observation

1. Use the existing owning publication/deployment commands with independently
   approved release coordinates. The Operations & Proof viewer cannot publish.
2. Start the descriptor's 1% cohort and observe for at least 60 minutes.
3. Exercise the declared Supplier, Customer, Workforce and external-invitation
   journeys using distinct authorized principals. Pending Workforce policy gates
   block the broad P9 release; do not bypass them for the canary.
4. Observe request failure rate (maximum 1%), request p95 (maximum 1500 ms),
   outbox lag (maximum 60 seconds), and zero quarantine, IAM/MESH drift and
   readiness failures. The descriptor remains the authoritative threshold source.
5. Retain sanitized correlations, dashboards, alerts and support rehearsal
   evidence. Expand the cohort only after the release owner accepts the results.

## Abort and recovery

Stop cohort expansion on a failed journey, unsafe disclosure, breached threshold,
missing evidence or mismatched active head. The owning deployment/publication
operator restores the exact prior heads and immutable image set through its
approved rollback commands. Do not change master rows, task owners, snapshots,
policy coordinates or command evidence directly.

Reconcile MESH/IAM delivery and outbox state using their owning services. Prove
that all three planes match their retained prior heads and that exact replay has
not duplicated materialization. Follow the
[V1 operations runbook](business-partner-v1-operations.md) for case/notification
triage and [release operations](business-partner-release-operations.md) for
cross-plane recovery boundaries. A failed rollout remains blocked until corrected
and requalified with new retained evidence.
