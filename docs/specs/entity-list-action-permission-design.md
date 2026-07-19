# Entity List Action Permission Design

**Status:** Proposed
**Date:** 2026-07-19
**Scope:** Runtime entity list actions in Neon, beginning with Create and Export
**Related:** `docs/meta-entity/entity-operations.md`, `docs/local/architecture/three-plane-permission-stack.md`

## 1. Outcome

Every entity-list action is derived from one effective, server-produced operation contract. The same permission code gates both the UI affordance and the executing API. The UI never infers authorization from feature flags, labels, or the presence of a route.

The design applies to:

- Create
- Export
- Import
- Bulk update and other selection actions
- Entity-specific list operations
- Reload and other local list utilities that require no business permission

The initial implementation slice is Create and Export.

## 2. Current-State Findings

The repository already provides most of the authorization foundation:

- `control.entity_operation` describes permission code, surface, placement, handler, order, and enabled state.
- `PermissionContext` resolves effective permissions by plane, tenant, principal/persona, plan, module, feature, and grant.
- The runtime compiler derives `canCreate`, `canEdit`, and `canDelete` plus disabled reasons.
- Runtime list Create currently renders only when `capabilities.canCreate` resolves to a `createHref`.
- Runtime list features contain `export`, `import`, and `bulkActions`, but these are feature booleans rather than authorization decisions.
- The list overflow currently removes disabled operations, although the entity-operation documentation says denied operations may be returned disabled for explanatory UX.
- The generic runtime list has no complete Export operation execution contract or generic export route.
- Read/list authorization must be enforced before entity SQL, independently of whether the UI list route was reachable.

The principal gap is that CRUD capabilities, list feature flags, operation permissions, and runtime action state are represented differently. This creates inconsistent behavior such as Create disappearing without an explanation and Export being a feature toggle without a corresponding permission decision.

## 3. Design Principles

1. **One operation, one permission code.** An action's `entity_operation.permission_code` is the authorization binding used by descriptor resolution and execution.
2. **Feature is not permission.** Feature metadata says whether the entity/product supports an action. Permission context says whether the principal may execute it.
3. **Descriptor is a safe UI projection.** It may explain availability, but the executing endpoint always rechecks authorization, scope, and current runtime conditions.
4. **Deny by default.** Missing operation metadata, missing permission binding, invalid handler, or unresolved scope disables the business action.
5. **Explain stable denials.** A configured action remains visible but disabled when disclosure is safe; the UI shows a human-readable reason.
6. **Do not disclose unauthorized entities.** If entity Read is denied, return 403/404 according to the existing anti-enumeration policy and do not return the list descriptor or rows.
7. **Scope travels with the action.** Export uses the same protected tenant/legal-entity/company scope and field masking as the list query.
8. **Server utilities are distinct from business operations.** Reload, arrange columns, density, and client-side search do not need entity operation permissions.

## 4. Permission Matrix

The matrix has four gates: entity Read, feature support, operation permission, and request eligibility.

| Action | Operation permission | Read required | Feature gate | Runtime gate | Default placement | Server enforcement |
|---|---|---:|---|---|---|---|
| Open list / query | `read` | — | entity visible on plane | valid tenant and access scope | route | query route before SQL |
| Create | `create` | Yes | writable entity and supported create mode | handler valid; required create context resolvable | `PRIMARY` | create/draft-init route |
| Export current view | `export` | Yes | `list_features.export=true` | exportable fields remain after masking; limits valid | `OVERFLOW` | export route/job |
| Import | `import` | Yes | `list_features.import=true` | template and import mode configured | `OVERFLOW` | upload and worker execution |
| Bulk update | `bulk_update` | Yes | `list_features.bulkActions=true` | selection non-empty; all records in scope; field policy allows | selection bar | bulk mutation route |
| Bulk delete | `delete` or dedicated `bulk_delete` | Yes | bulk + deletion mode enabled | selection eligible; lifecycle allows each row | selection danger group | bulk mutation route |
| Entity-specific list action | operation's declared code | Yes | operation configured | handler-specific conditions | metadata-defined | declared execution target |
| Reload list | none | Yes (already required for list) | runtime list available | request active | List utility section | normal list query guard |
| Save view | saved-view permission/policy | Yes | saved views enabled | ownership/scope valid | organize control | saved-view route |

### 4.1 Decision semantics

For a business action, effective state is resolved in this order:

```text
entity plane/read access
  -> entity or list feature support
  -> configured entity_operation
  -> effective permission decision
  -> entity mutability/policy
  -> lifecycle or selection eligibility
  -> handler validity
  -> enabled
```

The first failing gate supplies the disabled reason. Execution repeats the applicable gates using current server state.

