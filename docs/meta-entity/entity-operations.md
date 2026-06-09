# Entity Operations

Entity operations define the action surface for every entity in Athyper — what actions exist, where they appear in the UI, how they are invoked, and which permission gates them. All definitions live in `control.entity_operation`.

---

## `control.entity_operation`

One row per (entity, permission_code) pair. Permission codes are the authoritative identifiers for operations — they are also used in lifecycle transitions and policy rules.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global; NOT NULL = tenant override |
| `entity_name` | `text` | FK to entity registry (e.g. `journal_entry`) |
| `permission_code` | `text` | FK → `shared.permission.code` (e.g. `JOURNAL_ENTRY.APPROVE`) |
| `surface` | `text` | Where the action appears (see below) |
| `placement` | `text` | Grouping within the surface (see below) |
| `handler_type` | `text` | How the action is invoked (see below) |
| `handler_target` | `text` | URL path, modal component name, or API route |
| `is_record_required` | `bool` | `true` = requires a selected record; `false` = bulk or top-level |
| `sort_order` | `smallint` | Display order within the same placement group |
| `label_override` | `text` | UI label; NULL = use the permission's default label |
| `icon_override` | `text` | Icon key from `@athyper/icons`; NULL = use permission default |
| `tcode_alias` | `text` | SAP-style T-code alias (e.g. `FB50`) for power-user keyboard nav |
| `is_enabled` | `bool` | Soft-disable without deleting |

**Unique:** `(tenant_id, entity_name, permission_code) NULLS NOT DISTINCT`

---

## Surface Values

Controls which UI surface the action renders on.

| Value | Description |
|---|---|
| `LIST` | Visible on the list/grid page only |
| `DETAIL` | Visible on the record detail/view page only |
| `BOTH` | Visible on both list and detail pages |
| `PALETTE_ONLY` | Not rendered inline; only accessible via command palette / T-code |
| `HIDDEN` | Registered for authz / audit purposes only; no UI rendering |

---

## Placement Values

Controls grouping and visual placement within the surface.

| Value | Description |
|---|---|
| `PRIMARY` | Main call-to-action button (max 1–2 per surface) |
| `TOOLBAR` | Top toolbar — icon + label buttons |
| `OVERFLOW` | `…` overflow / dropdown menu |
| `CONTEXT` | Right-click context menu (grid rows) |
| `COMMAND` | Command palette only |

---

## Handler Types

| Value | Behaviour |
|---|---|
| `NAVIGATE` | Browser navigation to `handler_target` (a relative URL) |
| `API` | POST to `handler_target` API route; response drives toast/refresh |
| `MODAL` | Opens a modal component named by `handler_target` |
| `INLINE` | Inline edit mode within the grid row |

---

## Canonical Operation Codes

Operations are grouped by module prefix. The following codes are seeded platform-wide:

### Finance

| Permission Code | Label | Surface | Placement | Handler |
|---|---|---|---|---|
| `JOURNAL_ENTRY.VIEW` | View | BOTH | TOOLBAR | NAVIGATE |
| `JOURNAL_ENTRY.CREATE` | New Journal | LIST | PRIMARY | MODAL |
| `JOURNAL_ENTRY.EDIT` | Edit | DETAIL | PRIMARY | MODAL |
| `JOURNAL_ENTRY.SUBMIT` | Submit for Approval | DETAIL | PRIMARY | API |
| `JOURNAL_ENTRY.APPROVE` | Approve | DETAIL | PRIMARY | API |
| `JOURNAL_ENTRY.REJECT` | Reject | DETAIL | TOOLBAR | MODAL |
| `JOURNAL_ENTRY.POST` | Post | DETAIL | PRIMARY | API |
| `JOURNAL_ENTRY.REVERSE` | Reverse | DETAIL | OVERFLOW | MODAL |
| `JOURNAL_ENTRY.EXPORT` | Export | LIST | OVERFLOW | API |
| `INVOICE.VIEW` | View Invoice | BOTH | TOOLBAR | NAVIGATE |
| `INVOICE.APPROVE` | Approve Invoice | DETAIL | PRIMARY | API |
| `INVOICE.REJECT` | Reject Invoice | DETAIL | TOOLBAR | MODAL |
| `INVOICE.MARK_PAID` | Mark as Paid | DETAIL | PRIMARY | API |
| `INVOICE.QUICK_PAY` | Quick Pay | DETAIL | OVERFLOW | MODAL |

### Procurement

