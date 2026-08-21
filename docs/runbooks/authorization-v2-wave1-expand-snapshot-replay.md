# Authorization v2 Wave 1 expand, snapshot, and replay

Status: executable repository contract; no production execution is authorized
by this document.

This runbook is the only approved order for installing the additive
authorization-v2 target in the separate Neon/Admin and Mesh databases. It does
not switch a reader, make a target table authoritative, invent a transformer,
enforce `NOT NULL`, rename an object, or remove legacy authority.

The governing contracts are:

- `docs/architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md`
- `docs/architecture/authorization-wave1-additive-canonical-ddl.md`
- `config/governance/authorization-wave1-additive-contract.v1.json`
- `config/governance/authorization-migration-recovery-contract.v1.json`
- `config/governance/authorization-rollout-contract.json`

## Required approvals and inputs

Do not start a live step until the change record contains:

- exact and distinct Neon and Mesh database names and endpoint fingerprints;
- the approved change ticket and the expected DDL-manifest hashes from both
  dry runs;
- one immutable migration-run UUID per database;
- named migration, data, security, operations, and rollback owners;
- approved authorization and business-data RPO/RTO values;
- an approved observation window and explicit rollback decision authority;
- the exact Wave 0 source-set hashes: 66 Neon sources and 8 Mesh sources;
- a secured evidence location for receipts, manifests, counts, hashes,
  anomaly dispositions, comparison output, and rollback drills;
- an approved, checksum-addressed transformer for every legacy source that will
  be projected. The repository deliberately seeds no guessed transformer.

Ordinary runtime processes must not receive both database credentials. Only the
audited one-time migration executor may hold two short-lived clients where a
business-data move genuinely requires them.

## Repository preflight

Run these commands from the repository root. They do not connect to a database
unless a live flag is supplied:

```text
pnpm --dir server/db run db:verify:authorization-v2-wave1
pnpm --dir server/db run db:install:authorization-v2-expand
pnpm --dir server/db run db:install:mesh-authorization-v2-expand
pnpm --dir server/db run db:migrate:authorization-v2-replay
pnpm --dir server/db run db:migrate:mesh-authorization-v2-replay
pnpm --dir server/db run db:rollback:authorization-v2-expand
pnpm --dir server/db run db:rollback:mesh-authorization-v2-expand
```

The gate is closed unless:

- both explicit manifests are duplicate-free and hash to the approved values;
- the Neon manifest contains no Mesh DDL and the Mesh manifest contains no
  Neon DDL;
- the legacy-freeze check reports no new protected legacy reader or writer;
- the authorization inventory reports no unknown source or writer;
- every target table has one disposition and the disposition policy's pending
  production approval has been resolved;
- all Wave 0 capture health and data-quality reports are current.

The Wave 0 capture control/evidence relations are a preparation prerequisite,
not a Wave 1 stage. Mesh expansion additionally refuses an unhealthy existing
Wave 0 trigger set because its frozen-source contract is derived from that
live registry. This does not replace step 2: after expansion, rerun the
plane-specific capture installer under its source locks and retain that
post-expand receipt and observed watermark as the migration's authoritative
capture gate. No snapshot or backfill may start before that receipt. If the
Wave 0 foundation is absent, install it as preparation and restart Wave 1 at
step 1; do not reorder the Wave 1 stages.

## 1. Expand

Run Neon and Mesh independently. Never substitute `DATABASE_URL` for the Mesh
credential.

Neon/Admin:

```text
AUTHORIZATION_V2_DATABASE_URL=<neon-admin-url>
pnpm --dir server/db run db:install:authorization-v2-expand -- --apply --expected-database=<exact-neon-db-name> --approval-ticket=<ticket>
```

Mesh:

```text
MESH_AUTHORIZATION_V2_DATABASE_URL=<mesh-admin-url>
pnpm --dir server/db run db:install:mesh-authorization-v2-expand -- --apply --expected-database=<exact-mesh-db-name> --approval-ticket=<ticket>
```

Store each JSON receipt without editing it. Confirm:

- database identity and boundary checks passed;
- every installed file hash equals the dry-run manifest;
- legacy objects and rows are unchanged;
- target structures are empty except deterministic platform contract rows;
- target RLS is forced and target access is migration/admin-only;
- the Neon legacy `control.entity_operation` has only nullable v2 expansion
  columns and its exact 13 deferred constraints are registered;
