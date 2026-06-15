# inventory — DEFERRED

**Status**: not implemented as of June 2026
**Gating dependency**: `ledger.inventory_balance` / `ledger.inventory_movement` / `ledger.inventory_valuation_layer` exist (in `server/db/ddl/ledger/01_tables.sql`) but they are **GL posting + valuation tables**, not the "pickable invoicable stock balance line" view this adapter would consume.
**Trigger to implement**: a real customer scenario for inventory-as-invoice-source — consignment billing, stock-transfer invoicing, internal cross-charging. Rare in practice.

## Intent

`inventory` would pick from on-hand stock balances to invoice — used for cost-substantiated invoice lines where the line item is "what's actually in the warehouse right now", not "what was on a PO or GRN". The most likely use cases are inventory-as-source billing models (consignment, stock transfer between legal entities, internal cross-charge).

## Likely shape (sketched, not committed)

- **Picker kind**: `overlay` (warehouse/lot/serial picker benefits from full-viewport real estate; deep filtering by warehouse → bin → lot is hard in a modal-select grid).
- **Selection shape**: `id_qty_uom` minimum, possibly `composite` to carry warehouse + lot + serial alongside item + qty.
- **Match type**: typically `no_match` — inventory billing doesn't participate in three-way matching. Some scenarios (stock-transfer between LEs) might use `two_way` with the transfer document.
- **Side effects**: `reserve_remaining_quantity` against the inventory balance + `link_source_line`. Probably also a new "inventory_movement" effect kind so the commit records a stock issue alongside the invoice line.
- **Staleness strategy**: `fail` — stock balances are the hottest field in the system.
- **Permission code**: `INVOICE.LINE.ADD_FROM_INVENTORY`.

## Open questions to resolve before implementing

1. **Warehouse-context plumbing**: `ParentCtx` needs to carry the parent doc's source warehouse / target warehouse / company code so the picker can scope balances correctly. This is the main reason the original plan deferred inventory last in Phase 6 — it's not adapter complexity, it's parent-context plumbing.
2. **Lot/serial reservation semantics**: reserving from a specific lot is different from reserving from total stock. Adapter needs to know whether the back end treats lot-level reservation as the contract or just stock-level.
3. **FIFO/LIFO/AVG cost layer interaction**: the line carries a unit price, but stock has costed layers. Does the adapter freeze the layer-cost-at-selection in `sourceRef`? Probably yes (audit invariant), but it's worth confirming with finance.
4. **Whether this adapter is needed at all**: most apps don't bill from inventory directly — they raise sales orders or transfer documents. If the real scenario is "consignment billing" or "stock transfer", a more focused adapter (e.g. `consignment_drawdown_line`, `stock_transfer_line`) may be the right answer instead of a generic `inventory` adapter.

## When to revisit

Only when a real customer case lands AND warehouse-context plumbing has a concrete owner. Generic inventory invoicing is not a common scenario; a focused per-case adapter is usually the right call instead. Don't build this speculatively.
