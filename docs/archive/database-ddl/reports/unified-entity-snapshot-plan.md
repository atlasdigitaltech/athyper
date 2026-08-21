# Unified entity snapshot plan

## Locked decision

Adopt `snapshot.entity_snapshot_identity` plus `snapshot.entity_snapshot` as the one canonical business-version history foundation across Admin, Neon, and Mesh.

Do not use it as a replacement for mutable compiled caches. Consolidate immutable compiled outputs separately and move mutable route caches out of `snapshot`.

Canonical plane ownership:

```text
Admin / Athyper
|-- snapshot.entity_snapshot_identity
|-- snapshot.entity_snapshot
`-- snapshot.compiled_artifact
    |-- base artifacts
    |-- overlay artifacts
    `-- plane-specific artifacts
        |-- Neon runtime materialization
        `-- Mesh runtime materialization

Neon
|-- snapshot.entity_snapshot_identity
`-- snapshot.entity_snapshot

Mesh
|-- snapshot.entity_snapshot_identity
`-- snapshot.entity_snapshot
```

`snapshot.compiled_artifact` is authored only by Admin/Athyper. Neon and Mesh may later use `runtime_meta.compiled_artifact_cache` as a rebuildable local materialization.

## Existing-table disposition

| Existing table | Current purpose | Target disposition |
| --- | --- | --- |
| `snapshot.content_item_version` | Immutable content body versions; `document.content_item.current_version_id` points to a row | **Merge into `snapshot.entity_snapshot`** using `entity_type = 'document.content_item'`. Preserve a stable snapshot reference for `current_version_id`. |
| `snapshot.document_snapshot` | Generic P2P lifecycle checkpoint with header/lines/components/distributions JSON | **Merge and drop**. Its payload sections become one canonical `payload_json`; P2P gate fields become generic capture-event coordinates. |
| `snapshot.entity_compiled` | Immutable compiled entity artifact | **Do not treat as business version history.** Consolidate into `snapshot.compiled_artifact`. |
| `snapshot.entity_compiled_overlay` | Immutable overlay-specific compiled artifact | **Merge into `snapshot.compiled_artifact`** with `artifact_scope = 'overlay'`. |
| `snapshot.entity_plane_compiled` | Immutable plane-specific compiled artifact | **Merge into `snapshot.compiled_artifact`** with `artifact_scope = 'plane'` and `plane_key`. |
| `snapshot.lifecycle_route` | Compiled lifecycle route used for fast rendering/execution | **Move to `runtime_meta.lifecycle_route_cache`**. It is rebuildable runtime state, not source version history. Optionally retain each published lifecycle definition in `entity_snapshot`. |
| `snapshot.lifecycle_version` | Immutable compiled lifecycle definition; workflows pin a version | **Merge into `snapshot.entity_snapshot`** using `entity_type = 'control.lifecycle'`. Workflow rows must reference a stable snapshot identity. Keep a runtime cache if execution latency requires it. |
| `snapshot.status_route` | Mutable O(1) status-transition cache | **Move to `runtime_meta.status_route_cache`**. Never merge mutable in-place cache rows into the immutable version ledger. |
| `snapshot.template_version` | Immutable render template versions; `master.template.current_version_id` and render jobs depend on it | **Merge into `snapshot.entity_snapshot`** using `entity_type = 'master.template'`. Preserve stable current-version and render-job references. |
| `snapshot.bom`, `snapshot.bom_component` | Frozen execution structure referenced by production orders | **Merge and drop.** Capture the complete released BOM graph in `entity_snapshot`. Production-order component rows remain the typed execution copy; remove their typed BOM-component-snapshot FK. |

## Canonical snapshot contract

`snapshot.entity_snapshot_identity` is the compact, stable FK target and contains the universal coordinates, version, chain, and capture evidence:

```text
id
tenant_id
entity_type
entity_id
entity_code
version_number
payload_schema_version
entity_contract_hash
source_record_version
capture_event
capture_kind
payload_hash
previous_snapshot_id
previous_payload_hash
chain_seq
correlation_id
activity_log_id
valid_from
valid_until
retention_class
payload_size_bytes
captured_at
captured_by
capture_source
```

`snapshot.entity_snapshot` contains the large immutable body:

```text
tenant_id
snapshot_id
captured_at
payload_json
```

Its FK is `(tenant_id, snapshot_id, captured_at)` to the identity row. The duplicated `captured_at` is intentional: it makes the payload table ready for future range partitioning without changing operational snapshot references.

Required uniqueness and access contracts:

- identity PK/unique `(tenant_id, id)`
- identity unique `(tenant_id, id, captured_at)` for the payload FK
- identity unique `(tenant_id, entity_type, entity_id, version_number)`
- identity unique `(tenant_id, entity_type, entity_id, payload_hash)` to prevent duplicate versions
- identity index `(tenant_id, entity_type, entity_id, captured_at desc)`
- identity index `(tenant_id, capture_kind, captured_at desc)`
- payload unique `(tenant_id, snapshot_id, captured_at)`
- optional effective-range index for entity types such as templates
- append-only triggers blocking `UPDATE` and `DELETE` on identity and payload
- context-bound capture API; application callers cannot supply tenant or actor
- serialized capture per `(tenant_id, entity_type, entity_id)`
- verified immediate-predecessor hash chain
- payload size and JSON-object checks before storage
- forced tenant RLS on identity and payload

## Stable foreign keys and future partitioning

The existing `document_snapshot` and Mesh `entity_snapshot` are range-partitioned by `captured_at`. PostgreSQL requires a unique key on a partitioned table to contain the partition key. Consequently, `(tenant_id, id)` cannot be a globally unique FK target when the table is partitioned only by capture time.

This matters because content, templates, workflow instances, render jobs, and future business documents need a reliable FK to one exact historical version.

Locked physical model:

```text
snapshot.entity_snapshot_identity
  initially non-partitioned
  PK/UNIQUE (tenant_id, id)
  one stable row per snapshot version
          |
          | 1:1
          v
