# Authorization Wave 8 — reset rehearsal, cutover, and observation

Status: tooling is implemented. Live execution is blocked until the recovery
contract names owners and approves exact RPO, RTO, rollback, freeze, database,
and observation values.

## Safety boundary

Use an isolated production-like environment with four distinct databases:
Neon source/target and Mesh source/target. No in-place reset is permitted.
Legacy sources and compatibility objects remain immutable, independently
restorable, and untombstoned through the observation window.

The checked-in Wave 8 contract intentionally has `liveExecution.authorized`
set to false. Source control is not an approval mechanism. Never put database
URLs, backup keys, service secrets, or production evidence in the repository.

## 1. Approve the rehearsal

Create a restricted manifest conforming to
`wave8.rehearsal-manifest.v1`. It must identify:

- one rehearsal and repository revision;
- exact, distinct source and fresh target database names for each plane;
- `isolated_production_like` and `fresh_target_connection_switch`;
- numeric RPO lag and RTO minutes;
- whether lossless post-write rollback is promised;
- observation start/end and minimum duration;
- change, rollback, security, data-owner, and operations approvals.

The Wave 0 recovery contract must also be fully approved. A Wave 8 evidence
bundle cannot override its pending state.

## 2. Backup and restore

Back up and restore Neon, Mesh, and Keycloak independently. Restore into
separate rehearsal identities. Verify database identity/schema fingerprints
and Keycloak subjects, clients, credentials, MFA, federation, and key material.
Measure recovery time from the rollback trigger to successful smoke checks.

Each receipt records the rehearsal/repository boundary, canonical SHA-256,
success, restored-identity match, and elapsed minutes. A successful backup
without a restore is not evidence.

## 3. Provision fresh targets

Provision Neon and Mesh with the plane-specific commands. Do not use reset
commands. Neon discovery must contain no Mesh DDL/seed; Mesh uses its explicit
Mesh-only manifest.

Use the approved identity executor and FK-ordered disposition manifests for
business, document/object, audit, and pending event data. The target remains
read-only to application runtimes. Run the read-only state capture for each
plane:

```text
pnpm --dir server/db run db:capture:authorization-v2-wave8-state -- \
  --plane=neon \
  --expected-source-database=<exact-source> \
  --expected-target-database=<exact-target>
```

Set `NEON_SOURCE_DATABASE_URL` and `NEON_TARGET_DATABASE_URL`; use the
corresponding `MESH_` variables for Mesh. The capture refuses equal URLs,
unexpected database identities, or opposite-plane schemas. It reports schema,
identity, seed-owned, constraint, and Wave 7 state hashes under
repeatable-read/read-only transactions.

## 4. Replay and reconciliation

Demonstrate complete-transaction forward replay for authorization, identity,
business, object/event, and pending dispatcher work. Final lag must be within
the approved RPO, with zero duplicate and zero missing transactions.

If lossless rollback after target writes is promised, demonstrate reverse
replay for both planes at zero lag. Otherwise record that lossless instant
database rollback closes before target-only writes and use the approved forward
repair strategy.

Reconcile every table and object disposition, canonical table/object hashes,
event watermarks, and pending-work queues. Missing disposition is a hard
failure.

## 5. Qualification

Capture five seed states per plane: two clean builds, two forced reseeds, and
one in-place-upgrade equivalent. Ledger, seed-owned, identity count, and
identity hashes must match, and non-seed rows must remain unchanged.

Require:

- zero unexpected unvalidated constraints and zero orphan rows;
- field-level identity and ordered subject-set equality;
- business-owner authorization and migrated-data acceptance;
- cross-plane, opposite-database-unavailable, and least-privilege RLS tests;
- one active external-effect dispatcher lease;
- zero duplicate and zero missing external effects.

## 6. Connection and writer switch

Freeze source writes and dispatchers, catch all watermarks to the approved
limit, and take a pre-switch target backup. Neon and Mesh connections,
writer/consumer epochs, and the compatible application release switch as one
change. Never activate target and source dispatchers concurrently.

The database switch does not replace the Wave 7 authorization writer gate.
Both planes must independently report target writer authority and later
`observation_complete`.

## 7. Rollback rehearsal

Measure the rollback time objective. Before target writes, switch back the
matched database/release pair. After target writes, use proven reverse replay
when promised; otherwise stop and follow forward repair. Restore matching
Keycloak/application state when changed, reacquire exactly one dispatcher
lease, revoke sessions, invalidate caches, and reconcile final watermarks.

Do not roll back only one plane when contract or exchange versions changed.

## 8. Stable observation and certification

Keep the legacy source restorable throughout the approved observation window.
Continuously verify authorization mismatches, errors, latency, identity,
watermarks, external effects, cache invalidation, and business acceptance.

Package signed evidence outside the repository and certify it:

```text
pnpm --dir server/db run db:certify:authorization-v2-wave8 -- \
  --manifest=<restricted-manifest.json> \
  --evidence=<restricted-evidence.json>
```

Certification passes only when every receipt belongs to the same rehearsal and
revision, every gate is clean, both planes use fresh targets with target
resolver/writer observation complete, RTO is met, and legacy sources remain
restorable. Only then may Wave 9 contraction begin.