### 4.2 Permission naming

Keep the current canonical operation codes (`read`, `create`, `update`, `delete`, `export`, `import`) and resolve legacy aliases through `control.permission_alias`. Do not authorize by token-matching labels such as “New”, “Add”, or “Download”.

Entity-specific permission catalog entries may remain namespaced internally, but `entity_operation.permission_code` and the effective permission set must use the same canonical code after alias resolution.

## 5. Contract Changes

### 5.1 Replace CRUD-only capability hints with action capabilities

Retain `canCreate`, `canEdit`, and `canDelete` temporarily for compatibility, but add a normalized action capability map:

```ts
type EffectiveActionState = "enabled" | "disabled" | "hidden";

interface EffectiveEntityAction {
  key: string;
  permissionCode: string;
  surface: "LIST" | "DETAIL" | "BOTH";
  placement: "PRIMARY" | "TOOLBAR" | "OVERFLOW" | "CONTEXT" | "COMMAND";
  state: EffectiveActionState;
  disabledReason: DisabledReason | null;
  handler: {
    type: "NAVIGATE" | "API" | "MODAL" | "INLINE";
    target: string | null;
  };
  requiresSelection: boolean;
  selectionCardinality?: "single" | "multiple" | "both";
}
```

`capabilities.canCreate` becomes a compatibility projection of the effective Create operation rather than an independently derived source of truth.

Add compatibility flags only where useful:

```ts
canExport: boolean;
canExportReason: DisabledReason | null;
canImport: boolean;
canImportReason: DisabledReason | null;
```

The action collection remains authoritative; these booleans ease migration of existing consumers.

### 5.2 Separate list feature support

`RuntimeListFeatures.export`, `import`, and `bulkActions` continue to describe supported UI/runtime features. They must not directly render an action. An action renders only from the intersection:

```text
feature enabled AND effective operation present
```

This permits these valid states:

| Feature | Permission | Result |
|---|---|---|
| Off | Allow | Hidden; entity does not support the action |
| On | Missing operation | Disabled in diagnostics; hidden in production UI |
| On | Deny | Visible disabled when disclosure policy allows |
| On | Allow | Enabled |

### 5.3 Disabled reasons

Use the existing taxonomy and add action-specific reasons only when the existing code cannot accurately explain the denial:

- `feature_disabled`
- `missing_permission`
- `denied_by_grant`
- `plan_locked`
- `module_disabled`
- `plane_excluded`
- `entity_readonly`
- `record_status_blocked`
- `handler_invalid`
- `scope_unresolved` (new)
- `selection_required` (new, transient client/runtime state)
- `export_limit_exceeded` (new, returned by export preflight)
- `no_exportable_fields` (new, field-security result)

Transient reasons such as `selection_required` should be computed client-side from a server-authorized action. Permission reasons must only come from the server.

## 6. UI Behavior

### 6.1 List command bar

- Create is the primary button when its effective action state is `enabled`.
- If Create is `disabled` and disclosure is allowed, show the button disabled with a tooltip such as “You do not have permission to create GL accounts.”
- If Create is structurally unsupported or the entity itself is undisclosed, hide it.
- Never synthesize `/app/{entity}/new` when the operation is present but denied or invalid.

### 6.2 More actions menu

Order sections as follows:

1. **Entity operations** — Export, Import, and metadata-defined top-level actions.
2. **List** — Reload list and other non-mutating utilities.

Enabled operations are interactive. Disabled disclosed operations remain visible with a lock/info affordance and reason. An empty “No entity operations available” panel is shown only when no configured, disclosable operation exists.

Export defaults to `OVERFLOW`. It should not be a primary toolbar action for ordinary entity lists.

### 6.3 Export interaction

“Export current view” means:

- current server-side filters and search
- current sort order
- current visible columns, intersected with field-read/export policy
- protected access-scope predicates supplied by the server, never trusted from the browser
- all matching rows up to the synchronous limit; above it, create an asynchronous export job

The export dialog may offer CSV and XLSX when supported. It shows an estimated row count and warns when the export will run asynchronously.

## 7. API Enforcement

### 7.1 Read/list

The generic entity query route must require effective `read` permission before cache lookup or entity SQL. Tenant, legal-entity, company-code, row, and field restrictions remain additive gates.

### 7.2 Create

Every create entry point—including `/new`, direct create, early draft initiation, source-document create, copy-from, and the final mutation route—must recheck the Create operation permission. Guarding only the initial list button is insufficient.

### 7.3 Export

Introduce a generic endpoint such as:

```text
POST /api/runtime/v1/entities/{entity}/export
```

Request:

```json
{
  "format": "csv",
  "query": {
    "search": "...",
    "filters": {},
    "sort": [],
    "columns": []
  },
  "mode": "current_view"
}
```

