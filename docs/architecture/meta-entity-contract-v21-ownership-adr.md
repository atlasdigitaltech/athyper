# Meta Entity Contract v2.1 Ownership ADR

Status: accepted for M0 coverage and migration planning  
Runtime behavior changed: no  
Database behavior changed: no

## Decision

Versioned Contract JSON is the only metadata authoring and release artifact.
SQL migrations manage database structure. A single deterministic application
service will validate the Contract and materialize version-scoped control-table
projections.

Admin is the only metadata-authoring plane. Neon and Mesh consume the same
published compiled descriptor. Mesh does not host a second metadata Studio.

## Authorities

1. `control.entity_version` owns the canonical Contract document, schema
   version, hash, lineage, workflow and optimistic lock.
2. `control.entity_publish_state` owns current draft/published pointers,
   catalog and execution readiness, and published hashes.
3. Version-scoped `control.entity_*` rows are deterministic projections. They
   are not edited independently.
4. Compiled snapshots addressed by published version, tenant and plane are the
   runtime authority.
5. `control.entity` retains stable identity and a temporary compatibility
   projection until all legacy readers are retired.
6. Mutable runtime state such as `entity_numbering_counter` is never cloned,
   imported, reset or deactivated during Contract publication.

The complete table classification is generated in
`config/governance/meta-entity-contract-v2-coverage.json`.

## Related runtime inputs

- Lifecycle definitions, states, transitions, gates, hooks and timer policies
  become immutable referenced definitions addressed by code, version and hash.
- `entity_lifecycle` remains the version-scoped entity binding.
- Lifecycle masks and action rules become authored version-scoped projections.
- Field-security policies and metadata overlays remain separately versioned
  tenant deltas applied after the platform Contract.
- Policy definitions are immutable references.
- Lifecycle execution, intake idempotency and record locks are runtime-only
  state.

No runtime input may remain unclassified.

## Contract versioning

Contract format is separate from business change category:

- Current format: `2.0`
- Target format: `2.1`
- `change_type` continues to describe a structural, behavioral, governance,
  label or fix change.

The M0 upgrader creates a deterministic v2.1 migration envelope. It preserves
the complete v2.0 Contract, converts singleton numbering to a configuration
array, derives lifecycle state-mask candidates, preserves legacy flow graphs,
and lists values that require hydration. An envelope with unresolved hydration
requirements is not publishable.

## Coverage gate

The generated coverage ledger combines:

- Every Zod schema node.
- Every entry in `META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY`.
- Planned v2.1 properties required by live runtime tables.
- All 20 entity-table dispositions.
- Related lifecycle, policy, overlay and runtime-state dispositions.

Each property records scope, classification, Studio disposition, API mapping,
relational projection, compiler mapping, Admin/Neon/Mesh consumer,
authorization, drift rule and stable test IDs.

Commands:

```text
pnpm policy:meta-entity-contract:update
pnpm policy:meta-entity-contract
pnpm policy:meta-entity-contract:strict
pnpm test:meta-entity-contract-coverage
```

The normal policy command verifies classification and artifact drift. The
strict command additionally fails while any schema or v2.1 wiring row remains
blocked.

## M1 entry conditions

M1 may begin when this ADR and the generated ledger are reviewed. M1 must:

1. Add dedicated Contract document/schema/hash/validation storage.
2. Stop using `contract_v2` as a business `change_type`.
3. Move structural changes out of seed `101`.
4. Enforce one working version and maintain publish pointers.
5. Add route permissions, reviewer separation, RLS and missing FKs.
6. Resolve every blocked ledger row before enabling v2.1 publication.
