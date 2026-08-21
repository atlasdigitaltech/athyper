# Wave 4: evaluator, entitlement, and exception migration

Wave 4 is implemented additively as a repository-agnostic evaluator and a
shadow authority path. Its checked-in truth tables, static boundary checks, and
PostgreSQL 17 DDL smoke gate pass. Existing consumers are not moved and the new
ACL/delegation authority is not declared enforced until Wave 5.

## Canonical decision contract

The evaluator has three discriminated request and result modes:

- `entity_resource`: an exact entity-operation permission against one resource;
- `registered_capability`: an exact registered non-entity permission; and
- `collection`: a query materialization containing organizational allow
  clauses, deny scopes, and a separate exact-record ACL predicate.

`evaluate(request)` is exactly a one-item call to `evaluateBatch(requests)`.
There is one precedence implementation. The repository loads typed facts; the
core imports no SQL builder, database adapter, Neon repository, or Mesh
repository.

The fail-closed order is identity, principal, plane membership, exact typed
request, plane eligibility, physical entitlement, hard policy/MFA/SoD, exact
denies, and independent allow paths. Entitlement unavailability therefore wins
before a role, ACL, delegation, or allow override can grant access.

Each proof path intersects all of its scope constraints. Alternative complete
proof paths are unioned. Collection deny scopes are subtracted by the query
consumer, while ACL records remain an independent exact-record predicate and
never widen organizational scope. Empty scope grants nothing.

## Physical repository and entitlement boundaries

Neon and Admin share the Neon repository contract but use different physical
entitlement semantics. Neon resolves an exact published permission through its
module, optional feature, active tenant plan version, tenant module activation,
tenant feature activation, and governed target policy. An active deny override
always wins. An allow override is considered only where its target policy
explicitly permits it.

Admin uses a versioned, explicit active `platform_managed` policy. It does not
inherit tenant-plan semantics.

Mesh resolves a published Mesh permission only through a local product and
capability binding plus `mesh.account_entitlement`. Its resolver reads no
`master`, `control`, Persona, or Neon plan relation. The repository contract
requires an explicit Mesh database connection and forbids Neon fallback.

## Denies and exception migration

The runtime deny subjects are exactly hard policy, principal, and group. A group
deny is active only through an active current group membership; an inactive
group activates neither its allow nor its deny.

Every legacy `access_grant` row must receive one disposition with a durable
watermark, immutable source hash, affected-principal set, legacy and canonical
decision hashes, exact target rows, and affected-user difference count.
Legacy role-subject denies cannot enter the evaluator. Each is reviewed as
permission removal, exact group-deny conversion, hard-policy promotion,
principal-deny expansion, or intentional retirement. Direct group/principal
feature grants have the same explicit disposition discipline and no runtime
meaning in the new evaluator.

The canonical exception services enforce these boundaries before persistence:

- overrides are principal-only, approved, expiring, and exact-plane/scope;
- record ACLs require an exact record and exact shareable permission; and
- delegation requires a bounded time/scope subset, a delegable permission, and
  ordinary group-role provenance, with self-delegation and chaining forbidden.

ACL and delegation services deliberately report
`shadow_not_enforced_until_wave5_consumers_move`.

## Evidence and gates

The executable truth tables prove Neon/Admin and Mesh repository parity,
single/batch equivalence, within-path intersection, cross-path union,
collection deny subtraction, inactive-group deny behavior, ACL record
isolation, delegation provenance/subset, and entitlement precedence.

Run the repository gate:

```powershell
pnpm.cmd --dir server/db run db:verify:authorization-v2-wave4
```

After the watermarked snapshot/backfill and replay have converged in both
databases, run:

```powershell
$env:AUTHORIZATION_V2_NEON_DATABASE_URL = "<Neon URL>"
$env:AUTHORIZATION_V2_MESH_DATABASE_URL = "<Mesh URL>"
pnpm.cmd --dir server/db run db:verify:authorization-v2-wave4:live
```

Publication remains prohibited until all live counts are zero, every affected
user diff is approved, all Wave 4 constraints are validated, and the Wave 0
rollback owner and observation window remain approved. The live verifier reads
evidence only; it does not backfill, mutate flags, enable a repository, or move
consumers.
