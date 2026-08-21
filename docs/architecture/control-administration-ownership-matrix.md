# C1 control administration ownership matrix

**Status:** Approved  
**Decision:** C1  
**Effective:** 2026-08-11

Control administration is split by data ownership, not by schema placement. A
table living in `control` does not make it eligible for a generic control CRUD
API. Runtime routes must pass the policy guard exported by
`@athyper/server-platform-control-admin` before registration.

| Class | Governed resources | Write mechanism | Required controls |
|---|---|---|---|
| Platform catalog | feature and parameter definitions; subscription plans/modules and plan limits; usage metrics; connector types; global bank validation rules | Reviewed, versioned seed/publication; plane-local runtime read APIs only | Review and immutable publication version |
| Tenant override | feature overrides; tenant parameter values; tenant usage-limit overrides | Authenticated, exact-tenant runtime admin commands | OCC, atomic audit, outbox, cache invalidation, effective dating |
| Tenant configuration | rounding rules/contexts; connector instances/endpoints; complete cycle-template aggregates | Runtime aggregate service with explicit lifecycle and versioning | Tenant scope, OCC, atomic audit/outbox, invalidation; no child-table CRUD |
| Reference lookup | lookup domains and values | Platform publication for global rows; tenant authoring only for tenant-owned values in extensible domains | Resolve row owner before mutation, OCC/audit/outbox/invalidation, reference-use checks, retirement instead of delete |

## Binding decisions

- `control.feature_flag_catalog`, `control.parameter_definition`,
  `control.subscription_plan`, `control.subscription_plan_module`,
  `control.subscription_plan_usage_limit`, `control.usage_metric_catalog`,
  `control.connector_type`, and `control.bank_account_validation_rule` have no
  runtime write route. Studio publication or reviewed versioned seed is the
  authority; each runtime plane reads its local projection.
- `control.feature_flag_override`, `control.tenant_parameter_value`, and
  `control.tenant_usage_limit_override` are exact-tenant override rows. An API
  must not accept a tenant identifier as authority; it derives the tenant from
  the verified request context and uses an expected version.
- Rounding, connector, and cycle-template child rows are aggregate internals.
  Their services validate and commit the full state transition; independent
  table CRUD is prohibited.
- `control.lookup_domain` remains platform-published. A
  `control.lookup_value` with `tenant_id IS NULL` is also platform-published.
  Tenant authoring is allowed only when the parent domain is extensible and the
  value's `tenant_id` equals the verified tenant. Delete routes are prohibited;
  used values are retired.

The executable matrix and fail-closed route policy are in
`server/packages/platform/control-admin/src/control-administration-ownership.ts`.
Any new control-administration resource must be added there and reviewed before
its route can be registered.
