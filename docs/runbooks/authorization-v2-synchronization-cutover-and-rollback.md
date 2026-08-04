# Authorization v2 synchronization, cutover, and rollback

This runbook is executable only after
`config/governance/authorization-migration-recovery-contract.v1.json` has named
owners, human-readable objectives plus machine-checkable RPO seconds/RTO
minutes, numeric freeze/lag/rollback limits, rollback triggers, and an approved
observation window. Placeholder text does not satisfy the gate. Its current
`approval_required` state intentionally blocks production promotion.

## Separate the three switches

Do not treat these as one event:

1. Resolver read switch: legacy remains the sole authority writer; a pinned
   `legacy`, `shadow`, or `enforce` revision chooses the decision engine.
2. Authorization writer switch: legacy writing freezes, capture reaches zero
   lag, and one writer lease moves to the target.
3. Fresh-database business move: business, document/object, audit/event, and
   projection data move under their separately approved synchronization plan.

Neon and Mesh have independent database identities, backups, watermarks, and
runtime/dispatcher leases. Their compatible application release may be
coordinated, but neither database is used as the other database's rollback
source.

## Wave 0 freeze contract

Before the first snapshot:

1. Record repository revision, source database identity, schema fingerprint,
   Keycloak realm/export hash, and the approved source/writer registry.
2. Install authorization change capture in one transaction while holding every
   registered source table against writes.
3. Verify row mutation and `TRUNCATE` capture, `ENABLE ALWAYS` trigger state,
   registered-writer matching, and append-only protections.
4. Start a dedicated `REPEATABLE READ` migration transaction. It is
   intentionally read-write only so the durable marker can be inserted; the
   source-table portion of the transaction performs reads only.
5. Record the commit-ordered authorization watermark durably and export the
   database snapshot from that same transaction.
6. Keep the exporting transaction open until every snapshot consumer has joined
   it.
7. Capture identities, golden decisions, source-row conservation data, table
   counts/checksums, object references, and stream watermarks from the same
   boundary.

Application write traffic may continue only after capture is proven installed.
Any source or writer that cannot be captured remains frozen and blocks the
snapshot.

For a live retrofit, use the atomic installers; ordinary phase-by-phase
provisioning is not an installation receipt:

```powershell
$env:AUTHORIZATION_CAPTURE_DATABASE_URL = "<approved Neon admin URL>"
pnpm.cmd --dir server/db exec tsx scripts/install/install-authorization-change-capture.ts `
  --apply --expected-database="<exact Neon database>" `
  --approval-ticket="<change ticket>"

$env:MESH_DATABASE_ADMIN_URL = "<approved Mesh admin URL>"
pnpm.cmd --dir server/db exec tsx scripts/provision-mesh.ts --capture-only `
  --expected-database="<exact Mesh database>" `
  --approval-ticket="<change ticket>"
```

The Mesh and Neon receipts, source-set hashes, database identities, source
UUIDs, contract versions, and W0 watermarks are separate restricted evidence.
Never use one plane's receipt or connection variable as the other's fallback.

## Continuous synchronization

- Project only complete source transactions.
- Use stable source row identities and idempotency keys.
- Advance an applied watermark in the same target transaction as all projected
  rows from its source transaction.
- Never advance past a partial or failed transaction.
- Reconcile high watermark, applied watermark, oldest unapplied age, source-row
  conservation, and unknown-writer counts continuously.
- Expiry changes that occur without a source-row mutation require scheduled
  invalidation and are included in decision freshness evidence.
- Authorization capture is not business CDC. The fresh-database move uses its
  separately approved write freeze or PostgreSQL logical/WAL synchronization.

## Resolver read promotion

For an exact plane, named cohort, and revision:

1. Confirm the rollout contract is approved, current, unexpired, and references
   the golden-corpus hash and minimum applied watermark.
2. Enter `shadow`. Return the legacy result exactly; never union legacy and v2.
3. Observe every decision path, including single, batch, session, workflow,
   metadata/action, document/ACL, Admin, and Mesh paths applicable to the plane.
4. Classify every mismatch. A high-risk deny/allow mismatch blocks promotion.
5. Confirm capture lag and unknown-writer count meet the recovery contract.
6. Publish a new `enforce` revision for the named cohort.
7. Pin that revision for each request/job and observe through the approved
   window.

Rollback publishes a higher `legacy` revision, increments the relevant
authorization epochs, and invalidates all contextual decision/session caches.
It does not roll back database writes.

## Authorization writer cutover

1. Announce and activate the approved authorization-write freeze.
2. Verify capture coverage and zero unknown writers.
3. Drain whole source transactions to zero lag.
4. Reconcile the conservation ledger and golden corpus.
5. Stop the legacy authority writer.
6. Atomically transfer the writer lease/epoch to the target writer.
7. Revoke direct target-table writes from every non-target path.
8. Run write/read/revoke/expiry smoke tests and session-cache invalidation tests.
9. Start the approved observation window.

Do not promise lossless switchback after target writes unless reverse replay was
tested and approved. Without it, the recovery path after the writer switch is
forward repair.

## Fresh-database move

The recovery contract must select exactly one strategy:

- complete maintenance write freeze for snapshot, import, validation, and
  switch; or
- snapshot plus supported CDC catch-up while the target is read-only, then a
  short final freeze and zero-lag switch.

Before switching connections:

- verify source/target database identity and distinct URLs;
- provision only the schemas owned by that plane;
- migrate in declared FK order;
- reconcile every table, dynamic partition, object/blob, immutable archive,
  pending event, and dispatcher watermark against the disposition inventory;
- pause or explicitly route schedulers, webhooks, outbox consumers, payment and
  email workers, and every other external-effect producer;
- prove one writer and dispatcher lease;
- run golden authorization and end-to-end business acceptance;
- record the exact point at which instant rollback closes.

## Mandatory rollback triggers

The approved contract must supply thresholds for:

- high-risk allow/deny mismatch;
- unknown authorization writer or disabled capture trigger;
- capture/apply lag or incomplete source transaction;
- identity subject-set mismatch;
- cross-tenant anomaly without approved disposition;
- missing table/object disposition or failed checksum;
- duplicate or missing external effect;
- database identity/schema boundary failure;
- unacceptable error rate, latency, or user lockout.

If a trigger fires, stop promotion and invoke the named rollback owner. Preserve
source databases, Keycloak backup, capture journal, golden corpus, comparison
logs, conservation ledger, data manifests, and watermarks through the full
observation window.

## Sign-off record

Production sign-off is machine-read from the recovery contract. Chat, an
unlinked ticket, a successful local reset, or this document alone is not
approval.
