# Tenant scenario packs v1

These packs provide deterministic Neon organization foundations for the three
tenants selected by `manifests/three-plane-demo.v1.json`.

The scenarios deliberately increase in complexity:

- `cirrusatlantic`: one legal entity and company code with a flat organization.
- `technostat`: a two-country legal hierarchy, four company codes, shared
  operating organizations, and a multi-level organization tree.
- `athyper`: a 17-entity multinational group with localized company codes,
  cross-company operating organizations, and regional/business hierarchies.

Legal-entity `scopeKey` values must match the Keycloak organization aliases
used by the Neon authorization pack. Codes are lowercase because the current
DDL enforces lowercase business identifiers. Packs are read only through the
manifest; provisioners never read `seed-backup`.

All generated database IDs are derived by the provisioner from the plane,
tenant, resource kind, and natural key. Application uses convergent upserts and
tenant-local audit actors.

## CirrusAtlantic local authorization overlay

The clean-slate authorization pack intentionally grants no product authority.
For the disposable local Neon database, apply the opt-in CirrusAtlantic overlay
after the Neon authorization pack:

```powershell
pnpm.cmd --dir server/db run db:apply:authorization:neon
pnpm.cmd --dir server/db run db:provision:neon:cirrusatlantic-demo-auth -- --confirm=LOCAL-CIRRUSATLANTIC-DEMO-AUTH
```

The overlay is guarded to `localhost/athyper_neon`. It assigns `catl.admin`,
`catl.owner`, and `catl.finance` explicit legal-entity, company-code, and
operating-organization catalog visibility. The admin additionally receives an
exact tenant catalog coordinate. It grants no transaction permissions and does
not enable `member_companies` propagation.

## Three-tenant organization and authorization demo

Scenario pack version `2.0.0` is generated and checked with:

```powershell
pnpm.cmd run iam:scenarios:generate
pnpm.cmd run iam:scenarios:check
pnpm.cmd run iam:demo:generate
pnpm.cmd run iam:demo:check
```

The target foundation contains 22 legal entities, 39 company codes, 14
operating organizations, and 115 explicit organization-company assignments.
Every company receives `finance_baseline_v1`: a tenant chart assignment, a
company ledger-book assignment, and twelve open FY2026 periods. Athyper has one
statutory and one `.ops` company per legal entity.

Each legal-entity Keycloak organization declares distinct buyer and supplier
account coordinates (`BNA-*` and `SNA-*`). The 44 core accounts plus two
external partner fixtures produce 46 Mesh accounts. Functional demo identities
must retain deterministic subjects, so reconcile them with partial import
before applying authorization-v2 organization/group membership:

```powershell
pnpm.cmd run iam:demo:functional-subjects:reconcile
node tooling/tools/scripts/apply-realm-demo-setup.cjs --container athyper-iam-1 `
  --admin-user $env:IAM_ADMIN --admin-password $env:IAM_ADMIN_PASSWORD `
  --realm-file stack/config/iam/realm-athyper.json `
  --demo-file stack/config/iam/realm-athyper-demosetup.json --fast 1
pnpm.cmd run iam:reconcile:authorization-v2 -- --apply `
  --user-manifest=server/db/seed/contracts/authorization/admission/compiled/keycloak-admission.v1.json `
  --tenant-manifest=server/db/seed/manifests/three-plane-demo.v1.json
```

Apply the local cross-plane demo authority only after all three clean-slate
authorization packs are present:

```powershell
pnpm.cmd --dir server/db run db:provision:three-tenant-demo-auth -- `
  --confirm=LOCAL-THREE-TENANT-DEMO-AUTH
```

This overlay grants only catalog visibility: explicit Neon legal-entity,
company-code and operating-organization coordinates; exact Mesh network-account
coordinates; and tenant-level Studio catalog visibility for `athyper.admin`,
`tksa.admin`, and `catl.admin`. Operating-organization membership never expands
company authority, and `member_companies` remains disabled.