- Mesh has no unexpected unvalidated target constraint;
- the default runtime selector remains `legacy`.

The expand installers intentionally do not install capture, record a snapshot
marker, bind replay, register transformers, backfill rows, or cut over reads.

## 2. Install/reconcile legacy-authority capture and record its receipt

The authoritative Wave 1 capture installation/reconciliation is a write-locked
boundary. It runs after expansion and must commit before the first source
snapshot begins, even when Wave 0 capture was already active.

Neon/Admin:

```text
AUTHORIZATION_CAPTURE_DATABASE_URL=<neon-admin-url>
pnpm --dir server/db exec tsx scripts/install/install-authorization-change-capture.ts --apply --expected-database=<exact-neon-db-name> --approval-ticket=<ticket>
```

Mesh:

```text
MESH_DATABASE_ADMIN_URL=<mesh-admin-url>
pnpm --dir server/db exec tsx scripts/provision-mesh.ts --capture-only --expected-database=<exact-mesh-db-name> --approval-ticket=<ticket>
```

The Mesh `--capture-only` manifest is the frozen Wave 0 capture manifest; it
does not install or modify Wave 1 target DDL.

Persist and verify for each database:

- source database UUID and database identity;
- capture contract version;
- committed current watermark, including a legitimate value of zero;
- exact source count and source-set hash;
- row and truncate triggers installed `ENABLE ALWAYS` on every source;
- no missing, disabled, additional, or ambiguous source;
- no capture health error or unknown live legacy writer.

If any source write can occur outside the capture boundary, stop. A later
snapshot cannot repair an unobserved interval.

## 3. Create and approve the migration runs

Create one `authorization_migration_run` in `control` and one in
`mesh_control`. Each row must bind the receipt's source database UUID and
capture version and must record:

- run code and immutable run UUID;
- approved transformation version;
- source and target database IDs;
- authorization and business-data RPO/RTO;
- rollback owner and observation window;
- approval ticket, approver, and approval time;
- evidence-manifest location and hashes in metadata.

Do not mark a run approved until its recovery contract and every source
disposition/transformer are approved. Do not reuse a migration-run UUID across
databases.

## 4. Record W0 inside the initial snapshot transaction

For each database, use a dedicated `REPEATABLE READ` or `SERIALIZABLE`
read-write transaction. It cannot be `READ ONLY` because the marker is durable.

Protocol:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT *
FROM event.fn_record_authorization_snapshot_marker(
    '<neon-migration-run-id>'::uuid,
    '<snapshot-label>',
    '<manifest-hint>'
);

-- Export the complete approved source set, stable IDs, counts, key ranges,
-- deterministic canonical hashes, and anomaly evidence in this same snapshot.

