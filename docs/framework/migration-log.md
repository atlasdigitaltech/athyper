# Add-Item Framework — Migration Log

Captures what landed at each phase of the framework rollout, with code refs. Companion to [add-item.md](./add-item.md) (architecture) and [rb-17](../local/runbooks/rb-17-add-item-framework.md) (operations).

---

## Phase 0.5 — Tenant override schema (Jun 2026)

**Landed:** [packages/shared/runtime-contracts/src/interaction-surface.ts](../../packages/shared/runtime-contracts/src/interaction-surface.ts)

Locked the class-boundary guard before any consumer code could rely on unsafe overrides. `MetaEntityOperationOverrideSchema` + `mergeOperationOverride` enforce six rules: no cross-class override, no read-only-surface for mutating ops, no destructive-confirmation downgrade, picker-surface constraints, adapter-registry validation, width/options constrained by kind.

29 tests, all rules covered.

---

## Phase 1 — Operation + descriptor schema (Jun 2026)

**Landed:** [packages/shared/runtime-contracts/src/schemas.ts](../../packages/shared/runtime-contracts/src/schemas.ts) extended with `interactionSurfaceKind` + `interactionOptions` on `MetaEntityOperation`. Descriptor-level FK validator for `addContract.targetRelation` (must be a declared `has_many` or `m2m` relation).

Contract version bumped to `meta-entity-runtime/v1.1` (additive — every new field optional).

**Design refinement during build:** the original "MODAL ⇔ interactionSurfaceKind" bi-directional rule had to soften to one-way (`interactionSurfaceKind requires handlerType=MODAL`) because pre-existing data uses `handlerType: MODAL` for delete-confirmation dialogs without an interaction kind. Documented in the schema comment.

12 new tests + 96 pre-existing pass.

---

## Phase 1.5 — runtime-line-item typecheck fix (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/registry.ts](../../packages/shared/runtime-line-item/src/registry.ts) — added a 1-line `declare const process` ambient mirroring the established codebase pattern (4 other shared packages use the same idiom). Cleared a pre-existing typecheck error that was blocking Phase 2's regression gate.

---

## Phase 2 — Six interaction-surface shells (Jun 2026)

**Landed:** [packages/shared/runtime-canvas/src/surfaces/shells/](../../packages/shared/runtime-canvas/src/surfaces/shells/) — six typed shells (`PageShell`, `OverlayShell`, `DrawerFormShell`, `DrawerPeekShell`, `ModalSelectShell`, `DialogConfirmShell`).

Built on top of the existing `DrawerShell` primitive at [packages/shared/ui/src/primitives/DrawerShell.tsx](../../packages/shared/ui/src/primitives/DrawerShell.tsx). Type-required slots: `OverlayShell.bindingBar` (no overlay without naming its parent), `DialogConfirmShell.consequence: string` (no "Are you sure?" generic confirmations).

19 shell tests, every shell stamps `data-interaction-surface="<kind>"` for runtime introspection.

---

## Phase 3 — SurfaceStackController + read-only migrations (Jun 2026)

**Landed:**
- Stack controller in [packages/shared/runtime-canvas/src/surfaces/stack/](../../packages/shared/runtime-canvas/src/surfaces/stack/) — rules + provider + `useStackFrame` hook
- All five floating shells auto-register via `useStackFrame`
- Migrated `EditGuardModal` → `DialogConfirmShell` via new `RuntimeEditGuardDialog` (Phase 3.5 moved this to `@athyper/ui`)
- Migrated `EntityContextDrawer` → `DrawerPeekShell` (read-only attachments/comments/activity panel)

**Stack rules** (enforced in dev, warned in prod):
- `validateOpen` rejects `page` from the stack (pages mount via routing)
- Drawer-in-drawer rejected with `drawer_in_drawer` code (checked before order rule)
- Out-of-order opens rejected with `out_of_order` code
- `dialog-confirm` may stack on itself

**Implementation gotcha caught:** the obvious `useStackFrame` implementation creates an infinite reregister loop because the provider's `api` value changes reference on every `frames` mutation. Fixed by holding `stack` + options in refs and depending only on `open`.

26 new tests (17 rules + 9 controller/lifecycle) — total 51 tests in runtime-canvas.

---

## Phase 3.5 — Surfaces extracted to `@athyper/ui` (Jun 2026)

**Landed:** Shells + stack controller moved from `runtime-canvas` to [packages/shared/ui/src/surfaces/](../../packages/shared/ui/src/surfaces/).

