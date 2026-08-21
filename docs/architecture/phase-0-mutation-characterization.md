# Phase 0 mutation-path characterization

Status: baseline captured 2026-07-14  
Scope: records service, Neon runtime mutation adapters, and directly invoked business services  
Rule: this document and its companion tests describe current behavior. They do not prescribe or change runtime behavior.

## Purpose

This is the behavior freeze for the entity-mutation consolidation project. A later phase may intentionally change these contracts, but only by updating the relevant golden test and recording the change in the migration log.

The authoritative route composition boundary is `server/packages/services/records/routes/index.ts`. It installs one verified-request-context middleware and then mounts the generic records route plus specialized import, bulk, action, lifecycle, version, snapshot, supplier, and business-partner routes. Many handlers inside `records.route.ts` still repeat bearer, tenant, realm, and principal resolution; that duplication is part of the current baseline.

## Representative entities

| Surface | Representative | Current metadata/runtime observation |
|---|---|---|
| Simple | `tax_group` candidate plus the abstract `renderer: simple` routing contract | No seeded entity explicitly declares `detail_renderer: simple`. The compiler currently falls back to `master` for CONTROL/REFERENCE entities. The `simple` branch is nevertheless supported and routes to classic edit. This is a coverage/configuration gap, not corrected in Phase 0. |
| Master | `company_code` | MASTER, table-backed, controlled mutation, classic edit. |
| Document | `purchase_order` | DOCUMENT, view-backed, `PurchaseOrderFacade`, document workspace, commitment backing source. |
| Document | `purchase_invoice` | DOCUMENT, table-backed, document workspace, specialized defaults and lifecycle commands. |
| Ledger | `gl_balance` | Generated from the `ledger` schema as LEDGER and read-only metadata; renderer resolves to ledger and edit routing rejects it. |

`journal_entry` is deliberately not the ledger representative. Its current entity contract classifies it as DOCUMENT with lines and workflow behavior, so treating it as generic read-only ledger data would produce a false baseline.

## Mutation-path inventory

### Generic single-record CRUD

| Path | Handler/owner | Current behavior summary |
|---|---|---|
| `POST /runtime/v1/entities/:entity` and `/records/:entity` | `createHandler`, `records.route.ts` | Verifies identity again, resolves metadata and tenant, filters non-writable fields silently, authorizes create, applies entity-specific defaults/facades, uses entity-create idempotency for applicable paths, inserts, emits search outbox on several paths, invalidates list cache, returns `201` or facade-specific response. Some outbox calls occur after the business write. |
| `PUT /runtime/v1/entities/:entity/:id` and legacy alias | `updateHandler`, `records.route.ts` | Resolves business key, rejects status-locked fields but silently drops other non-writable fields, authorizes update, optionally validates lease plus version, applies source-change behavior, updates in a transaction, emits search outbox after commit, writes activity best-effort, invalidates list cache, returns the enriched row. |
| `PATCH /runtime/v1/entities/:entity/:id` and legacy alias | `patchHandler`, `records.route.ts` | Requires `If-Match`/expected version and `Idempotency-Key`, authorizes update, validates status locks and applicable edit lock, claims/completes idempotency in the versioned update transaction, returns ETag and replay headers, emits search outbox after the mutation transaction, logs activity and invalidates list cache. |
| `DELETE /runtime/v1/entities/:entity/:id` and legacy alias | `deleteHandler`, `records.route.ts` | Authorizes metadata-enabled generic hard delete, physically deletes by tenant and UUID, then emits search-delete outbox separately, invalidates list cache, publishes `record.deleted` through Redis SSE, returns `204`. |

### Document workspace, drafts, locks, and versions