snapshot.entity_snapshot
  initially non-partitioned
  immutable large JSON payload
```

All operational pointers use `(tenant_id, snapshot_id)` against `entity_snapshot_identity`. `entity_snapshot_identity` contains no large JSON and remains comparatively compact.

Partitioning is deliberately deferred until measured volume, tenant distribution, payload size, retention horizon, and query latency justify it. When required, only `snapshot.entity_snapshot` is converted to range partitions on `captured_at`. The identity PK and every operational FK remain unchanged.

Do not pre-create hundreds of entity-type partitions. Entity type is an indexed logical discriminator, not the physical partition key.

## Compiled artifact consolidation

Create one immutable Admin/Athyper-only `snapshot.compiled_artifact` table for the three compiled tables:

```text
id
tenant_id nullable for platform artifacts
source_snapshot_id
entity_type
entity_id
artifact_kind
artifact_scope          base | overlay | plane
plane_key nullable
overlay_set_hash nullable
source_contract_hash
compiled_json
compiled_hash
compliance_report
compliance_score
created_at
created_by
```

Compilation should always identify the source business snapshot. Recompilation creates a new artifact; it does not mutate an existing one.

Neon and Mesh do not author this table. If local execution needs the artifact, Admin publishes it and the receiving plane stores a hash-verified row in `runtime_meta.compiled_artifact_cache`.

## Runtime cache relocation

Move these mutable/rebuildable tables:

- `snapshot.lifecycle_route` -> `runtime_meta.lifecycle_route_cache`
- `snapshot.status_route` -> `runtime_meta.status_route_cache`

Each cache row should record `source_snapshot_id` and `source_payload_hash`. A mismatch means the cache is stale and must be rebuilt.

## Payload contracts by entity type

The generic table does not mean ungoverned JSON. Every snapshot-enabled entity must be registered with:

- stable `entity_type`
- payload JSON Schema and schema version
- allowed capture events and kinds
- serializer function/service
- maximum payload size
- retention class
- sensitive-field policy
- restore eligibility
- optional effective-date behavior

Examples:

| Entity type | Payload |
| --- | --- |
| `document.content_item` | body, format, locale and change summary |
| `master.template` | HTML/JSON content, header/footer, CSS, variable schema and assets |
| `control.lifecycle` | states, transitions, hooks, gates and timers |
| `master.bom` | released header and complete ordered component graph |
| P2P document types | header, lines, components, distributions, schedules and related records |

## Migration sequence

1. Build and validate the unified snapshot identity, payload, capture, lookup and chain-verification foundation in all three planes.
2. Add snapshot entity-type registry and payload-contract validation.
3. Migrate `document_snapshot` capture/read APIs first; provide compatibility views/functions while services are changed.
4. Migrate `content_item_version` and update `document.content_item.current_version_id` to the stable snapshot identity.
5. Migrate `template_version`, template current-version pointers, render requests and render workers.
6. Migrate `lifecycle_version`; update workflow version pins and add an execution cache if needed.
7. Migrate BOM release snapshots; production-order components become the frozen typed execution copy.
8. Consolidate `entity_compiled`, `entity_compiled_overlay` and `entity_plane_compiled` into `compiled_artifact`.
9. Move `lifecycle_route` and `status_route` to `runtime_meta` caches.
10. Dual-write and compare hashes/counts during transition.
11. Stop legacy writes, verify all readers, then remove legacy tables from the fresh-database manifest.

## Acceptance gates

- cross-tenant reads and writes rejected under forced RLS
- concurrent captures produce monotonic, unbroken chains
- identical payloads cannot create duplicate versions
- current-version, workflow-pin and render-job references have real FKs
- point-in-time and version-list queries use indexed coordinates
- payload schema version is validated for every registered entity type
- cache rows can be rebuilt solely from source snapshots
- legacy and generic snapshot payload hashes match during dual-write
- snapshot volume, payload-size, retention and query-latency observability is operational before production cutover
- representative load test covers expected payload sizes, capture rate, retention horizon and restore reads
