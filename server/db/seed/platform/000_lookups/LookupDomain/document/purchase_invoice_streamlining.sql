-- =============================================================================
-- platform/000_lookups/LookupDomain/document/purchase_invoice_streamlining.sql
--
-- Streamlines the document.purchase_invoice_type lookup domain.
--
-- §V1  Archive retired lookup values (proforma, down_payment)
-- §V2  Stamp display_tier metadata on the 7 remaining active types
--
-- Note: purchase_invoice_tax_mode and purchase_invoice_tax_mode_source domains
-- and their values are seeded in their own canonical files:
--   · purchase_invoice_tax_mode.sql
--   · purchase_invoice_tax_mode_source.sql
--
-- Idempotent: all mutations are guarded (UPDATE WHERE).
-- Run order: after core lookup bootstrap; before AP flow seed files.
-- =============================================================================

DO $$
BEGIN

-- ---------------------------------------------------------------------------
-- §V1 — Archive retired lookup values
-- ---------------------------------------------------------------------------

-- Retire proforma as an invoice type.
-- Proforma is now a purchase_invoice lifecycle status, not a type discriminator.
UPDATE control.lookup_value
   SET status   = 'deprecated',
       metadata = jsonb_set(COALESCE(metadata, '{}'), '{retired_reason}',
                  '"Proforma is now a purchase_invoice lifecycle status, not an invoice type."')
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code        = 'proforma'
   AND tenant_id  IS NULL;

-- Retire down_payment: merged into advance per design consolidation.
-- Both values map to the same accounting event (prepayment clearing).
UPDATE control.lookup_value
   SET status   = 'deprecated',
       metadata = jsonb_set(COALESCE(metadata, '{}'), '{retired_reason}',
                  '"down_payment merged into advance — same accounting event."')
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code        = 'down_payment'
   AND tenant_id  IS NULL;

-- ---------------------------------------------------------------------------
-- §V2 — Set display_tier metadata on the 7 remaining active invoice types
--
-- primary  → shown prominently in the chip strip on the AP intake form
-- advanced → hidden behind a "More…" affordance (uncommon / specialist types)
-- ---------------------------------------------------------------------------

UPDATE control.lookup_value
   SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{display_tier}', '"primary"')
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code IN ('standard', 'credit_note', 'advance', 'retention_release', 'final')
   AND tenant_id  IS NULL;

UPDATE control.lookup_value
   SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{display_tier}', '"advanced"')
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code IN ('debit_note', 'self_billed')
   AND tenant_id  IS NULL;


-- ---------------------------------------------------------------------------
-- TABLE SPLIT: 029b_purchase_invoice_preflight.sql lookup metadata
-- ---------------------------------------------------------------------------

  UPDATE control.lookup_value lv
     SET description = v.short_description,
         sort_order = COALESCE(v.sort_order, lv.sort_order),
         metadata = jsonb_set(
           COALESCE(lv.metadata, '{}'::jsonb) ||
             jsonb_strip_nulls(jsonb_build_object('display_tier', v.display_tier)),
           '{preflight}',
           jsonb_strip_nulls(jsonb_build_object(
             'description', v.card_description,
             'helper', v.helper
           )),
           true
         )
    FROM (VALUES
      (
        'document.purchase_invoice_type',
        'standard',
        'Regular supplier bill for goods received or services delivered.',
        'Regular supplier bill for goods received or services delivered.',
        NULL::text,
        'primary',
        10
      ),
      (
        'document.purchase_invoice_type',
        'credit_note',
        'Supplier-issued credit reducing an outstanding payable.',
        'Supplier-issued credit reducing an outstanding payable. Mirrors an original invoice in full or in part.',
        NULL::text,
        'primary',
        20
      ),
      (
        'document.purchase_invoice_type',
        'debit_note',
        'Buyer-issued document charging the supplier for a shortfall or breach.',
        'Buyer-issued document charging the supplier for a shortfall or breach. Reduces what we owe them.',
        NULL::text,
        'primary',
        30
      ),
      (
        'document.purchase_invoice_type',
        'advance',
        'Standalone prepayment to a supplier before any work or delivery.',
        'Standalone prepayment to a supplier before any work or delivery and recovered by future invoices.',
        NULL::text,
        'primary',
        40
      ),
      (
        'document.purchase_invoice_type',
        'retention_release',
        'Releases previously-withheld retention back to the supplier.',
        'Releases previously-withheld retention back to the supplier when contractual conditions are met.',
        NULL::text,
        'primary',
        50
      ),
      (
        'document.purchase_invoice_type',
        'final',
        'Closing invoice on a PO or contract.',
        'Closing invoice on a PO or contract. Posts normally and releases any remaining encumbered budget on the parent commitment.',
        NULL::text,
        'advanced',
        60
      ),
      (
        'document.purchase_invoice_type',
        'self_billed',
        'Buyer-created invoice on behalf of the supplier under a self-billing agreement.',
        'Buyer-created invoice on behalf of the supplier under a self-billing agreement. We compute the amount owed and notify the supplier.',
        'Requires a contractual basis; not valid for Non-PO or One-Time Supplier.',
        'advanced',
        70
      ),
      (
        'document.purchase_invoice_source',
        'po_based',
        'Invoice against an existing purchase order.',
        'Invoice against an existing purchase order. Matched against the PO and the goods receipt.',
        NULL::text,
        NULL::text,
        10
      ),
      (
        'document.purchase_invoice_source',
        'contract_based',
        'Invoice against an existing master agreement or framework contract.',
        'Invoice against an existing master agreement or framework contract.',
        NULL::text,
        NULL::text,
        20
      ),
      (
        'document.purchase_invoice_source',
        'non_po',
        'Invoice with no upstream PO or contract.',
        'Invoice with no upstream PO or contract. Approver derives intent from spend category at invoice time.',
        NULL::text,
        NULL::text,
        30
      ),
      (
        'document.purchase_invoice_source',
        'one_time_supplier',
        'Invoice from a party not in supplier master data.',
        'Invoice from a party not in supplier master data. Inline party creation, single-use payment, no recurring relationship.',
        NULL::text,
        NULL::text,
        40
      )
    ) AS v(domain_code, code, short_description, card_description, helper, display_tier, sort_order)
   WHERE lv.domain_code = v.domain_code
     AND lv.code = v.code
     AND lv.tenant_id IS NULL;

RAISE NOTICE 'purchase_invoice_streamlining: invoice_type lookup values retired and display_tier metadata stamped';

END $$;
