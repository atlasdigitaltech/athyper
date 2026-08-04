# Authorization cleanup Wave 6 — safe seeds and identity tooling

Status: implementation foundation complete; destructive and production-like live
qualification has not been executed from this repository session.

## Delivered design

Provisioning is now plane-specific. Neon discovers only Neon/Admin/shared files
and Mesh uses an explicit Mesh-only file list and `MESH_DATABASE_ADMIN_URL`.
Both provisioners take a session advisory lock before inspecting or changing
provision state. A Mesh provision cannot infer a database from a Neon URL.

Every seed SQL file is a seed pack. Its canonical LF-normalized SHA-256, logical
key, source path, plane, and declared `seed-pack-version` are registered in
`public.seed_pack_ledger_v2` before the SQL executes. Existing files without an
explicit header are version `legacy-v1`. Once registered, changing content
without changing the version is a hard content-drift error. The ledger rejects
update/delete and the append-only execution table distinguishes clean,
in-place-upgrade, and forced-reseed executions.

Authorization seeds no longer truncate group/member tables or delete
just-in-time principals to make a seed succeed. An identity collision is now a
conflict-fail exception. The former inferred all-tenant group generator was
removed; only reviewed explicit groups can be added.

Destructive Neon and Mesh reset paths require all of:

- the exact plane database name on the command line;
- a persistent disposable-database marker for that exact database;
- a current schema-object fingerprint equal to the stored marker;
- no opposite-plane schema;
- `ATHYPER_DISPOSABLE_ENVIRONMENT=I_UNDERSTAND_DATA_WILL_BE_DESTROYED`;
- `RESET_NEON` or `RESET_MESH` acknowledgement.

The marker must be renewed after an intentional schema change. The broad
`db:setup:reset` compatibility name remains only as a guarded Neon alias; it no
longer discovers or drops Mesh schemas. Legacy developer reset wrappers apply
the same requirements. The Keycloak reset wrapper additionally requires exact
IAM database identity, `RESET_KEYCLOAK_IAM`, and the SHA-256 receipt from a
successful restore drill.

## Identity and Keycloak

`migrate-preserved-identities.ts` is a separate one-time executor. It consumes a
restricted manifest conforming to
`config/governance/preserved-identity-migration.schema.json`, locks per plane,
checks the exact database, and either:

- proves every field is already an exact match; or
- inserts the missing principal and identity binding.

It never updates or deletes an identity. Any ID, subject, realm, provider,
username, status, or other field-authority conflict aborts the transaction.
Post-insert identity count and canonical SHA-256 must match the approved
manifest before an immutable receipt is recorded.

The Keycloak authorization v2 reconciler is additive. It does not call a user
endpoint, does not delete resources, creates missing managed groups, preserves
unmanaged attributes, and fails on existing client-field drift. The checked-in
manifest intentionally has an empty user operation set.

## Fresh database data disposition

`execute-fresh-database-disposition.ts` is the common business, document, and
audit executor. Each execution requires a signed table-by-table manifest,
explicit columns and primary key, exact source and target database identities,
and an empty target table. It reads the source under a repeatable-read,
read-only transaction and writes the target under a serializable transaction
and advisory lock. It performs no delete/truncate and produces source/target
row counts and canonical SHA-256 values. Document executions additionally
require the approved external-object evidence hash.

The existing Wave 0 disposition inventory remains the authority for deciding
which tables and external objects enter each signed execution manifest. Its
approval remains an operational prerequisite; the executor does not turn a
pending policy into an approval.

## Qualification and commands

Static and unit qualification:

```text
pnpm --dir server/db run db:verify:authorization-v2-wave6
```

Marking and resetting a disposable database are intentionally separate:

```text
pnpm --dir server/db run db:mark-disposable:neon -- \
  --execution-profile=development_clean_reset \
  --approval-label=LOCAL-AUTH-V2-RESET \
  --expected-database=<exact-db> \
  --environment=disposable_local \
  --acknowledge=MARK_DISPOSABLE_NEON

pnpm --dir server/db run db:reset:neon -- \
  --execution-profile=development_clean_reset \
  --approval-label=LOCAL-AUTH-V2-RESET \
  --expected-database=<exact-db> \
  --acknowledge-destructive-reset=RESET_NEON
```

Use the corresponding `mesh` commands and acknowledgements for Mesh. The
disposable marker environment variable is still required for the reset.

Keycloak reconciliation is dry-run unless `--apply` is supplied:

```text
pnpm run iam:reconcile:authorization-v2
```

Seed-state qualification uses the checked-in Neon or Mesh canonical queries
with `db:capture:wave6-seed-state`. Capture exactly
`clean_build_a`, `clean_build_b`, `forced_reseed_a`, `forced_reseed_b`, and
`in_place_upgrade`, then pass all five files as `--snapshot=<path>` to the Wave
6 verifier. It fails if ledger, seed-owned authorization state, identity count,
or identity canonical hash differs.

## Gate status

Repository/static gates pass:

- deterministic source hashing and immutable-version drift detection;
- serialized provision attempts;
- plane-only discovery and explicit Mesh connection identity;
- no global authorization truncate/delete in active seeds;
- reset marker, database identity, schema fingerprint, and acknowledgement;
- conflict-fail identity tooling with no update/delete path;
- additive Keycloak planning with an unmanaged-user preservation test;
- fresh-target business/document/audit execution with hash reconciliation.

Operational evidence is still required before Wave 6 is declared complete:

- two clean builds, two forced reseeds, and one in-place upgrade for each plane;
- live concurrent-provision serialization evidence;
- approved disposition manifests and executed source/target reconciliation;
- approved preserved-identity manifests and clean field/count/hash reports;
- supported Keycloak backup/restore drill receipt;
- destructive refusal tests against non-disposable and wrong-identity databases.

Those operations are deliberately not simulated and no live reset was run while
building this wave.