| Path | Handler/owner | Current behavior summary |
|---|---|---|
| `POST /runtime/v1/entities/:entity/:id/edit/submit` | `documentEditSubmitHandler` and `applyDocumentEditMutation` | Validates signed workspace capability and compiled plan, authorization, status locks, lock/version and idempotency; applies header and declared collection changes in a transaction; completes runtime state and emits durable document/search events. Returns committed/replay/conflict result shapes. |
| `POST .../:entity/draft/initiate` | `initiateDraftHandler` | Enforces create mode and idempotency. Claim, provisional insert/resume, runtime state, and completion share a transaction. |
| `POST .../:id/draft/promote` | `promoteDraftHandler` | Promotes an early draft with authorization, concurrency/idempotency, domain defaults, and transactional persistence. |
| `POST .../:id/draft/discard` | `discardDraftHandler` | Discards a provisional draft under draft ownership/policy checks. |
| `POST/GET/PUT/DELETE .../:id/lock...` | lock handlers in `records.route.ts` | Acquires, reads, renews, releases, or force-releases edit leases through the shared edit-lock service. Lock errors include required, invalid, expired, held, and forbidden variants. |
| `POST .../:id/amend` | `versions.route.ts` | Creates an amendment/version according to document policy rather than using generic PATCH. |
| `POST .../:id/snapshots/:snapshotId/restore` | `snapshots.route.ts` | Restores supported document snapshots through specialized P2P restoration logic. |

### Lines and accounting distributions

| Path | Handler/owner | Current behavior summary |
|---|---|---|
| `POST .../:id/lines` | `createLineHandler` | Resolves parent/line binding, authorizes parent update, validates lifecycle/lock rules and defaults, inserts line and applies child effects. |
| `POST .../:id/lines/:lineId/copy` | `copyLineHandler` | Copies a supported line using entity-line binding and child behavior. |
| `PATCH .../:id/lines/:lineId` | `patchLineHandler` | Applies line field changes with parent ownership, status and child-effect checks. |
| `DELETE .../:id/lines/:lineId` | `deleteLineHandler` | Uses the entity-line delete registry when specialized deletion is registered; otherwise uses generic binding behavior. |
| `POST .../:lineId/distributions` | `createDistributionHandler` | Validates parent/line scope and distribution totals, then creates an accounting distribution. |
| `PUT .../:lineId/distributions` | `replaceLineDistributionsHandler` | Replaces the distribution set as one bundle transaction. |
| `PATCH .../:lineId/distributions/:distId` | `patchDistributionHandler` | Updates a scoped distribution and validates resulting allocation totals. |
| `DELETE .../:lineId/distributions/:distId` | `deleteDistributionHandler` | Deletes a scoped distribution subject to parent lifecycle locking. |

Canonical runtime aliases exist for distribution operations, but line create/patch/delete still have incomplete canonical alias coverage. That inconsistency is part of the baseline.

### Write facades

| Binding | Owner | Current behavior |
|---|---|---|
| `PurchaseOrderFacade` | `write-facade.registry.ts` -> `createPurchaseOrderViaFacade` | Allows create for the view-backed `purchase_order` entity and writes to its commitment backing aggregate. Registry currently exposes create only. |
| Direct purchase-invoice create branch | `createHandler` -> purchase-invoice business handler | Specialized create is selected directly by entity code rather than exclusively through the facade registry. |

### Entity operations and lifecycle commands

| Path | Owner | Current behavior |
|---|---|---|
| `POST /runtime/v1/entities/:entity/op/:op` | `entityOpHandler` plus `entity-op.registry.ts` | Source-document conversion operations use a registered workspace scope, capability profile, request identity paths, idempotency policy, and runtime invalidation policy. Registered business operations create commitment, receipt, service sheet, invoice, or payment aggregates. |
| `POST .../:entity/:id/action/:code` | `action-dispatcher.route.ts` | Resolves operation metadata and authorization, company scope and lifecycle command target. Lifecycle-orchestrated paths use transaction-owned transition/audit/outbox behavior; some non-lifecycle action implementations retain specialized branches. |
| lifecycle registry | `lifecycle-command.registry.ts` | Current explicit commands cover requisition/receipt/service-sheet submit and purchase-invoice submit/post/reverse. Payloads use allowlists and reject unknown fields. |
| legacy lifecycle route | `lifecycle.route.ts` | Compatibility surface still exists separately from the generic action dispatcher. |

### Import and bulk operations

