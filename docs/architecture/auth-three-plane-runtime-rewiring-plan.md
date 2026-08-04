# Auth login/logout three-plane rewiring

Status: runtime rewired; organization-projection/seed cutover gated.

Organization-contract amendment: the immutable Keycloak organization ID and
explicit projection contract in
`trust-onboarding-three-plane-blueprint.md` supersedes the earlier
alias-equals-tenant design. An alias is a Keycloak-owned descriptor (immutable
after creation in the pinned release), but is never a tenant or authorization
coordinate. Runtime authority is the immutable Keycloak organization ID.

## Target invariants

1. `admin`, `neon`, and `mesh` each use their own physical database. A runtime
   component may not accept an optional database and may not fall back to Neon.
2. Authentication resolves exactly one
   `(tenant_id, provider_code, realm_key, subject_id)` through
   `master.fn_resolve_principal_identity`, followed by one active and effective
   `authz.plane_membership`.
3. Keycloak Organizations own login discovery. A plane-local active projection
   resolves `(realm_key, keycloak_organization_id)` to exactly one tenant and
   its permitted scope ceilings; provider/domain configuration remains in
   Keycloak.
4. JIT may create only a new principal and immutable subject binding. It does
   not repair, reassign, admit, or grant the identity.
5. Authorization reads only plane-local `master` and `authz`. Mesh account
   access comes from `authz.scope_target(scope_kind='network_account')` and an
   evaluated grant proof.
6. Authentication tokens and the authorization snapshot have separate
   lifecycles. Logout carries plane, realm, tenant, session, and binding
   coordinates and remains successful when audit persistence is degraded.

## Delivery plan and current state

### 1. Runtime database boundary — complete

- Make the plane registry mandatory at API startup.
- Verify `current_database()` and `app.database_plane` before readiness.
- Route Admin to Athyper, Neon to Neon, and Mesh to Mesh with no fallback.

### 2. Identity admission and login — complete

- Use one exact admission repository for context, bootstrap, session, route
  helpers, and authorization-session identity.
- Make discovery Keycloak-only.
- Make JIT transactional, coordinate-locked, immutable-subject, and no-grant.
- Fail closed for disabled/revoked bindings, suspended principals, and absent,
  pending, or expired plane membership.

### 3. Context/session/authorization — runtime complete, projections gated

- Resolve Mesh network accounts through typed authorization scope grants.
- Read the common `authz` catalog and authority in all three databases.
- Apply deny precedence, group-role, ACL, override, and bounded delegation
  proofs from the new tables.
- Gate: Neon/Mesh entity-operation decisions remain fail-closed until an
  immutable runtime operation-coordinate projection exists in those planes.
- Gate: Neon plan-to-permission and Mesh account-product entitlement evidence
  do not yet have a common-`authz` projection. Their entitlement gate therefore
  remains fail-closed; a tenant subscription alone is not permission evidence.
- Improvement: the session endpoint is one API operation, but admission, Mesh
  scope selection, and authorization evaluation currently use successive
  plane-local transactions. Add a registry-owned repeatable-read unit of work
  and let all three repositories share it so one authorization snapshot cannot
  straddle a concurrent membership or grant change.

### 4. MFA and logout — complete

- Read and revoke MFA credentials directly in Keycloak; do not persist a local
  credential authority.
- Namespace Redis subject and Keycloak-session reverse indexes by realm.
- Require fresh, one-time back-channel logout tokens.
- Write `auth.logout` to the selected plane's `audit.security_event`; enqueue a
  plane-local `event.outbox` retry record if the direct audit insert fails.

### 5. Seed and Keycloak organization cutover — blocked by current fixtures

Do not authorize a local reset until all of these are green:

- Replace the remaining legacy identity/authority SQL under
  `server/db/seed/tenants` with `master.principal`,
  `master.principal_identity_binding`, and common `authz` rows.
- Register the immutable IDs of the existing Keycloak organizations, resolve
  their canonical parties, and compile explicit Admin, Neon, and Mesh
  projections. Preserve the exact Keycloak subject inventory during this
  migration; do not rewrite aliases merely to encode tenant IDs.
- Regenerate the authorization seed packs from the new common `authz` schema.
- Resolve the repository's existing authorization-DDL dependency report; the
  current zero-scan reports 66 legacy dependencies, so reset is not authorized.

Current static gate evidence (2026-08-04):

- runtime retired-authority reader/writer findings: `0`;
- active persona-era runtime findings: `0`;
- retired Neon identity seed references: `55` across four seed files;
- immutable Keycloak-organization-to-projection coverage: not yet captured;
- legacy DDL dependency findings: `66`;
- Keycloak before/after subject count and hash: not yet captured from the live
  local realm.

### 6. Qualification matrix — required before activation

Run against fresh Athyper, Neon, and Mesh databases plus both Keycloak realms:

- native login/logout and support login/logout in every plane;
- disabled/revoked binding and suspended principal;
- absent/pending/expired plane membership;
- cross-plane, cross-realm, and same-subject/different-realm isolation;
- Mesh network-account selection from typed evaluated grants;
- direct and outbox-retried plane-local logout audit evidence;
- stale/replayed back-channel logout rejection;
- zero runtime and active-seed references to retired identifiers.

Activation requires all matrix cases, typechecks, unit tests, fresh-database
tests, the strict zero-scan, and Keycloak identity-count/hash conservation to
pass. Rollback is a deployment rollback only; no cross-plane fallback is
permitted.
