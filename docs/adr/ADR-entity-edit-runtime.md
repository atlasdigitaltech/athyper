# ADR: Entity Edit Runtime Architecture

**Status:** Accepted  
**Date:** 2026-04-26  
**Deciders:** Architecture  

---

## Context

Phase 4 delivered `EntityWorkspaceShell`, `EditGuardContext`, `EditGuardModal`, and `useEditKeyboardShortcuts` as the framework layer for edit pages. The purchase invoice edit page (`PurchaseInvoiceEditPage`) was implemented as a **pilot** to prove the framework on one real entity.

The pilot file set is:

| File | Role |
|------|------|
| `app/purchase_invoice/[id]/edit/page.tsx` | Static route override — **pilot only** |
| `PurchaseInvoiceEditPage.tsx` | Full page component — **pilot only** |
| `PurchaseInvoiceEditForm.tsx` | Form component — **pilot only** |
| `usePurchaseInvoiceEdit.ts` | Edit state hook — **pilot only** |
| `purchase-invoice-header-mapper.ts` | Header mapper — **keep; pattern per entity** |

**The pilot proved the framework. It must not become the copy/paste pattern.**

One entity is insufficient evidence to design the generic edit runtime. The "rule of three" applies: build patterns across purchase_invoice, journal_entry, supplier, company_code, and one more entity before finalizing the descriptor-driven layer.

---

## Decision: Three-Tier Model

### Tier 1 — Generic descriptor-driven edit (default)

Most master/control/reference entities use generic edit with zero custom code:

- No custom route
- No custom hook  
- No custom form
- Only an entity descriptor (config)

**Target:** `supplier`, `company_code`, `cost_center`, `gl_account`, etc.

### Tier 2 — Slot-based domain adapter

Entities needing custom field renderers, validation hooks, action policies, or save transforms register an adapter:

```ts
type EntityEditAdapter<TRecord, TPatch> = {
  entityCode: string;
  fetchRecord: (ctx) => Promise<TRecord>;
  buildHeaderModel: (ctx) => EntityHeaderModel;
  save: (ctx) => Promise<EntityEditSaveResult>;
  fieldRenderers?: Partial<Record<string, FieldRenderer>>;
  sectionRenderers?: Partial<Record<string, SectionRenderer>>;
  beforeSubmit?: (patch: TPatch) => TPatch | Promise<TPatch>;
  validatePatch?: (patch: TPatch, record: TRecord) => ValidationResult;
  /** Last-resort escape hatch. Requires architectural approval. */
  renderForm?: React.ComponentType<{ record: TRecord; editState: EntityEditState }>;
};
```

**Target:** `purchase_invoice` (after Phase 6.1 migration), `journal_entry`

**Important:** Complex business rules do NOT automatically mean a custom page. Use `validatePatch` + `beforeSubmit` hooks before escalating to `renderForm`.

### Tier 3 — Full route/page override (rare exception)

Reserved for entities with fundamentally different edit surfaces (e.g., multi-step wizards). Requires architecture approval.

**Current examples:** `purchase_invoice` create flow (CREATE is a wizard; EDIT should be Tier 2 after Phase 6.1).

### `renderForm` is a last-resort escape hatch

`renderForm` must NOT become the easy escape route. The threshold for using it:

> "This entity's edit surface cannot be expressed as a combination of field renderers, section renderers, `validatePatch`, and `beforeSubmit`."

If any of those slots can express the requirement, use them.

---

## Consequences

### Immediate (Phase 5 — VIEW migration)

- Build `mapDocumentHeaderModel` — generic view mapper for all approvable documents.
- Migrate `ApprovableDetailPage` to use `EntityHeader` (new format) instead of `ApprovableDocumentShell` (old format).
- Build read-only view mappers for: `purchase_invoice`, `journal_entry`, `supplier`, `company_code`.
- Do NOT create more per-entity edit pages.

