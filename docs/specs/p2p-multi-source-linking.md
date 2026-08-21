# P2P Multi-Source Document Linking

## Recommendation

Use a header-level junction table for document-to-document scope, and keep
line-level source references for exact matching and quantity traceability.

This solves invoices created from multiple POs, GRs, SESs, and ad-hoc lines
without overloading a single header FK.

## Proposed Shape

Prefer canonical entity codes for document type values. This keeps the table
aligned with `control.entity.entity_code` and avoids adding a new sealed enum
every time another document type participates.

```sql
CREATE TABLE document.document_source (
    id                 uuid        PRIMARY KEY DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    target_entity_code text        NOT NULL, -- purchase_invoice, goods_receipt, service_entry_sheet
    target_doc_id      uuid        NOT NULL,
    source_entity_code text        NOT NULL, -- commitment, goods_receipt, service_entry_sheet
    source_doc_id      uuid        NOT NULL,
    link_origin        text        NOT NULL, -- create_from, manual_link, lazy_line_link, system_backfill
    linked_at          timestamptz NOT NULL DEFAULT now(),
    linked_by          uuid,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT document_source_origin_chk CHECK (
        link_origin IN ('create_from','manual_link','lazy_line_link','system_backfill')
    ),
    CONSTRAINT document_source_no_self_chk CHECK (
        target_entity_code IS DISTINCT FROM source_entity_code
        OR target_doc_id IS DISTINCT FROM source_doc_id
    ),
    CONSTRAINT document_source_uq UNIQUE (
        tenant_id, target_entity_code, target_doc_id, source_entity_code, source_doc_id
    )
);
```

Required indexes:

```sql
CREATE INDEX document_source_target_idx
    ON document.document_source (tenant_id, target_entity_code, target_doc_id);

CREATE INDEX document_source_source_idx
    ON document.document_source (tenant_id, source_entity_code, source_doc_id);
```

## Runtime Contract

Create PI from PO:

1. Create `document.purchase_invoice`.
2. Insert one `document_source` row with target `purchase_invoice` and source `commitment`.
3. Create PI lines with `commitment_line_id`.

Create blank PI, then link POs:

1. User links one or more POs.
2. Insert one `document_source` row per PO.
3. UI loads open `commitment_line` candidates for those POs.
4. User imports selected lines into `purchase_invoice_line`.

Mixed PI:

- PO lines use `commitment_line_id`.
- GR lines use `goods_receipt_line_id`.
- SES lines use `ses_line_id`.
- Manual/ad-hoc lines leave all source line IDs null.
- The header junction is the set of linked source documents, not the proof of
  line matching.

GR from PO and SES from PO:

- The same junction works with `target_entity_code = goods_receipt` or
  `service_entry_sheet`.
- Line-level references remain the exact proof of which PO line was received or
  accepted.

## Drift Guard

Add a trigger or service invariant for `purchase_invoice_line`:

- If `commitment_line_id` is set, find its parent `document.commitment` and
  ensure a matching `document_source` row exists for the parent PI.
- If `goods_receipt_line_id` is set, find its parent `document.goods_receipt`
  and ensure a matching `document_source` row exists.
- If `ses_line_id` is set, find its parent `document.service_entry_sheet` and
  ensure a matching `document_source` row exists.

The guard should auto-insert missing rows with `link_origin = lazy_line_link`
when the line is otherwise valid. It should reject tenant mismatches or a source
line whose parent document cannot be resolved.

## Migration Recommendation

Do this in phases.

Phase 1: Additive compatibility

- Add `document.document_source`.
- Backfill from existing `purchase_invoice.commitment_id`.
- Backfill from existing line references:
  `commitment_line_id`, `goods_receipt_line_id`, `ses_line_id`.
- Add the lazy line-link guard.
- Keep `purchase_invoice.commitment_id` for compatibility.

Phase 2: Runtime migration

- Update create-from-source flows to write `document_source`.
- Update source-link UI to read/write `document_source`.
- Update matching and traceability queries to use line-level source fields plus
  the header junction for source document scope.
- Update `invoice_match_case` if it still assumes one header commitment.

Phase 3: Deprecate single-source header FK

- Remove or relax invariants that require `purchase_invoice.commitment_id` for
  PO-based invoices.
- Hide the header `commitment_id` from new UI flows.
- Drop the column only after all services, reports, and seeds use
  `document_source`.

## Review of Attached Cleanup Proposal

Recommended now:

- Add the header junction.
- Keep line-level source FKs.
- Keep line `site_id` as an optional override.
- Use lazy promotion from source line links to `document_source`.

Defer or split into a later migration:

- Dropping `purchase_invoice.commitment_id`.
- Renaming jurisdiction columns from `shipto_*` and `shipfrom_*` to `to_*` and
  `from_*`.
- Reworking tax resolver naming.
- Moving all PI header address state out of PI header columns.

Not recommended as part of the multi-source change:

- Dropping PI header ship-to/from defaults before the identity and line
  inheritance surfaces are migrated.
- Reintroducing document-side address identity tables instead of using direct
  PI header fields and live master joins.
- Collapsing `commitment_line.delivery_site_id` and `site_id` until the team
  decides whether `site_id` is a costing dimension, a delivery site, or both.

## Open Decisions

| Decision | Recommendation |
| --- | --- |
| Should one PI link multiple POs? | Yes. Use `document_source`; exact proof stays on lines. |
| Should one SES link multiple POs? | Allow it if business users need multi-PO service acceptance; same table supports both. |
| Should GR remain addressless? | Yes. GR should use `receiving_site_id` and `receiving_warehouse_id`; address snapshots can be derived only when needed for printing/audit. |
| Should tax group be stored on bill-side snapshots? | No. Leave `tax_group_id` null for bill-to, bill-from, and remit-to snapshots unless a jurisdiction requires it. |
| Should `resolved_by_rule_id` be renamed? | Defer. Prefer API aliases first; do a physical rename only in a coordinated tax refactor. |