COMMIT;
```

Use `mesh_log.fn_record_authorization_snapshot_marker` for Mesh. Store the
returned marker ID, source UUID, capture version, W0, transaction snapshot, and
export-manifest hash together.

The replay interval is complete source transactions strictly after W0. Do not
use a mutable application outbox ID, wall-clock timestamp, or maximum target
row ID as the watermark.

## 5. Snapshot/backfill

Keep capture active and all runtime readers on legacy.

For every source:

1. Verify its approved transformer key, version, checksum, owner, ticket, and
   disposition against the transformer registry.
2. Project stable IDs into the empty target in declared FK order.
3. Reject ambiguous identities, permissions, operation mappings, scope kinds,
   and Persona-derived guesses.
4. Record source, accepted, rejected, quarantined, and target counts plus
   deterministic hashes in the conservation ledger.
5. Classify every rejection through the durable anomaly-disposition contract.
6. Prove active-user coverage and the intended v2 group assignment for every
   preserved user; do not make Persona a fallback.

Target DML must fail immediately for a foreign tenant/account, wrong plane,
foreign catalog owner, untyped scope, unpublished exact permission,
non-shareable ACL permission, or non-delegable delegated permission.

No snapshot/backfill step may advance the replay checkpoint.

## 6. Bind and replay from W0

Bind only to the marker produced by the same approved run and source database.

Neon/Admin:

```text
AUTHORIZATION_V2_DATABASE_URL=<neon-admin-url>
pnpm --dir server/db run db:migrate:authorization-v2-replay -- --bind --apply --expected-database=<exact-neon-db-name> --approval-ticket=<ticket> --migration-run-id=<run-uuid> --snapshot-marker-id=<marker-uuid> --consumer=<consumer-name> --transformer-version=<approved-version>
```

Mesh:

```text
MESH_AUTHORIZATION_V2_DATABASE_URL=<mesh-admin-url>
pnpm --dir server/db run db:migrate:mesh-authorization-v2-replay -- --bind --apply --expected-database=<exact-mesh-db-name> --approval-ticket=<ticket> --migration-run-id=<run-uuid> --snapshot-marker-id=<marker-uuid> --consumer=<consumer-name> --transformer-version=<approved-version>
```

Then repeat:

1. stage a bounded set of complete, contiguous post-W0 transactions with
   `--stage --apply ... --limit=<1..1000>`;
2. run only the approved transformer in one target transaction;
3. write per-source conservation results;
4. call the database completion function so target application evidence and
   checkpoint advancement commit atomically;
5. inspect read-only status with
   `--status --expected-database=<exact-db-name> --migration-run-id=<run-uuid>`
   using the same plane-specific URL.

The replay layer rejects partial transactions, gaps, duplicate conflicting
payloads, `TRUNCATE`, unknown sources, unknown transformers, source UUID
mismatch, and conservation mismatch. An unsuccessful application cannot advance
the checkpoint.

Continue synchronization until each applied watermark equals the current
source watermark and remains within the approved RPO under representative
write load.

## 7. Compare, clean anomalies, and validate

Keep the reader selector on legacy while:

- the golden decision corpus is evaluated through legacy and v2 shadow modes;
- all active principals and high-risk actions have comparison evidence;
- global, tenant/account, plane, principal, group, role, permission, scope,
  record, catalog, entitlement, and scheduled-boundary invalidations are
  exercised;
- every allow/deny difference has an approved disposition;
- all cross-tenant/account anomalies are zero or explicitly quarantined;
- target counts and hashes conserve against snapshot plus replay;
- decision evidence is append-only and contains exact proof IDs and epochs.

After backfill and anomaly cleanup, validate only the constraints listed in the
durable deferred-constraint registry. Certification requires zero unexpected
`convalidated = false` target constraints.

`SET NOT NULL`, atomic view/name/read swap, and legacy contraction are later
approved transitions. They are not part of the Wave 1 expand install.

## 8. Rollback

Before any snapshot marker, target row, transformer, replay, conservation,
invalidation, or decision evidence exists, the guarded uninstall is:

```text
pnpm --dir server/db run db:rollback:authorization-v2-expand -- --apply --expected-database=<exact-neon-db-name> --approval-ticket=<ticket> --confirm=PRE_BACKFILL_EXPAND_ROLLBACK
pnpm --dir server/db run db:rollback:mesh-authorization-v2-expand -- --apply --expected-database=<exact-mesh-db-name> --approval-ticket=<ticket> --confirm=PRE_BACKFILL_MESH_AUTHORIZATION_V2_EXPAND_ROLLBACK
```

Use the corresponding explicit Neon or Mesh admin URL. The scripts refuse if
the pre-backfill state cannot be proven and always preserve Wave 0 capture and
legacy authority.

After a marker or backfill exists, do not drop shadow structures. Rollback is:

1. atomically keep or restore reader and writer selectors to `legacy`;
2. stop target projectors at a recorded source watermark;
3. keep capture running;
4. retain all target rows, inbox/outbox, conservation, and decision evidence;
5. execute the named rollback owner's recovery decision within the approved
   RTO;
6. observe for the approved window, diagnose, and repair forward or run the
   separately approved reverse-replay plan.

Because Wave 1 does not cut over runtime reads, the expected Wave 1 rollback
selector is already `legacy`.

## Evidence closure

A run is not complete until the evidence bundle contains:

- both expand manifests and applied receipts;
- both capture receipts and exact source-set hashes;
- migration-run approvals, RPO/RTO, rollback owner, and observation window;
- W0 markers and snapshot manifests;
- transformer approvals and checksums;
- backfill and replay conservation ledgers;
- source/applied watermark history and lag;
- golden-corpus comparison and anomaly dispositions;
- negative-DML, RLS, append-only, outbox, retry, expiry, and rollback drills;
- constraint-validation report;
- explicit statement that runtime still reads legacy and no legacy object was
  contracted in Wave 1.
