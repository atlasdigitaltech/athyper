# Database seed packs

This directory contains data applied after the three-plane DDL foundation.
Permanent schemas, tables, domains, policies, and triggers belong under
`server/db/ddl`; seed packs must contain data and assertions only.

## Parent folders

| Folder | Responsibility | Runtime status |
|---|---|---|
| `blueprints/` | Reusable tenant-scoped Neon data packs | Executed by tenant provisioning |
| `tenants/` | Plane and tenant onboarding data | Executed by plane/tenant provisioning |
| `meta-entity/` | Independently receipted Athyper metadata seed pack | Explicit opt-in command |
| `entity-operation-permissions/` | Independently applied plane-local permission definitions | Explicit opt-in rollout |
| `contracts/` | Seed standards, authorization sources, and generated contract artifacts | Build and verification input |
| `packs/` | Versioned, checksummed application manifests and receipts | Build and provisioning input |
| `migration/` | Historical movement ledgers and validation receipts | Audit evidence; not runtime seed input |

Parent folders use lowercase nouns or lowercase kebab-case. A leading underscore
is reserved for child templates such as `tenants/neon/_template`; generated
contract artifacts belong under `contracts/generated`.

## Blueprint layout

Blueprint payloads execute in dependency order:

1. `blueprints/universal/` — shared Neon tenant foundations.
2. `blueprints/100_industry_packs/` — explicitly selected industry catalogs.
3. `blueprints/200_industry_org_structure/` — industry-aware organization templates.
4. `blueprints/modules/` — optional subscription-gated module packs.

Blueprint application contracts and receipts are under `packs/blueprints-v2`.
Layer-12 reference data owned by all planes is not duplicated here; it is
installed from the DDL manifests.

## Tenant layout

| Folder | Scope |
|---|---|
| `tenants/admin/` | Athyper administration principals and authority bindings |
| `tenants/neon/_template/` | Starting point for a new Neon tenant |
| `tenants/neon/<ordered-code>/` | One explicitly selected Neon tenant |
| `tenants/mesh/` | Mesh exchange and network fixtures |

Production reference packs must not contain demo principals, transactions, or
example tenants. Demo fixtures remain explicitly named and opt-in, such as
`tenants/neon/010_demo`.

## Seed contract

Every production pack must declare or enforce:

- version, provenance, compatible DDL version, plane, and tenant scope;
- deterministic natural keys and deterministic UUIDs for cross-file identities;
- idempotent convergence without destructive permanent-data deletion;
- preservation of `created_*` and conditional changes to `updated_*`;
- status/effectivity retirement for obsolete reference values;
- expected-count, orphan, uniqueness, tenant-isolation, and semantic assertions;
- immutable application receipts containing payload and assertion results.

The normative contract and template are under `contracts/base`.

## Provisioning

Plan the complete canonical three-plane foundation, tenant, authorization, and
Keycloak workflow without executing SQL:

```powershell
pnpm.cmd run db:provision:three-plane:plan
```

Apply the complete workflow to fresh Studio, Neon, and Mesh databases. Each
database commits independently; the final Studio receipt records all three
successful plane applications before Keycloak reconciliation and context
verification run:

```powershell
pnpm.cmd run db:provision:three-plane
```

For an existing DDL foundation, explicitly skip the fresh-database DDL phase:

```powershell
pnpm.cmd --dir server/db exec tsx scripts/provisioning/provision-three-plane.ts --apply --skip-foundation
```

The canonical manifest is `seed/manifests/three-plane-demo.v1.json`. It owns the
stable tenant UUIDs for `athyper`, `technostat`, and `cirrusatlantic`. Keycloak
subjects remain opaque external identities; plane-and-tenant-local principals
are deterministically derived and connected through
`master.principal_identity_binding`.

The restored plane commands apply the same manifest and authorization contract
to one already-founded database:

```powershell
pnpm.cmd --dir server/db run db:provision:studio
pnpm.cmd --dir server/db run db:provision:neon
pnpm.cmd --dir server/db run db:provision:mesh
```

Apply or check the independent Meta Entity pack:

```powershell
pnpm.cmd --dir server/db run db:seed:meta-entity
pnpm.cmd --dir server/db run db:seed:meta-entity:check
```

Validate seed contracts and pack metadata before runtime application:

```powershell
pnpm.cmd --dir server/db run db:seed:contract:lint
pnpm.cmd --dir server/db run db:seed:contract:test
```

Tenant provisioning resolves the tenant identifier from the selected folder and
`master.tenant.code`, then supplies the required `app.seed_*` session settings.
Do not execute tenant SQL manually without the same scope and principal context.