| Path | Owner | Current behavior |
|---|---|---|
| `POST /records/:entity/import/upload` | `import.route.ts` | Validates upload, entity/import permissions and storage, then queues import processing. It does not call generic create per row in the request process. |
| `POST /records/:entity/import` | `import.route.ts` | Accepts import metadata/source and queues work after permission and input checks. Worker-side row mutation is a separate mutation path that must be included when the kernel is introduced. |
| `POST /records/:entity/bulk-preflight` | `bulk-preflight.route.ts` | Read/validation preflight only; it does not persist entity changes. |
| `PATCH /records/:entity/bulk` | `bulk-crud.route.ts` | Applies generic bulk patch authorization/field filtering and row updates independently of single-record PATCH semantics. |
| `DELETE /records/:entity/bulk` | `bulk-crud.route.ts` | Applies generic bulk delete policy independently of the single-record delete handler. |
| `POST /records/:entity/bulk-action` | `bulk-action.route.ts` | Runs action-specific transitions or patches across selected IDs; includes its own idempotent target-state handling and system-column filtering. |

### Specialized and internal domain mutation services

These are mutation entry points even when no public route maps to them directly:

- P2P conversion services registered by `entity-op.registry.ts`:
  commitment from requisition, receipt from commitment, service sheet from commitment, invoice from receipt/service sheet, and payment from invoice.
- Purchase-invoice submit/post/reverse preparation and handlers.
- Purchase-order facade and commitment-backed persistence.
- Lifecycle hook runner, notification dispatcher, snapshot capture/restore, and transaction-flow dispatcher.
- Pricing-component create/update/supersede and accounting refresh services.
- Schedule-line and accounting-distribution services.
- Ledger/posting services under `server/packages/services/business/ledger` and finance posting handlers.
- Supplier and business-partner intake/extension routes, which own specialized aggregate writes outside generic CRUD.
- Version amendment and snapshot restore services.
- Background import workers and outbox handlers that persist state or projections.

When Phase 3 begins, each item above must either call the mutation kernel, be explicitly classified as an internal projection/posting boundary, or be documented as non-entity state.

## Behavior matrix

Legend: `Y` present; `P` partial/path-dependent; `N` absent; `NA` not applicable; `post` means performed after the principal business transaction.

| Path | Authorization | Field/input validation | Status locking | Concurrency | Idempotency | Audit/activity | Durable outbox | Cache | SSE | Response |
|---|---|---|---|---|---|---|---|---|---|---|
| Generic POST | Y | P: non-writable fields can be dropped | P | P by create mode | P | P/best-effort | P, often post | invalidate | N | `201` row/facade outcome; replay variants |
| Generic PUT | Y | P: status fields reject; others drop | Y | P: metadata lease/version | N | activity post/best-effort | post | invalidate | status-dependent | `200` enriched row |
| Generic PATCH | Y | P: status fields reject; others drop | Y | Y: version plus applicable lease | Y | activity post/best-effort | post | invalidate | status-dependent | `200` row + ETag; replay/conflict variants |
| Generic DELETE | Y | metadata hard-delete gate | indirect | N | N | N/P | post | invalidate | `record.deleted` | `204` |
| Workspace submit | Y + capability | Y for header/declared collections | Y | Y: plan/version/lock | Y | Y/P by effect | Y inside main mutation transaction | invalidate/event driven | runtime events | typed committed/replay/conflict body |
| Draft initiate/promote | Y | create-mode/default validation | lifecycle/draft policy | Y where promoted | Y | P | Y/P | invalidate | runtime events | `201/200`, replay/conflict variants |
| Line CRUD | parent update auth | line metadata + domain checks | Y | P | N/P | accounting audit on distributions | P | refresh/invalidate | workspace invalidation P | row or `204` |
| Distribution replace | parent update auth | totals and ownership | Y | transaction bundle | N | Y accounting audit | P | refresh/invalidate | workspace invalidation P | collection/row |
| Entity op | operation permission + workspace capability | registered request scope/domain validation | source policy | P | Y from registry contract | domain-owned | P/Y by handler | runtime invalidation | runtime operation event | registered outcome/status |
| Lifecycle action | operation permission/company scope | payload allowlist + transition guards | canonical transition | Y in orchestrated paths | Y in orchestrated paths | Y | Y in orchestrated paths | projection driven | status event P | transition outcome |
| Bulk patch/delete | bulk permission | independent bulk rules | P | N/P | N | P | P | P | N | multi-result envelope |
| Import | import permission | upload/schema preflight; worker owns row validation | worker-dependent | worker-dependent | job/import identity P | job audit P | worker-dependent | worker-dependent | N | accepted/job status |
| Internal domain service | caller-dependent | domain-specific | domain-specific | transaction-specific | service-specific | service-specific | service-specific | service-specific | NA | typed service outcome/exception |

