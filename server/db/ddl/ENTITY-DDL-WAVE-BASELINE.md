# Entity DDL wave baseline

> Superseded for implementation by `ENTITY-DDL-BUILD-PLAN.md`, locked on
> 2026-08-02. This file remains the discovery baseline and legacy inventory.

The Entity wave starts after the non-Entity freeze. It owns the metadata model
that describes business records; it does not reopen the frozen operational,
audit, notification, policy, or job models.

## Current desired-state starting point

- Athyper already owns immutable `snapshot.compiled_artifact`, including base,
  overlay, and plane-scoped outputs tied to a source entity snapshot.
- Mesh already owns the immutable read-only projection
  `runtime_meta.entity_contract`; document-exchange validation depends on its
  published contract coordinate and hashes.
- Neon has no desired-state Entity catalog or runtime projection yet. Its
  `document.workflow_request` only carries optional entity-version and compiled
  artifact coordinates.
- None of the three desired-state manifests currently restores the legacy
  `control.entity*` or `mesh_control.entity*` authoring catalogs.

## Legacy inputs to reconcile

### Neon authoring and publication

- `control.entity`, `control.entity_version`, `control.entity_version_contract`
- `control.entity_field`, `control.entity_relation`
- `control.entity_surface`, `control.entity_field_surface`
- `control.entity_operation`, `control.entity_action_rule`
- `control.entity_policy`, `control.field_security_policy`
- `control.entity_scope_binding`, `control.entity_publish_state`
- `control.entity_contract_transition`
- `control.entity_flow`, `control.entity_flow_step`, `control.entity_flow_section`,
  `control.entity_flow_field`
- lifecycle metadata, hooks, gates, timers, and transition execution
- compiled and overlay artifacts currently represented by legacy snapshot tables

### Mesh projection

- legacy `mesh_control.entity`, `entity_version`, `entity_operation`,
  `entity_operation_plane`, and `entity_scope_binding`
- desired-state `runtime_meta.entity_contract` as the current Mesh projection anchor

### Athyper authority

Athyper is the single Entity authoring and compilation authority. Neon and Mesh
receive explicit immutable, versioned projections; they do not author definitions.
Cross-database foreign keys are forbidden, so publication coordinates and hashes
must be independently verifiable in each consuming database.

## Review order

1. Identity and tenancy: stable IDs, nullable/global scope, `(tenant_id,id)` keys.
2. Version graph: draft/review/effective/retired states and immutability boundary.
3. Field and relation contract: physical storage coordinates and cross-tenant safety.
4. Surface and operation model: presentation metadata separated from authority.
5. Lifecycle and flow composition: eliminate overlapping transition catalogs.
6. Publication evidence: compiled hashes, readiness, rollback, and audit correlation.
7. Plane projections: Neon execution descriptor and Mesh read/delegated-submit descriptor.
8. RLS, grants, fixed function `search_path`, triggers, and drift verification.

## Entry invariants

- One authoring authority and one explicit projection contract per consuming plane.
- No operation permission is inferred from UI placement or handler metadata.
- Effective versions and compiled artifacts are immutable.
- Every tenant-owned table has forced RLS and `(tenant_id,id)` uniqueness.
- Publication, audit evidence, and descriptor invalidation are transactional.
- Entity DDL may reference frozen tables, but may not duplicate their capabilities.