**Why:** `runtime-line-item` sits *upstream* of `runtime-canvas` (canvas depends on line-item). To consume shells in Phase 5, the shells had to move *below* both packages. New location resolves the dependency direction:

```
@athyper/runtime-contracts
    ↑
@athyper/ui   ←  runtime-line-item  AND  runtime-canvas
   (surfaces)        (consumes)         (consumes)
```

No consumer code changes — `runtime-canvas/src/surfaces/index.ts` re-exports `@athyper/ui/surfaces` for backward compatibility.

---

## Phase 4 — AddItemController + SourceAdapterRegistry + test harness (Jun 2026)

**Landed:**
- Source-adapter contract schemas in [packages/shared/runtime-contracts/src/source-adapter.ts](../../packages/shared/runtime-contracts/src/source-adapter.ts)
- New package [@athyper/runtime-add-item](../../packages/shared/runtime-add-item/) — executable contract + registry + controller + telemetry + test harness
- `defineSourceAdapterContractSuite()` test harness exported

**Two implementation findings worth flagging:**

1. **Distributive Omit** was needed for `TelemetryDispatcher.emit`. Naive `Omit<UnionEvent, "seq" | "at">` collapses the union to common keys. Pattern reusable wherever discriminated-union "input shapes" are needed.

2. **`AnyAdapter<Draft>` wildcard** for the committer. It reads `adapter.manifest.id` and dispatches `onCommitSideEffects(line, ctx)` — Selection / ParentCtx types aren't used. Forcing the parent's parametric types caused variance failures every time two adapters with different selection shapes shared a commit set.

53 tests across registry / telemetry / committer / controller / contract suite.

---

## Phase 5 — First real adapter: `manual_invoice_line` (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/adapters/manual-invoice-line.ts](../../packages/shared/runtime-line-item/src/adapters/manual-invoice-line.ts).

The simplest source — no remote fetch, no picker UI used. Composer is the fill UI; consumer calls `controller.stageLine(adapter, draft)` directly.

**Adapter shape:** `picker.kind: "page"` (placeholder; schema requires picker but consumers skip it), `cacheStrategy: "stale-while-revalidate"` (avoids the page+session schema rejection while being inert), `selectionShape: id_only`, no side effects.

**LinesGrid integration:** [packages/shared/runtime-line-item/src/surface/LinesGrid.tsx](../../packages/shared/runtime-line-item/src/surface/LinesGrid.tsx) → `handleDraftComposerSubmit` now routes through the adapter's `toDraftShape`, attaching `sourceBinding` to every draft line.

22 tests including contract suite + 3-line invoice smoke + LinesGrid binding shape.

---

## Phase 6 — Source fanout (Jun 2026)

Five PR plan; three landed, two deferred.

### PR #1 — `catalog` (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/adapters/catalog.ts](../../packages/shared/runtime-line-item/src/adapters/catalog.ts).

Picker kind: `overlay` (bound to parent doc). Selection: `id_qty_uom`. Side effect: `emit_event`. Configurable unit-price-drift tolerance (default 10%). Currency mismatch annotation (no FX conversion at adapter layer — record + propagate, finance decides).

10 integration scenarios + 14 contract assertions.

### PR #2 — `open_po_line` (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/adapters/open-po-line.ts](../../packages/shared/runtime-line-item/src/adapters/open-po-line.ts).

Picker kind: `modal-select` (grids need columns). Selection: `id_qty`. Match type: `three_way` (pinned at type level). Side effects: `reserve_remaining_quantity` → `link_source_line` per line.

Per-line side-effect ordering pinned + tested. Duplicate-source-line guard catches same PO line staged twice in one session.

13 integration scenarios + 14 contract assertions.

### PR #3 — `open_contract_line` — DEFERRED

See [source-adapters/open_contract_line.md](./source-adapters/open_contract_line.md). No DDL in repo as of Jun 2026.

### PR #4 — `open_receipt_line` (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts](../../packages/shared/runtime-line-item/src/adapters/open-receipt-line.ts).

Picker kind: `modal-select`. Selection: `id_qty`. Match type: `three_way`. Reserve targets `goods_receipt_line` (NOT the PO — important three-way-matching semantic). PO back-reference preserved on both draft AND `sourceBinding.sourceRef`.

DDL ref: [server/db/ddl/document/01j_tables_p2p.sql](../../server/db/ddl/document/01j_tables_p2p.sql) lines 490 + 578.

