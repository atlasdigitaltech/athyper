# open_contract_line — DEFERRED

**Status**: not implemented as of June 2026
**Gating dependency**: no DDL exists in the repo (`document.contract*` / `master.contract*` / `outline_agreement` — none present)
**Trigger to implement**: a real finance scenario (recurring billing, milestone billing, value-based draw-down) + DDL on the roadmap

## Intent

`open_contract_line` picks invoicable lines from an open service or supply contract — the canonical source for milestone billing, recurring revenue/expense, and value-based draw-down invoicing. Conceptually closer to `open_service_sheet_line` than to `open_po_line`: the contract certifies a billing right, the invoice consumes that right.

## Likely shape (sketched, not committed)

- **Picker kind**: `modal-select` (selection grids need columns: contract #, line, item, remaining qty/value, billing frequency, period, price/rate)
- **Selection shape**: probably `id_qty` for qty-based contracts; `composite` (qty + period) for value-based with frequency tied to a date range. Decide once DDL splits the two cases.
- **Match type**: `two_way` (contract → invoice). PO is not necessarily in the chain — contracts can replace POs entirely.
- **Side effects**: `link_source_line` + a likely-new `reserve_remaining_value` SideEffect kind (current `reserve_remaining_quantity` only handles qty — value reservation is a different shape that would need a contract addition to `SourceSideEffectSchema`).
- **Staleness strategy**: `fail` default — contract remaining is a hot field once parallel billing happens.
- **Permission code**: `INVOICE.LINE.ADD_FROM_CONTRACT`.

## Open questions to resolve before implementing

1. Are qty-based and value-based contracts modelled as **one entity with two billing modes** or **two distinct entities**? Affects whether one adapter handles both via `composite` selection or two adapters split the cases.
2. Is **billing frequency** an adapter-level concern (the adapter computes which periods are eligible) or a fill-stage concern (the user picks a period in a sub-modal)?
3. Does the contract carry a **PO back-reference** that should mirror `open_service_sheet_line`'s pattern, or is the contract a peer of the PO?
4. Should a new `SourceSideEffectSchema` variant `reserve_remaining_value` be added now, or can value reservation be encoded as a synthetic `quantity` effect with a sentinel `quantityField: "remainingValue"`? Probably the former — value semantics differ enough that the committer should know.

## When to revisit

When finance + product agree on a concrete contract scenario AND DDL is on a near-term sprint. Implementation against the established template (catalog/PO/GRN/SES) is ~1 day once those exist.
