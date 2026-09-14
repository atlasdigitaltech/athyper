# Authorization v2 ownership, evaluation, and plane boundary ADR

Status: Accepted

## Decision 1: physical ownership

Authorization policy and projections are physically owned by the database for their exact plane. Studio and Neon use their own `authz` relations; Mesh uses its Mesh-local authority. Provider identity remains external, while Athyper stores only stable identity bindings and opaque credential references.

## Decision 2: zero Mesh-specific-data Neon boundary

Mesh-specific principals, grants, relationships, policy, configuration, and audit evidence must not be stored in or read from Neon. Cross-plane provisioning transports desired state, but it does not make Neon a fallback authority for Mesh.

## Decision 4: evaluator precedence

Evaluation is deny-first: tenant boundary, identity activity, plane admission, operation compatibility, entitlement, hard policy, explicit deny, and scope containment must all pass before role, delegation, record ACL, or approved override can establish an allow path. Incomplete proof denies access.

## Decision 5: Admin entitlement semantics

Administrative identity does not imply application entitlement or bypass tenant and plane boundaries. Administrative mutations require the exact management permission, an enabled mutation surface, an exact-plane repository, and—when v2 enforcement is selected—a qualified writer switch bound to approved evidence, matching watermarks, and a golden-corpus hash.

## Rollout consequence

Rollout selects exactly one of `legacy`, `shadow`, or `enforce`; decisions are never unioned. The initial mode is `legacy` for every plane. Shadow writes through the legacy writer and records a v2 preview. Enforce uses only the exact-plane v2 repository and fails closed unless its writer-switch evidence is qualified.

## Verified by

- `pnpm policy:plane-boundaries`, `pnpm policy:server-boundaries`, and
  `pnpm policy:server-rebuild-boundaries` check package ownership and import direction.
  The rebuild and server checks use syntax-aware module extraction; repository
  `.require(plane)` calls are not dependency declarations.
- `pnpm inventory:authorization:check` checks exact source registration, ownership,
  unknown writers, and generated artifact freshness. Reviewed source registration
  is not approval to activate a policy or grant.
- `pnpm inventory:authorization-data-disposition:check` checks the DDL-derived
  disposition artifacts. It does not qualify live database contents.
- Runtime selection and evaluation live in `server/packages/platform/iam/src/shadow-authorizer.ts`
  and `permission-authorizer.ts`; exact-plane repository selection lives in
  `server/packages/foundation/src/transaction`. Tests in those packages and the host
  composition cover runtime behavior; static policy success alone proves neither
  tenant isolation nor authorization equivalence.

Run these checks against the candidate tree and record its commit and dirty status.
Do not treat historical local check results as qualification of a later candidate.
