# Wave 3: roles, groups, plane membership, and scope

Wave 3 is implemented as an additive, fail-closed authority build. The checked-in
catalogs and PostgreSQL 17 smoke gate pass; production publication remains
blocked until the watermarked backfill and live reconciliation gate pass in both
databases.

## Authority boundary

Neon owns Neon and Admin authority. Admin access is an explicit `admin` plane
membership plus group membership; an Admin permission or legacy grant alone is
not admission. Mesh owns its subject admission, account entitlement, roles,
groups, scoped assignments, ACL, and delegation. The Mesh compiler reads only
the shared semantic contract, the Mesh authority manifest, and the compiled Mesh
operation catalog. It does not read Neon tables, Neon plans, or Persona data.

Persona has no runtime meaning in the new evaluator. The seven frozen legacy
tiers are migration inputs that compile into exact permission IDs, an immutable
role compilation, and a tenant-scoped group. Once a user mapping is applied, the
runtime proof path is:

`principal -> plane membership -> group membership -> typed scoped role -> immutable role compilation -> exact permission`

An unmapped human is deliberately assigned to the zero-grant quarantine group.
Non-human principals require an explicit exclusion row and evidence. No username,
email suffix, Persona token, generic verb, missing scope, or empty array creates
authority.

## Checked-in deliverables

- Shared rules:
  `server/db/authority/authorization-authority-semantic-contract.v1.json`
- Neon/Admin source and compiled authority:
  `server/db/authority/neon-admin/`
- Mesh-local source and compiled authority:
  `server/db/authority/mesh/`
- Deterministic compiler:
  `server/db/scripts/authority/compile-authorization-authority.ts`
- Subject and scope disposition evidence:
  `control.authorization_v3_subject_mapping`,
  `control.authorization_v3_scope_mapping`,
  `mesh_control.authorization_v3_subject_mapping`, and
  `mesh_control.authorization_v3_scope_mapping`
- Static and live gates:
  `server/db/scripts/verify/verify-authorization-v2-wave3.ts` and
  `server/db/scripts/verify/verify-authorization-v2-wave3-live.ts`
- PostgreSQL 17 DDL smoke gate:
  `server/db/scripts/verify/smoke-authorization-v2-wave3-authority.mjs`

The generated `existing-user-group-manifest.v1.json` files deliberately contain
the approved mapping policy and state that live rows come from the watermarked
backfill. They do not invent production users or claim approval of a snapshot
that has not been captured.

## Backfill and reconciliation contract

The migration runs only after Wave 1 change capture is healthy and its durable
watermark is recorded. For each active human principal at that watermark:

1. Preserve an already valid tenant/plane group membership exactly.
2. Convert a legacy Admin grant to an Admin plane membership and the approved
   Admin migration group.
3. Convert a Persona-only user to the matching compiled Persona migration group.
4. Put a user with no valid authority source into zero-grant quarantine.
5. Record the source rows, source hash, membership ID, group IDs, approval
   ticket, reason, and watermark in the subject mapping table.

Legacy company, legal-entity, and operating-organization assignments become a
typed scope target attached to a group-role assignment. A principal-specific
exception becomes an explicit expiring override. Empty and unknown scopes become
anomalies and grant nothing. Descendant traversal is preserved only with a
specific hierarchy approval.

Mesh performs the equivalent transformation locally from `mesh.principal`,
`mesh.network_account`, `mesh.account_grant`, and identity bindings. Before a
Mesh repository can be enabled, every published Mesh permission must have a
local, current permission-to-role-to-group-to-account/member proof path.

The order is fixed:

`expand -> watermark -> snapshot/backfill -> replay -> continuous sync -> compare -> clean -> validate -> NOT NULL -> publish/read swap`

## Executable gates

Run the repository gate:

```powershell
pnpm.cmd --dir server/db run db:verify:authorization-v2-wave3
```

After backfill, run the live gate with plane-local credentials:

```powershell
$env:AUTHORIZATION_V2_NEON_DATABASE_URL = "<Neon URL>"
$env:AUTHORIZATION_V2_MESH_DATABASE_URL = "<Mesh URL>"
pnpm.cmd --dir server/db run db:verify:authorization-v2-wave3:live
```

Publication is prohibited until every live count is zero, all registered
deferred constraints are `validated`, `pg_constraint` contains no unexpected
unvalidated target constraint, required final authority columns are `NOT NULL`,
the watermarked existing-user manifest has a named approver, and the rollback
owner and observation window from Wave 0 are still valid.

The live gate is evidence, not a mutation tool. It does not backfill, publish,
change a feature flag, enable a Mesh repository, or perform the read swap.