The server must:

1. resolve verified request and permission context;
2. require entity Read and Export operations;
3. rebuild and sanitize the list query using the same query service as the screen;
4. inject protected scope filters server-side;
5. remove unreadable, masked, non-exportable, and unknown fields;
6. apply row/size/rate limits;
7. execute synchronously or enqueue an export job;
8. write export and permission-decision audit records;
9. return a short-lived download handle, never a storage path.

Bulk and asynchronous workers must carry a signed immutable authorization snapshot and revalidate revocation/permission stamp before execution.

## 8. Caching and Invalidation

Effective actions are permission-scoped descriptor data. Descriptor and browser-list caches must include the permission/profile stamp already defined by the three-plane permission architecture.

Invalidate or segregate cached action state when any of these change:

- principal/persona or active organization
- tenant or company/legal-entity context
- permission stamp/profile hash
- plan, module, or feature entitlement
- `entity_operation`, `entity_policy`, lifecycle masks, or field security policy

Client context-switch events must clear both rows and action capability state. A stale enabled button is acceptable only as a cosmetic race; the API must still deny execution.

## 9. Migration Plan

### Phase 1 — Contract and resolver

- Extend disabled reasons.
- Add the normalized effective action contract.
- Project Create/Edit/Delete compatibility flags from actions.
- Add Export/Import compatibility flags.
- Ensure denied configured operations survive descriptor projection as disabled where disclosure is permitted.

### Phase 2 — Runtime list UI

- Render Create from the effective action.
- Render Export and Import in More actions.
- Stop filtering all disabled operations out of the overflow menu.
- Add reason tooltips and accessible disabled descriptions.
- Keep Reload as a local utility without a new permission.

### Phase 3 — Server routes

- Enforce Read before generic list SQL/cache access.
- Enforce Create at every launcher and mutation entry point.
- Add generic export preflight/execution with scope and field security reuse.
- Add audit, limits, and asynchronous job handoff.

### Phase 4 — Metadata and administration

- Seed/repair Create and Export operations for eligible entities, starting with `gl_account`.
- Add Metadata Studio validation: feature-enabled business actions require a valid operation and handler.
- Show effective permission and disabled-reason diagnostics in Studio.

### Phase 5 — Import and bulk actions

- Apply the same operation contract to Import and selection actions.
- Add per-record lifecycle handling and partial-result semantics for bulk execution.

## 10. Test Matrix

Minimum automated cases for each list business action:

| Read | Feature | Operation permission | Scope | Expected UI | Expected API |
|---:|---:|---:|---|---|---|
| Deny | On | Allow | valid | entity/list undisclosed | deny before SQL |
| Allow | Off | Allow | valid | action hidden | deny/not configured |
| Allow | On | Missing | valid | hidden or diagnostic-disabled | deny |
| Allow | On | Explicit deny | valid | disabled with reason | 403 |
| Allow | On | Plan locked | valid | disabled with reason | 403 |
| Allow | On | Allow | unresolved | disabled with scope reason | 403 |
| Allow | On | Allow | valid | enabled | success |
| Allow | On | Allow then revoked | valid | possibly stale until refresh | 403; cache invalidated |

Additional Export cases:

- field security removes prohibited columns;
- no exportable fields fails closed;
- injected tenant/company filter is ignored or rejected;
- current-view filter/sort parity with list query;
- synchronous and asynchronous thresholds;
- permission stamp changes before worker execution;
- audit record contains entity, principal, scope, format, row count, and correlation ID without exported data values.

Playwright acceptance for `gl_account`:

1. Finance administrator sees enabled Create and Export.
2. Read-only accountant sees disabled disclosed actions with reasons.
3. User without GL Account Read cannot open the route or query its records.
4. Export contains only permitted rows and columns.

## 11. Acceptance Criteria for the First Slice

- GL Account list displays Create as a primary action when `gl_account/create` is allowed.
- GL Account list displays Export in More actions when both feature support and `gl_account/export` are effective.
- Denied actions do not silently appear enabled and do not execute through direct URLs.
- Stable denial reasons are accessible by keyboard and screen reader.
- List, Create, and Export endpoints independently enforce permissions and scope.
- No list/entity SQL runs when Read is denied.
- Export reuses list query semantics and field security.
- Permission/profile changes cannot reuse an incompatible descriptor or browser-list cache entry.

## 12. Explicit Non-Goals

- Designing the role/persona administration UI.
- Replacing `PermissionContext` or `control.entity_operation`.
- Granting permissions based on UI feature flags.
- Treating browser-side hiding as authorization.
- Defining business-specific export layouts; those can be separate named operations later.