## Error and response contract baseline

The following families are currently observable and must remain covered while extraction occurs.

| Concern | Current error examples | Typical status/response notes |
|---|---|---|
| Authentication/context | `UNAUTHENTICATED`, `TENANT_REQUIRED`, `PRINCIPAL_NOT_FOUND`, binding/context failures | 400/401/403; some tenant misses are intentionally returned as record 404. |
| Entity/record | `ENTITY_NOT_FOUND`, `RECORD_NOT_FOUND`, `ENTITY_READ_ONLY`, `ENTITY_BACKING_READ_ONLY` | 403/404. |
| Capabilities | `CREATE_NOT_ALLOWED`, `EDIT_NOT_ALLOWED`, `DELETE_NOT_ALLOWED`, `DOCUMENT_WORKSPACE_REQUIRED`, `CREATE_MODE_MISMATCH` | BFF rejects document generic mutation with 409 before upstream transport. |
| Authorization | `ENTITY_POLICY_REQUIRED`, `ENTITY_POLICY_DENIED`, `ENTITY_OPERATION_REQUIRED`, `ENTITY_OPERATION_DISABLED`, `PERMISSION_DENIED`, `COMPANY_SCOPE_DENIED` | Primarily 403. |
| Fields | `FIELD_NOT_EDITABLE`, `VALIDATION_FAILED`, `SYSTEM_FIELD_NOT_WRITABLE`, source-change validation errors | 400/422. Non-status non-writable fields may currently be silently discarded. |
| Locking | `LOCK_REQUIRED`, `LOCKED`, `LOCK_INVALID`, `LOCK_EXPIRED` | 410/423 depending on condition. |
| Concurrency | `VERSION_REQUIRED`, `VERSION_CONFLICT`, plan/version mismatch errors | 400/409/412. Classic PATCH currently uses 412 for its upstream version conflict contract while the BFF also has a 409 preflight conflict. |
| Idempotency | `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS` | 400/409; replay adds `X-Idempotency-Cache: replay`. |
| Registry/configuration | `WRITE_FACADE_NOT_REGISTERED`, `ENTITY_OP_NOT_FOUND`, `LIFECYCLE_COMMAND_NOT_REGISTERED`, `LIFECYCLE_FLOW_ENTITY_MISMATCH`, `LIFECYCLE_PAYLOAD_REJECTED` | 4xx/5xx depends on whether invalid configuration is discovered at request time. |
| Aggregate children | parent/line not found, child mutation disabled, invalid distribution total, locked-child errors | 400/404/409/422. |

Successful response baselines:

- create: `201` with created row or specialized facade body;
- PUT/PATCH: `200` with enriched row;
- PATCH replay: `200` plus `X-Idempotency-Cache: replay`;
- versioned read/write: ETag when a row version is available;
- delete: empty `204`;
- bulk: per-record success/failure envelope;
- import: accepted/job metadata rather than created entity rows;
- lifecycle/entity operations: registered status and operation-specific body.

## Golden and architecture tests

- `phase0-mutation-characterization.test.ts` freezes the route mounts, representative entity classifications, classic/document/ledger edit boundaries, and key current mutation behaviors.
- `generic-kernel-entity-branch-budget.test.ts` ratchets direct entity-specific conditions in `records.route.ts`. Initial baseline: 27 direct literal equality/inequality checks and one array-membership branch site. Counts may decrease without changing the ceiling; increases fail CI.

## Exit checklist

- [x] Generic POST, PUT, PATCH and DELETE inventoried.
- [x] Workspace, draft, lock, line and distribution paths inventoried.
- [x] Facade, entity-operation and lifecycle registries inventoried.
- [x] Import and bulk paths inventoried.
- [x] Specialized/internal domain entry-point families inventoried.
- [x] Behavior and response/error matrices captured.
- [x] Master, document and ledger representatives tied to current metadata.
- [x] The supported-but-unseeded simple surface is explicitly characterized.
- [x] Entity-specific branch ceiling established.
- [x] Runtime source remains unchanged by Phase 0.

