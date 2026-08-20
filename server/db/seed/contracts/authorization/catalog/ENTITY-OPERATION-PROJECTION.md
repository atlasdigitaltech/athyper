# Entity-operation compiler projections

The Phase 4 compiler consumes one immutable, global Metadata release descriptor together with the target plane's Catalog v2, contextual alias contract, and exact scope-compatibility contract.

For every active target-plane Entity operation it requires exactly one active permission mapping. The permission must be an exact four-coordinate Catalog v2 code, its deterministic permission ID and kind must match the catalog, and its entity and operation coordinates must match the released operation.

The compiler emits:

- one deterministic global `authz.entity_operation_binding` projection row per source Entity operation;
- one deterministic `authz.entity_operation_scope_binding` child per exact compatible scope kind;
- the flattened `operation_scope_bindings` descriptor payload consumed by `authz.fn_stage_entity_operation_projection`.

Scope children must exactly cover the permission's declared compatible scope kinds. Every coordinate is fail-closed with `missingValueBehavior=deny`. Duplicate scope kinds, mixed decision modes, missing coordinates, tenant-owned releases, and cross-plane catalogs are rejected.

Legacy codes, contextual alias names, codes outside `{plane}.{domain}.{entity}.{operation}`, and generic `action` coordinates are rejected before catalog lookup. The database staging function independently checks the canonical code, compiler-supplied permission UUID, binding UUID, and scope-child UUID.

Compile a published Metadata release export with:

`pnpm run db:seed:authorization:compile-release -- --release=<release.json> --output=<projection.json>`

The release input can be exported directly from Studio using `pnpm run db:seed:authorization:export-release` with a Studio database URL, release UUID, target plane, and output path. The exporter uses a repeatable-read, read-only transaction and can enforce the expected database name.

No production projection is generated until Studio publishes an immutable release containing real operation UUIDs, release hash, compiled hash, permission bindings, and complete scope-coordinate recipes.
