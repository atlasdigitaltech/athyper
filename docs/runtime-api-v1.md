# Runtime API v1

Canonical URL surface for the Neon runtime BFF. Lives under `/api/runtime/v1/*`.

## Why this exists

Pre-v1 the BFF spread runtime operations across five disjoint trees:

- `/api/runtime-records/*` — entity CRUD + process state
- `/api/document-runtime/*` — rules, lookups, bindings, relations, component actions
- `/api/runtime-options/*` — field option resolution
- `/api/pricing-component/*` — legacy supersede orchestration
- `/api/runtime/entities/*` — duplicate process-state stub

v1 collapses these into one namespace. Each handler body moved verbatim from
its legacy location (no behavior change). Callers go through the typed builder
`runtimePath` from `@athyper/api-contracts/runtime-paths`.

## URL convention

- `entities/[entity]` carries the entity slug when the request semantics are
  entity-scoped: CRUD, rules, relations, field options, process state.
- Endpoints that are addressed by a globally-unique code or by a request body
  payload sit at the v1 root without an `[entity]` segment:
  `lookups/`, `bindings/`, `components/`.

Plural collection segments take a selector (`bindings/[code]/records/[id]`).
Singular leaf segments take no selector (`rules`, `options`).

## Endpoint inventory

| Method     | Path                                                                  | Builder                                              |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| GET        | `/api/runtime/v1/entities/[entity]`                                   | `runtimePath.list(entity)`                           |
| POST       | `/api/runtime/v1/entities/[entity]`                                   | `runtimePath.create(entity)`                         |
| GET        | `/api/runtime/v1/entities/[entity]/[id]`                              | `runtimePath.detail(entity, id)`                     |
| PATCH      | `/api/runtime/v1/entities/[entity]/[id]`                              | `runtimePath.detail(entity, id)`                     |
| DELETE     | `/api/runtime/v1/entities/[entity]/[id]`                              | `runtimePath.detail(entity, id)`                     |
| GET        | `/api/runtime/v1/entities/[entity]/[id]/process-state`                | `runtimePath.processState(entity, id)`               |
| GET        | `/api/runtime/v1/entities/[entity]/rules`                             | `runtimePath.rules(entity)`                          |
| GET        | `/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]` | `runtimePath.relationRecords(entity, relation, parentId)` |
| GET        | `/api/runtime/v1/entities/[entity]/fields/[field]/options`            | `runtimePath.fieldOptions(entity, field)`            |
| GET        | `/api/runtime/v1/lookups/[lookup_code]`                               | `runtimePath.lookup(lookupCode)`                     |
| GET        | `/api/runtime/v1/bindings/[binding_code]/records/[parent_id]`         | `runtimePath.bindingRecords(bindingCode, parentId)`  |
| POST       | `/api/runtime/v1/components/supersede`                                | `runtimePath.componentSupersede()`                   |
| POST       | `/api/runtime/v1/components/update`                                   | `runtimePath.componentUpdate()`                      |
| POST       | `/api/runtime/v1/components/delete`                                   | `runtimePath.componentDelete()`                      |

## Header forwarding

The detail PATCH route accepts `If-Match: <row_version>` and forwards it to
the upstream records service for ETag-based optimistic concurrency. Without
it, concurrent saves degrade to last-write-wins.

Component POSTs propagate `Idempotency-Key` / `X-Idempotency-Key` when the
caller supplies them. Body shapes are AP-aligned: callers send
`source_doc_type` to scope the writer.

## Upstream targets

The v1 routes do not introduce a translation layer. Each handler body retains
the upstream calls it had in its legacy location (`/api/records/*`,
`/api/metadata/document-runtime/*`, `/api/metadata/lookups/*`,
`/api/finance/ap/invoices/:id/pricing-components/*`). When the runtime
service is later renamed to mirror the v1 namespace, those `fetch` URLs
update inside each handler — no new abstraction needed.

## Legacy → v1 mapping (deleted after Phase 4)

| Legacy                                                                   | Canonical v1                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `/api/runtime-records/[entity]`                                          | `/api/runtime/v1/entities/[entity]`                        |
| `/api/runtime-records/[entity]/[id]`                                     | `/api/runtime/v1/entities/[entity]/[id]`                   |
| `/api/runtime-records/[entity]/[id]/process-state`                       | `/api/runtime/v1/entities/[entity]/[id]/process-state`     |
| `/api/runtime/entities/[entity]/[id]/process-state` (duplicate)          | `/api/runtime/v1/entities/[entity]/[id]/process-state`     |
| `/api/document-runtime/[entity]/rules`                                   | `/api/runtime/v1/entities/[entity]/rules`                  |
| `/api/document-runtime/lookup/[lookup_code]`                             | `/api/runtime/v1/lookups/[lookup_code]`                    |
| `/api/document-runtime/binding/[binding_code]/records/[parent_id]`       | `/api/runtime/v1/bindings/[binding_code]/records/[parent_id]` |
| `/api/document-runtime/relation/[entity]/[relation]/records/[parent_id]` | `/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]` |
| `/api/runtime-options/[entity]/[field]`                                  | `/api/runtime/v1/entities/[entity]/fields/[field]/options` |
| `/api/document-runtime/component/supersede`                              | `/api/runtime/v1/components/supersede`                     |
| `/api/document-runtime/component/update`                                 | `/api/runtime/v1/components/update`                        |
| `/api/document-runtime/component/delete`                                 | `/api/runtime/v1/components/delete`                        |
| `/api/pricing-component/supersede` (legacy orchestrator)                 | `/api/runtime/v1/components/supersede`                     |

## Enforcement

`apps/neon/scripts/check-runtime-api-paths.ts` scans `.ts` and `.tsx` files
under `apps/` and `packages/` for legacy path literals. Phase 1 runs in warn
mode (`pnpm --filter @athyper/neon run runtime:path-check`). Phase 5 wires
`--strict` into the `lint` script — any reintroduction fails the build.

## Future: runtime service rename

The v1 namespace is the BFF surface only. The upstream runtime service still
serves `/api/records/*`, `/api/document-runtime/*`, etc. A follow-up PR
renames the runtime side to match (`/api/runtime/v1/*`), after which the
`fetch` URLs inside each v1 handler collapse to identity rewrites and the
legacy upstream paths disappear.
