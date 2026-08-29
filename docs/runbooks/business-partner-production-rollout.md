# Business Partner production rollout and recovery

## Release boundary

This runbook covers the NEON-only onboarding flow and the MESH-to-NEON flow. NEON remains the authority for Business Partner master data. MESH publication and masked bank disclosure are immutable source events; the delivery worker may write only recipient inbox/projection tables through the existing NEON validation services. It never writes `master.business_partner`, supplier/customer roles, company profiles, or preferred-remittance state.

Delivery and reconciliation are independently gated and disabled by default:

- `BUSINESS_PARTNER_MESH_DELIVERY_ENABLED`
- `BUSINESS_PARTNER_MESH_RECONCILIATION_ENABLED`

This lets the API and internal NEON onboarding flow ship without activating cross-plane transport.

## Preflight and release certificate

Before enabling either flag:

1. Verify API, worker, and scheduler use the same immutable runtime image digest.
2. Confirm MESH and NEON migration ledgers have no failed rows. Do not rewrite checksums.
3. Confirm `business-partner-profile-publications.mesh`, `business-partner-bank-disclosures.mesh`, `business-partner-profile-projections.neon`, `business-partner-account-bank-linkage.neon`, and `business-partner-mesh-delivery` readiness.
4. Run the focused plane and host tests recorded in the build plan.
5. Validate both Prometheus configurations and load `business-partner-rules.yaml`.
6. Record backup/PITR identifiers, runtime digest, migration hashes, test evidence, approver, and rollback owner in the release ticket.

Read-only source backlog check:

```sql
SELECT status, event_type, count(*) AS events,
       min(created_at) AS oldest, max(created_at) AS newest
FROM event.outbox
WHERE topic = 'mesh-business-partner'
GROUP BY status, event_type
ORDER BY status, event_type;
```

No event may contain raw account number, IBAN, routing number, tax identifier, contact, address, email, or phone data. Bank payloads are limited to the governed masked field set, and telemetry labels contain only operation, event kind, and outcome.

## Staged deployment

1. Deploy API, worker, and scheduler with both flags `false`; verify the internal NEON flow and readiness for 30 minutes.
2. Enable reconciliation only. It is read-mostly and reopens only source rows previously marked complete when their exact NEON receipt is absent. Observe for 30 minutes.
3. Enable delivery for the pilot environment/instance. Drain at 100 events per 15-second sweep; do not increase concurrency because ordering is per relationship.
4. Exercise one profile publication, one withdrawal, one initial bank disclosure, one bank change, and one revocation. Confirm exact event IDs in the corresponding NEON inboxes.
5. Expand to production only after one hour with zero dead letters, zero unexplained reconciliation reopenings, oldest backlog below 15 minutes, and no privacy/security alert.

Dashboard panels use `athyper_business_partner_mesh_delivery_total`:

- delivery throughput by `kind` and `outcome`;
- five-minute retry/dead-letter/quarantine rate;
- reconciliation `in_sync`, `reopened`, and `check_failed` changes;
- worker/scheduler health plus Business Partner readiness;
- PostgreSQL/Redis/job latency and saturation alongside the delivery panels.

## Replay and DR exercise

Never delete, mutate, or recreate an immutable MESH payload. Recipient ingestion is event-ID idempotent and rejects event-ID/hash collisions.

For a reviewed dead letter, enqueue `mesh.business-partner.deliver` on queue `mesh.business-partner.delivery` through the governed job-administration path with:

```json
{
  "replayOutboxId": "<exact-outbox-uuid>",
  "reason": "<approved incident/change reference of at least 8 characters>",
  "limit": 1
}
```

The handler accepts only an exact UUID in dead-letter state, records `REPLAY_REQUESTED:<reason>`, resets its attempts, and runs normal validation/deduplication. A missing dead letter is discarded rather than creating data.

Quarterly DR rehearsal:

1. Restore MESH and NEON to isolated recovery databases from the same recovery point.
2. Keep delivery disabled and run reconciliation to establish drift.
3. Enable delivery in the isolated worker and drain immutable source outbox events.
4. Compare MESH completed event IDs with NEON profile/bank inbox event IDs; the set difference must be empty.
5. Compare projection heads by relationship, source/recipient accounts, publication/disclosure version, lifecycle version, state, and payload hash.
6. Verify NEON Business Partner master row counts and hashes did not change during replay.
7. Destroy the isolated recovery environment under the approved retention procedure and attach query evidence to the release record.

## Incident rollback

Rollback is a runtime switch, not a destructive database rollback:

1. Set `BUSINESS_PARTNER_MESH_DELIVERY_ENABLED=false` and `BUSINESS_PARTNER_MESH_RECONCILIATION_ENABLED=false` on scheduler and worker, then restart only those processes with the last certified image.
2. Leave API/internal NEON onboarding available unless the incident affects its independent controls.
3. Preserve pending, failed, processing, completed, and dead-letter rows. Expired leases are recoverable after re-enable.
4. Do not remove NEON inbox/snapshot/projection rows and do not reverse approved Business Partner, supplier/customer, company profile, or bank-verification decisions.
5. If code rollback is required, deploy the prior image digest across API/worker/scheduler and verify readiness. Forward-compatible WP16 has no destructive schema dependency.

Rollback is successful when no new delivery claims occur, in-flight 90-second leases expire safely, internal NEON onboarding remains healthy, and all event evidence remains queryable.

## Release acceptance

Release certification requires named approval from Product, Procurement/Supplier Management, Data Governance/Privacy, Security, NEON operations, MESH operations, and Database/DR owners. Open dead letters, unexplained drift, raw financial identifiers, self-approval bypass, direct master writes from integration, checksum rewrites, or an untested rollback are release blockers.
