# Common reference viewing capability

The approved permission code is **`common.platform.reference.view`**. It replaces
the unpublishable `shared.reference.read` Country candidate. `reference.data.read`
was a naming proposal only and is not an alias or a fallback.

## Identity and authority

Ordinary permissions remain `{plane}.{domain}.{entity}.{operation}`. The only
shared-namespace exception is this exact code. `common` is not a plane, wildcard,
tenant or principal. The same deterministic catalog UUID
`51f45819-773a-566d-a4bc-69784c28afb2` is installed in each local plane database.
Local tenant membership, application entitlements, roles, explicit denies and
operation scope still determine access. A Neon role grant grants nothing in Mesh
or Studio. No roles or grants are installed by this change.

The catalog kind is `capability`, risk is `low`, and the only compatible scope is
`tenant/exact`. All other `common.*` codes are rejected. Catalogs, exact-scope
contracts and generated authorization packs contain the definition for each plane.

## Metadata enrollment

An entity must be deliberately enrolled through the approved Studio graph:

```json
{ "layoutConfig": { "referenceCapability": "common.platform.reference.view" } }
```

The compiler requires exactly one active enrollment surface, system ownership,
entity class `reference`, one generic-read `shared` table profile with write mode
`none`, no tenant storage column, and public stored read-only fields. Every active
operation must be list/read/view, have read semantics, and bind to this capability
with exact-plane tenant-context scope and missing-coordinate denial. Merely
placing a table in `shared` does not enroll it. Sensitive tables need another policy.

Country's reusable shared-reference graph factory emits this enrollment. Additional
reference entities can use it without a new permission per entity. Their own graph
review and publication remain mandatory; no Country-specific runtime branch is needed.

The native descriptor carries the enrollment marker. Projection compilation checks
the immutable source hash and entity/operation identity before permitting the
shared coordinate. Native signing, descriptor parsing and database staging enforce
read-only restrictions. Ordinary entity-coordinate validation is unchanged.

## Application versus lookup

This permission covers browsing the enrolled reference application: list and record
read. It does not authorize writes, import, bulk export or arbitrary SQL reads.
Using Country in an address picker remains a separate path governed by the parent
operation and an explicit lookup binding. This change neither implements that
contextual lookup path nor grants dropdown access automatically.

## Deployment and verification

Fresh foundations include `common/authz/17_common_reference_permission.sql`.
Existing planes use `20260926_common_reference_permission.sql`, registered in all
three manifests. It updates the staging guard and installs catalog/scope rows only.
Conflicting existing catalog definitions fail rather than being overwritten.
The removed candidate name has no implicit alias: old unsigned candidates must be
recompiled. No existing per-entity permissions or grants are deleted or remapped.

Focused package typechecks, Country candidate compilation for all three planes,
catalog/scope/pack consistency and migration-layout checks were performed. Regression
cases were added but not executed, as requested. The SQL migration has not been
applied to a database or integration-tested. The broader DB typecheck remains
blocked by unrelated deleted BP imports and existing fixture errors.

This is a source-level authorization change, not proof of a live Country release.
IAM role assignment, signing, publication-source integration and activation remain
subject to the [Country activation gates](../runbooks/country-entity-app.md).
