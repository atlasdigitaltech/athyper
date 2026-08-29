# Business Partner P9 production qualification

## Purpose and release boundary

This runbook certifies the supplier, customer, workforce, and external-invitation journeys implemented by P1-P8. It does not authorize a production deployment by itself. The machine-readable contract is `deploy/releases/business-partner-p9.yaml`; `pnpm release:business-partner:certify` is read-only and fails closed whenever evidence, an exact image digest, a required assertion, a canary measurement, rollback identity, or a named approval is missing.

Only the five digests in that contract may progress from the qualified staging image set. Rebuilding, retagging, changing `sourceRevision`, substituting an artifact, or recording evidence against a different digest starts a new qualification.

## Evidence handling

Store retained, sanitized JSON under `$ATHYPER_QUALIFICATION_ROOT/production/business-partner/`. Evidence records use `BusinessPartnerReleaseGateEvidence` and must validate against `deploy/instances/schemas/business-partner-release-gate-evidence.schema.json`. Artifact entries contain a durable evidence URI and SHA-256, never credentials, cookies, bearer tokens, invitation tokens, raw bank values, or unnecessary PII.

The seven required files are `database.json`, `domain-service.json`, `cross-plane.json`, `security-privacy.json`, `ux.json`, `operations.json`, and `ownership.json`. A recorder may create a file only after every referenced command has completed and its raw evidence has been checksum-retained. Do not hand-edit a failing assertion to `true`.

## Qualification sequence

1. Freeze the staging source revision and all five image digests. Record the prior active production image-set checksum separately.
2. Rehearse migration preflight and forward-only deployment on production-shaped data. Validate constraints and tenant RLS, capture backup/PITR coordinates, restore into an isolated target, and prove both forward recovery and disaster recovery.
3. Run the full request-kind matrix, concurrent transition and idempotency suites, transactional rollback, target load, queue backpressure, poison-message quarantine, replay, and reconciliation tests.
4. Reject invalid/unsigned/downgraded definitions; exercise STUDIO outage from verified local projections; run MESH replay/quarantine/reconciliation and IAM convergence/fencing.
5. Complete the threat-model review, negative authorization/RLS suite, PII and bank-field leakage scan, secret/log scan, retention, export, deletion, and access-audit exercises.
6. Run authenticated supplier, customer, workforce, and external invitation journeys in every supported browser and viewport. Retain axe results and reviewed exceptions. Restricted applicant sessions must see only approved journey fields and actions.
7. Verify dashboards, alert routing, support ownership, training attendance, and outage handling before opening a one-percent production canary.
8. Observe the canary for at least 60 minutes. Stop immediately if any threshold in the contract is exceeded. Do not average away a threshold breach.
9. Exercise rollback to the retained prior image-set checksum, prove that the restored checksum is exact, then roll forward to the candidate and reconcile cleanly.
10. Obtain one named, timestamped, ticket-linked approval from each required owner role. Run the verifier and attach its certified JSON output to the release record.

## Automatic pause and rollback criteria

Pause expansion on any failed readiness probe, unexplained IAM or MESH drift, quarantine/dead-letter event, authorization or privacy failure, data constraint failure, request failure rate above 1%, p95 request latency above 1500 ms, outbox lag above 60 seconds, or inability to reconcile. Disable invitation sends and cross-plane workers when they are implicated; preserve queues and immutable source events.

Rollback deploys the exact retained prior image set. Database changes are forward-only: do not reverse accepted requests, invitations, identities, audit records, or immutable events. If a forward compatibility fix is required, deploy it as a reviewed migration and repeat the affected gates. Roll forward only after restore/reconciliation evidence is clean.

## Support, training, and ownership

The release record must name the on-call incident commander and escalation routes for NEON, MESH, STUDIO/IAM, security/privacy, operations, and product. Support training covers journey triage, restricted applicant recovery, invitation abuse/cancel/expire races, poison-message quarantine, IAM fencing, MESH replay, privacy escalation, and exact-image rollback. Attendance evidence is mandatory; documentation publication alone is not training evidence.

No owner may approve anonymously or through a shared team identity. The certification requires six distinct people, one for each role. Product acceptance is the final approval and cannot waive another gate.
