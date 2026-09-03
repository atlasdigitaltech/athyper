# Canonical three-plane seed inputs

This directory contains only versioned inputs required after the Studio, Neon,
and Mesh DDL foundations have been installed. Production reference data belongs
to layer-12 DDL under `server/db/ddl`; demo transactions and historical migration
evidence do not belong in the active seed path.

## Layout

| Folder | Purpose |
|---|---|
| `manifests/` | Stable tenant coordinates and per-plane pack selection |
| `contracts/base/` | Seed metadata, convergence, and provenance contract |
| `contracts/authorization/` | Source, identity, and verification contracts |
| `contracts/authorization/control/` | Honest implementation boundaries for suspension and emergency controls |
| `packs/authorization-v2/studio/` | Studio-local authority and assignments |
| `packs/authorization-v2/neon/` | Neon-local authority and assignments |
| `packs/authorization-v2/mesh/` | Mesh-local authority and assignments |

Folder names are lowercase nouns or lowercase kebab-case. Plane-owned runtime
artifacts always use the exact plane names `studio`, `neon`, and `mesh`.
`platform` is reserved for a shared source contract that is compiled into
separate plane-owned outputs; it is never an executable target plane.
Inherited values such as `wave2.neon-admin.*` are stable semantic version IDs,
not folder names or runtime plane targets. Changing them requires a separately
versioned contract migration.

`server/db/seed-backup` is historical source material only. Provisioners,
checks, and generators must never read from it.

The former `seed/meta-entity`, `seed/blueprints`, and
`seed/packs/blueprints-v2` layouts are retired. Meta-entity reference state is
installed by the canonical Studio DDL manifest; form/entity definitions are
published through the versioned metadata/publication authority. Their obsolete
package commands were removed so a missing historical pack cannot be mistaken
for a release check.

## Runtime-only authorization state

Production seeds must not write runtime decisions or credentials. The seed
contract linter rejects writes to `authz.delegation`,
`authz.delegation_grant`, `authz.deny_rule`, `authz.override`,
`authz.record_acl`, and `authz.trusted_device`.

The linter also rejects static writes to `authz.application_projection`,
`authz.projection_provider`, and `authz.projection_scope`. Those rows are owned
by the Studio-to-plane application reconciliation path and must carry its
publication and rollover lifecycle rather than seed provenance.

## Commands

```sh
pnpm --dir server/db exec tsx scripts/seed/compile-final-authorization-seed-packs.ts
pnpm --dir server/db run db:seed:contract:lint
pnpm --dir server/db run db:verify:authorization:seeds
pnpm --dir server/db run db:verify:authorization:suspension-controls
pnpm --dir server/db run db:provision:three-plane:plan
```