### Near-term (Phase 5.5 — Descriptors)

Write read-only descriptors alongside each view mapper:

```ts
export const purchaseInvoiceDescriptor = {
  entityCode: "purchase_invoice",
  identity: { typeLabel: "INVOICE", numberField: "document_no", statusField: "status" },
  facts: [
    { id: "supplier",     label: "Supplier",     field: "supplier_id" },
    { id: "invoice_date", label: "Invoice Date", field: "invoice_date" },
    { id: "total",        label: "Total",        field: "total_amount", emphasis: "xl" },
  ],
  statuses: [
    { id: "accounting",  label: "Accounting",  field: "accounting_status" },
    { id: "settlement",  label: "Settlement",  field: "settlement_status" },
  ],
};
```

These descriptors shape the Phase 6 metadata contract using real entities — not hypothetical shapes.

### Phase 6.0 — Generic meta-edit runtime

Only after Phase 5/5.5 has evidence from 3–5 entities.

Deliverables:
1. `EntityEditAdapter` interface (Tier 2 contract)
2. Adapter registry
3. `GenericMetaEditPage` and `GenericMetaEditForm`
4. Framework-owned `useEntityEditState` (framework owns dirty detection, patch building, save lifecycle)
5. Generic PATCH builder (logical name → `apiField` → API payload)
6. Slot-based field/section override system

### Phase 6.1 — Collapse purchase invoice pilot

The current pilot files (`PurchaseInvoiceEditPage`, `PurchaseInvoiceEditForm`, `usePurchaseInvoiceEdit`, the static route) are DELETED and replaced by:

- `purchase-invoice-edit.adapter.ts` (Tier 2 adapter)
- `purchase-invoice.descriptor.ts` (entity descriptor)

The header mapper (`purchase-invoice-header-mapper.ts`) is kept and adapted.

### Phase 6.2 — Prove Tier 1

Add Tier 1 entities using descriptor only: `supplier`, `company_code`, `cost_center`.
Goal: zero React per entity; no custom route, hook, or form.

### Phase 6.3 — Prove Tier 2 without `renderForm`

Use `journal_entry` as the test case:
- Generic form + `validatePatch` (debits = credits, period open, account postable)
- `beforeSubmit` hook for dimension requirements
- `fieldRenderers` for account pickers

---

## Locked Contracts (must not change before Phase 6)

### 1. Field name convention

```ts
type EntityFieldEditConfig = {
  editable?: boolean;
  apiField?: string; // defaults to field name; column names are server-only
};
```

UI must not know database column names. Logical field name = form name; `apiField` = PATCH payload key when different.

### 2. Framework-owned `useEntityEditState`

```ts
function useEntityEditState<TRecord, TPatch>(opts: {
  entityCode: string;
  recordId: string;
  record: TRecord;
  fields: EntityEditableField[];
  save: (patch: TPatch) => Promise<EntityEditSaveResult>;
  beforeSubmit?: (patch: TPatch) => TPatch | Promise<TPatch>;
}): EntityEditState;
```

Adapters provide configuration. The framework owns: dirty detection, restore-to-original, patch building, save lifecycle, field errors, global errors, conflict state.

### 3. Edit policy metadata (not hardcoded in adapters)

```ts
type EntityEditPolicy = {
  editableStatuses: string[];
  forceStatusOnEdit?: Record<string, string>;
};

type EntityFieldEditConfig = {
  editable?: boolean;
  editableInStatus?: string[];
  editingForcesStatus?: string;
};
```

### 4. No parallel edit metadata fetch

Edit metadata extends existing entity descriptors. Use the existing metadata/client cache. No separate `useEditConfig` fetch.

---

## Purchase Invoice Pilot — Current Status

The pilot is a **bridge implementation**. It proves the Phase 4 framework works on a real entity with real API calls. It will be migrated to a registered adapter in Phase 6.1.

**Do not copy it as a pattern for other entities.**