16 integration scenarios + 14 contract assertions.

### PR #5 — `open_service_sheet_line` (Jun 2026)

**Landed:** [packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts](../../packages/shared/runtime-line-item/src/adapters/open-service-sheet-line.ts).

Picker kind: `modal-select`. Selection: `id_qty`. Match type: `three_way`. **Service period preserved** on both draft (`servicePeriodStart`/`servicePeriodEnd`) AND `sourceRef` — drives period accrual logic without unwrapping the binding. PO back-reference preserved. Reserve targets `service_sheet_line`.

DDL ref: [server/db/ddl/document/01j_tables_p2p.sql](../../server/db/ddl/document/01j_tables_p2p.sql) lines 665 + 756. Adapter uses "certified" terminology where DDL uses "accepted/approved" (two-step model) — `certifiedDate` maps to `accepted_at`, documented in the adapter JSDoc.

19 integration scenarios + 14 contract assertions.

### PR #6 — `inventory` — DEFERRED

See [source-adapters/inventory.md](./source-adapters/inventory.md). DDL exists for GL-side inventory movements but not for the invoicable-stock-balance view this adapter would consume. Use case is rare; a per-scenario adapter (consignment, stock-transfer) is usually the right answer instead of a generic `inventory` adapter.

---

## Phase 7 — Cleanup + docs (Jun 2026)

**Deletions:** Four deprecated parallel sheets removed from `packages/shared/runtime-line-item/src/components/`:

- `ProcureLineComposerSheet.tsx`
- `ProcureLineEditorSheet.tsx`
- `SalesLineComposerSheet.tsx`
- `SalesLineEditorSheet.tsx`

These were imported by `LineItemSheet.tsx` but **never invoked** — the dispatcher always routed to `UnifiedLineItemSheet` or `GenericLineComposerSheet`. Confirmed by grep before deletion: no external consumer. Test suite untouched, 138 tests still pass.

**Docs landed:**
- [docs/framework/add-item.md](./add-item.md) — architecture + adapter authoring guide
- [docs/local/runbooks/rb-17-add-item-framework.md](../local/runbooks/rb-17-add-item-framework.md) — operational runbook
- [docs/framework/source-adapters/open_contract_line.md](./source-adapters/open_contract_line.md) + [./source-adapters/inventory.md](./source-adapters/inventory.md) — deferral notes
- [docs/framework/migration-log.md](./migration-log.md) — this file

---

## Final state

| Layer | Tests | Status |
|---|---|---|
| Contracts (`runtime-contracts`) | 131 | ✅ all green |
| Surfaces + stack (`@athyper/ui`) | 46 | ✅ |
| Add-item core (`runtime-add-item`) | 53 | ✅ |
| Adapters (`runtime-line-item`) | 138 | ✅ |
| Surface migrations (`runtime-canvas`) | 7 | ✅ |
| **Total** | **375** | |

Adapters shipped: `manual_invoice_line`, `catalog`, `open_po_line`, `open_receipt_line`, `open_service_sheet_line`.
Adapters deferred: `open_contract_line`, `inventory`.

---

## Deliberately not yet done

1. **LinesGrid UI dropdown** still hardcodes "Add Item" / "Add Catalog Item (disabled)". The Phase 5 migration attached `sourceBinding` to draft lines but kept the dropdown shape. Converting the dropdown to be registry-driven (list `availableAdapters` from `useAddItemController`, route clicks through `openPicker`) is a separate UI sweep — the framework is ready for it.

2. **`apps/neon` registry bootstrap.** No app yet mounts a `SourceAdapterRegistry`. Until this lands, the framework is shipped but inert in production. Recommended owner + path: `apps/neon/src/lib/source-adapters.ts`, registers all five adapters with backend-relay callbacks for `fetchItems` / `checkLive`.

3. **Backend persistence of `sourceBinding`**. Draft-mode flows attach the binding to local-only draft lines. Non-draft mode POSTs through `relayMutate` to existing route handlers that don't yet accept a `sourceBinding` field. Schema-level work (line entity tables → `source_binding jsonb`) is a backend deliverable.

4. **The `entry: "direct_fill"` schema addition** flagged in Phase 5. Manual adapter declares a `page` picker it never uses; a small additive schema field would let manual adapters explicitly opt out of picker semantics. Non-blocking but worth landing before any other no-picker adapter joins (subscription billing, recurring billing, generator-style sources).
