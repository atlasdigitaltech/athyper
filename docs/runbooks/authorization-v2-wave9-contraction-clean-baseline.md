# Authorization Wave 9 — contraction and clean-baseline certification

Wave 9 removes the compatibility authority only after the new authority is
irreversible by policy. Do not contract before Wave 8 is certified, its stable
observation has completed, and the approved rollback-retention end has passed.
The checked-in contract is intentionally blocked until those facts are
approved.

## Safety boundary

The tombstone is not part of normal Neon or Mesh provisioning. It runs against
one already-deployed database, in one transaction, under a plane-scoped
advisory lock. Every object drop uses `RESTRICT`; `CASCADE` is prohibited. An
unknown view, function, FK, generated client, reader, writer, or rollback
dependency is a blocker rather than an object to delete automatically.

The repository cleanup and database tombstone are separate:

1. retire runtime readers and writers while legacy objects remain;
2. approve the Wave 9 authorization evidence;
3. tombstone deployed databases and retain their immutable receipts;
4. delete build-from-zero legacy definitions and all stale repository surfaces;
5. prove the contracted baseline twice from empty disposable databases.

## 1. Approve contraction

Produce `wave9.contraction-authorization.v1` evidence for each plane. It binds
one execution ID, repository revision, expected database, Wave 8 certification,
expired rollback-retention approval, zero projection lag, zero live DB
dependency, zero application reader/writer, canonical rollback independence,
and named change/security/database approvals.

Until governance changes
`authorization-wave9-contraction-contract.v1.json` to `status=approved` and
`liveExecution.authorized=true`, the executor only emits a blocked plan.

```text
pnpm --dir server/db run db:report:authorization-v2-wave9-readiness

pnpm --dir server/db run db:tombstone:authorization-v2-wave9 -- \
  --plane=neon \
  --expected-database=<exact-database> \
  --authorization=<approved-json>
```

Do not use the count-only repository report as approval evidence. Review every
finding and its removal diff. Counts must be zero before live contraction.
Capture each live database as read-only evidence as well:

```text
pnpm --dir server/db run db:capture:authorization-v2-wave9-preflight -- \
  --plane=neon \
  --expected-database=<exact-database>
```

The preflight requires the target writer, completed observation, frozen legacy
writes, equal source/applied watermarks, no approved active legacy writer, no
external `pg_depend` edge, and an explicitly retired reverse projector/instant
legacy rollback promise.

## 2. Tombstone deployed databases

Back up each target immediately before contraction. Keep the backup and the
Wave 8 evidence independently restorable. Run Neon and Mesh independently:

```text
pnpm --dir server/db run db:tombstone:authorization-v2-wave9 -- \
  --plane=neon \
  --expected-database=<exact-database> \
  --authorization=<approved-json> \
  --execute \
  --acknowledge=DROP_LEGACY_AUTHORIZATION_NEON

pnpm --dir server/db run db:tombstone:authorization-v2-wave9 -- \
  --plane=mesh \
  --expected-database=<exact-database> \
  --authorization=<approved-json> \
  --execute \
  --acknowledge=DROP_LEGACY_AUTHORIZATION_MESH
```

The transaction records
`public.authorization_contraction_receipt_v2`. A repeat with identical
evidence is idempotent. Conflicting execution/evidence hashes fail. Preserve
the receipt, command output, backup identity, and migration logs outside the
repository evidence bundle.

## 3. Delete build-from-zero legacy definitions

Delete build-from-zero legacy definitions only after every deployed database
in the release estate has a matching receipt. Apply the ten manifest stages in
order:

1. runtime consumers and writers;
2. DB functions, views, triggers, compatibility adapters;
3. principal-Persona assignment;
4. Persona-permission mapping;
5. role-Persona FK/catalog and legacy groups;
6. Admin/company/access/feature/plan grants;
7. old ACL/delegation;
8. Neon business-network authority;
9. contextual aliases;
10. stale seeds, Keycloak mappers/tools, contracts, UI, generated models,
   tests, and active documentation.

Regenerate clients only after legacy DDL is absent. Re-run the readiness report
and authorization inventory. Both the case-insensitive Persona scan and
Neon/Mesh boundary scan must be zero. Do not retain aliases in compiled output.

## 4. Final clean baseline

For each of two empty disposable databases per plane:

1. mark the exact database disposable with the Wave 6 database guard;
2. install the Wave 9 sentinel before provisioning;
3. provision the contracted baseline without running the tombstone migration;
4. capture the normal Wave 6 seed-state evidence;
5. capture the Wave 9 baseline.

```text
pnpm --dir server/db run db:install:authorization-v2-wave9-sentinel -- \
  --plane=neon \
  --expected-database=<empty-disposable-database> \
  --build-id=<unique-build-id> \
  --acknowledge=INSTALL_WAVE9_SENTINEL_NEON

pnpm --dir server/db run db:capture:authorization-v2-wave9-clean-baseline -- \
  --plane=neon \
  --expected-database=<empty-disposable-database> \
  --build-id=<same-build-id> \
  --seed-state=<wave6-seed-state-json>
```

The event-trigger sentinel survives the platform schema reset and records any
legacy object created and later dropped. Certification requires zero observed
creates, zero remaining legacy objects, no tombstone receipt (the clean DDL
must not need it), no unexpected unvalidated constraint, canonical target
tables present, and identical schema/seed hashes across both builds.

Repeat for Mesh with Mesh-only credentials. Neon must have no Mesh schema or
authority; Mesh must remain operable without Neon.

## 5. Certify and close

Assemble the two plane receipts, ten ordered repository-removal receipts, two
clean captures per plane, repository zero-scan, Wave 8 receipt, retention
approval, and canonical rollback drill:

```text
pnpm --dir server/db run db:certify:authorization-v2-wave9 -- \
  --manifest=<wave9-certification-manifest.json> \
  --evidence=<wave9-certification-evidence.json>
```

Archive the historical cleanup plan and tombstone material outside active
build inputs only after certification. The supported rollback is then a
canonical release rollback or database restore; it must not query or recreate
a deleted legacy table.
