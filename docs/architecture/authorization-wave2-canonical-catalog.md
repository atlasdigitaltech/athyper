# Wave 2 canonical authorization catalog

## Outcome

Wave 2 now has one shared semantic contract and two physically separate
catalogs:

- Neon/Admin: `server/db/seed/contracts/authorization/catalog/neon-admin/catalog.v1.json`
- Mesh: `server/db/seed/contracts/authorization/catalog/mesh/catalog.v1.json`

The catalogs share field semantics, not data. The Mesh compiler is sealed to
two reads: its own manifest and the shared semantic contract. It does not read
the Neon/Admin manifest, a Neon seed, or a Neon database schema.

This repository build does not switch a runtime reader and does not claim that
the database backfill has run. Generated rows remain draft inputs until the
snapshot/replay/live-coverage gates pass.

## Exact authorization identity

Every compiled mutation is identified by:

`catalog owner + entity ID + operation code + plane -> exact permission UUID`

The canonical permission code is descriptive output. Runtime authorization
uses the UUID. A global `create`, `update`, `delete`, `approve`, or other verb is
never authority for an entity mutation.

The checked-in exact resolver accepts the full tuple and performs a direct map
lookup. It has no permission-code input and therefore cannot fall back to
suffix, token, or alias matching.

## Source coverage

The Neon/Admin manifest records the exact resolution path for all
authorization-bearing metadata source kinds:

| Source | Canonical reference |
|---|---|
| entity operation | exact entity operation + permission |
| surface | each required permission |
| action rule | required permission for the exact entity/status/action |
| lifecycle transition | exact entity/lifecycle operation |
| flow | exact trigger-context operation |
| flow step | exact parent flow operation |
| flow field | exact override operation |
| field security | exact field access operation |
| relation | each declared mutation permission |

`control.auth_catalog_reference_v2` stores the resulting row-level proof.
`mesh_control.auth_catalog_reference_v2` is the physically independent Mesh
equivalent. Composite foreign keys prove that the referenced operation,
permission, and plane agree.

## Aliases

Aliases live only in `auth_permission_alias_v2`. The complete key includes
catalog owner, tenant/account context, plane, entity, operation, and legacy
code. `resolver_scope` is constrained to `migration_import_only`.

The final evaluator must not read either alias relation. Wave 2 currently
generates six contextual `edit -> update` migration aliases where the legacy
catalog contains no competing `update` operation. The compiler rejects a
second target for the same complete context.

## Compiler outputs

Run:

```text
pnpm --dir server/db run db:compile:authorization-v2-wave2
```

Each catalog produces:

- `compiled-catalog.v1.json`
- `contextual-aliases.v1.json`
- `verification-report.v1.json`
- `verification-report.md`
- `catalog-preflight.sql`

The Neon/Admin compiler snapshots every literal legacy
`control.entity_operation` seed tuple with source-file provenance. The Mesh
catalog is authored locally because Mesh must compile without any Neon catalog
read.

## Gates

Static CI:

```text
pnpm --dir server/db run db:verify:authorization-v2-wave2
```

The static gate asserts:

- one operation to one permission ID and canonical code;
- zero ambiguous contextual aliases;
- no generic permission authorizes an entity mutation;
- explicit risk/MFA/SoD/share/delegation metadata on every high/critical row;
- all nine metadata reference source kinds are modeled;
- no suffix/token inference in canonical Wave 2 paths;
- a sealed two-file Mesh compiler read audit.

After the additive DDL, snapshot, backfill, replay, and continuous
synchronization are installed, run:

```text
AUTHORIZATION_V2_NEON_DATABASE_URL=... \
AUTHORIZATION_V2_MESH_DATABASE_URL=... \
pnpm --dir server/db run db:verify:authorization-v2-wave2:live
```

The live gate fails on an inexact operation/permission tuple, ambiguous alias,
or any unmapped operation, surface permission, action permission, transition,
flow, flow step, flow-field override, field-security policy, or relation
mutation permission.

## Deployment sequence

1. Compile and review both reports.
2. Install the additive Wave 2 DDL; do not remove legacy objects.
3. Confirm the Wave 1 change-capture watermark is durable.
4. Snapshot source rows and backfill draft permissions, operations, aliases,
   and exact references.
5. Replay from the watermark and enable continuous synchronization.
6. Run the live gate and clean every anomaly.
7. Validate deferred composite constraints.
8. Publish only through the approved plane/cohort flag.

No catalog publication or runtime cutover is authorized by this repository
build alone.
