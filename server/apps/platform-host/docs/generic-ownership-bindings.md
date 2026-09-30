# Generic ownership and revision bindings

Host composition no longer contains BP/workforce parent SQL or BP-named task-policy
permissions. This removes implicit product wiring; it does not publish replacement
metadata or configure products automatically.

## Registration ports

- entityScopeBindings: exact plane/entity/operation/resolver/target registrations.
- entityParentScopeBindings: exact plane/entity readers of stored scope candidates.
  Generic Records parent read must succeed before the reader is invoked. Every
  capability action still passes through capability-policy authorization.
- taskPolicyPermissions: explicit read/author/publish permission codes obtained from
  trusted deployment/publication configuration. No permission catalog was changed.
  Missing configuration returns TASK_POLICY_PERMISSION_BINDING_UNAVAILABLE.

Unbound parent capabilities now deny, including formerly special-cased BP and
workforce parents. They must not inherit tenant/global scope implicitly.
Revision authorization still checks permission/entitlement/MFA, tenant-scoped author
lookup and independent publisher. Task-policy publish still checks the resolved
target-plane principal against the creator inside its write transaction.

## Concrete scalar-row provider

shared/entity-runtime/persisted-scopes.ts supplies createPersistedEntityScopes and
createPersistedParentScopeBinding. A trusted binding fixes plane, entity, database,
schema/table, tenant/id columns and coordinate columns. Identifiers are validated;
tenant/record IDs are SQL parameters. Existing targets load a unique persisted row
and never echo caller coordinates. Proposed/collection coordinates require the
mandatory owning-catalog validation callback.

Reads start a read-only repeatable-read transaction before actor stamping, set a
bounded statement timeout, and invoke validation in the same snapshot. Validation
must enforce active/effective catalog and relationship constraints. A missing row,
missing required owner, ambiguous result or failed validation denies. Errors propagate.
Default preflight is workflow_blocked; this provider does not invent workflow evidence.

This provider supports scalar ownership only. It is NOT an implementation of BP
assignment collections, workforce employment collections, or document.entity_case
snapshot ownership. Such products remain unavailable without their explicit trusted
reader. Do not copy browser coordinates or substitute this scalar provider for a
relationship/snapshot model. BP metadata definitions are untouched.

## Verification limits

Live fixture integration now also passes: see history/tests-after-live-scope-bindings.txt.
Opt in with ENTITY_SCOPE_POSTGRES_TEST=1 and run persisted-scopes.postgres.test.ts.
It creates its own disposable PostgreSQL 16 container with tmpfs storage and removes
it after the run; no external database URL or application volumes are used.
Eight tests exercise a non-superuser/non-bypass role, tenant/principal RLS, actor
stamping and transaction-local cleanup, parent admission, missing and ambiguous
rows, concurrent ownership updates under repeatable read, read-only rejection,
UUID/NOT NULL errors, and denied/missing validation paths.

This is a fixture policy, not the deployed product RLS or owning-catalog model.
Production product policies, effective relationship validation, real catalog
constraints and deployment-role grants still require product-specific integration
qualification. Snapshot consistency is not a lock against ownership changes after
the read transaction; mutation-time authorization remains the command's responsibility.

Provider tests use Kysely's dummy driver to verify parameterized SQL, actor stamping,
ownership replacement, missing/ambiguous rows, validation denial and plane/identifier
rejection. Those unit tests are separate from the live fixture suite. Parent and revision
tests verify deny-before-read, exact binding selection, missing scopes, foreign tenant
candidates, maker-checker and MFA behavior.

Preflight persistence is still governance-gated. No source change was made to
entity-case-preflight.ts, and its deleted repository import remains the single host
compiler error.