| Permission Code | Label | Surface | Placement | Handler |
|---|---|---|---|---|
| `PURCHASE_INVOICE.SUBMIT` | Submit | DETAIL | PRIMARY | API |
| `PURCHASE_INVOICE.APPROVE` | Approve | DETAIL | PRIMARY | API |
| `PURCHASE_INVOICE.MATCH` | Match PO | DETAIL | TOOLBAR | MODAL |
| `PURCHASE_INVOICE.POST` | Post to GL | DETAIL | PRIMARY | API |

### Master Data

| Permission Code | Label | Surface | Placement | Handler |
|---|---|---|---|---|
| `SUPPLIER.CREATE` | New Supplier | LIST | PRIMARY | MODAL |
| `SUPPLIER.EDIT` | Edit | DETAIL | PRIMARY | MODAL |
| `SUPPLIER.DEACTIVATE` | Deactivate | DETAIL | OVERFLOW | API |
| `SUPPLIER.APPROVE` | Approve | DETAIL | PRIMARY | API |

### Governance / Lifecycle

| Permission Code | Label | Surface |
|---|---|---|
| `ENTITY.ARCHIVE` | Archive | OVERFLOW |
| `ENTITY.RESTORE` | Restore from Archive | OVERFLOW |
| `ENTITY.LEGAL_HOLD` | Apply Legal Hold | OVERFLOW |
| `ENTITY.EXPORT_AUDIT` | Export Audit Trail | OVERFLOW |

---

## Operation Taxonomy — Edit Modes

Operations are further classified by edit-mode context. This governs how the `runtime-canvas` renders them:

| Edit Mode | Description | Example Operations |
|---|---|---|
| `document` | Full document editing (multi-section forms) | CREATE, EDIT, REVERSE |
| `edit-mode` | Inline inline-edit on the detail view | EDIT (inline toggle) |
| `supplier` | Supplier-specific onboarding flow | SUPPLIER.ONBOARD, SUPPLIER.APPROVE |

---

## Live Entity Operations Query

The frontend fetches operations dynamically at runtime:

**Route:** `GET /api/records/:entity/operations`

**Query parameters:**
- `?entityId=<uuid>` — when fetching for a specific record (filters `is_record_required = true` results)
- `?surface=LIST|DETAIL|BOTH` — filter by surface

**Response:**
```json
[
  {
    "permission_code": "JOURNAL_ENTRY.APPROVE",
    "label": "Approve",
    "icon": "check-circle",
    "surface": "DETAIL",
    "placement": "PRIMARY",
    "handler_type": "API",
    "handler_target": "/api/records/journal_entry/:id/action/JOURNAL_ENTRY.APPROVE",
    "is_record_required": true,
    "tcode_alias": null,
    "permitted": true         // resolved after checkPermission() for calling principal
  }
]
```

The `permitted` field is resolved server-side by `checkPermission()` against `master.access_grant` — operations the calling principal cannot perform are returned with `permitted: false` (so the UI can grey them out, not hide them entirely, for better UX).

---

## Action Dispatcher

The ActionBar component dispatches operations via a unified handler:

**Route:** `POST /api/records/:entity/:id/action/:operationCode`

**Request body:**
```json
{
  "payload": { ... },      // optional; passed to policy engine evaluation
  "reason": "...",         // required when lifecycle_transition.config.require_comment = true
  "correlationId": "..."   // optional; saga correlation
}
```

**Execution sequence:**
1. Resolve `entity_operation` row for `(entity_name, permission_code)`
2. `checkPermission()` — 403 if denied
3. `PolicyEngine.evaluate()` — 422 if action = `deny`; enqueue workflow if `require_workflow`
4. If handler_type = `API`, execute the operation-specific handler
5. Insert `log.activity_log` entry
6. Emit outbox event (topic = `lifecycle` or entity-specific topic)
7. Return `{outcome, message, updatedFields}`

---

## Admin UI

Operations are managed in the Metadata Studio at `/setup/metadata-studio` (neon app).

The admin can:
- Browse all operations for an entity
- Override `label`, `icon`, `sort_order`, `surface`, `placement` per tenant
- Enable/disable individual operations
- Assign `tcode_alias` for power users

---

## Related Docs

- [Overview](./overview.md)
- [Entity Definition](./entity.md)
- [Entity Field Definition](./entity-field.md)
- [Lifecycle Engine](./lifecycle.md)
- [Workflow Engine](./workflow.md)
- [Policy Engine](./policy.md)
