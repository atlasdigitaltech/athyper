-- =============================================================================
-- 010_platform/000_lookups/LookupDomain/document/purchase_invoice_streamlining.sql
--
-- Streamlines the document.purchase_invoice_type lookup domain and adds two
-- new companion domains required by the AP invoice flow engine:
--   · document.purchase_invoice_tax_mode
--   · document.purchase_invoice_tax_mode_source
--
-- §V1  Archive retired lookup values (proforma, down_payment)
-- §V2  Stamp display_tier metadata on the 7 remaining active types
-- §V3  Insert document.purchase_invoice_tax_mode domain + 3 values
-- §V4  Insert document.purchase_invoice_tax_mode_source domain + 5 values
--
-- Idempotent: all mutations are guarded (UPDATE WHERE + INSERT WHERE NOT EXISTS).
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
-- §V3 — document.purchase_invoice_tax_mode domain + values
--
-- Describes how tax_amount relates to Invoice Total on an AP document.
-- is_extensible=false: tenants may not add custom tax modes.
-- ---------------------------------------------------------------------------

INSERT INTO control.lookup_domain
       (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'document.purchase_invoice_tax_mode',
       'Purchase Invoice Tax Mode',
       'Interpretation of how tax_amount relates to Invoice Total: inclusive (tax within total), exclusive (tax added on top), or no_tax (exempt/zero-rated).',
       'document',
       false,
       'active',
       '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain
     WHERE code = 'document.purchase_invoice_tax_mode');

INSERT INTO control.lookup_value
       (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('inclusive',
     'Inclusive',
     'document.purchase_invoice_tax_mode',
     'Tax is included within Invoice Total. Net = Total ÷ (1 + rate). Common in B2C and many VAT jurisdictions.',
     10),
    ('exclusive',
     'Exclusive',
     'document.purchase_invoice_tax_mode',
     'Tax is added on top of Invoice Total. Payable = Total + Tax. Common in B2B and GST regimes.',
     20),
    ('no_tax',
     'No Tax',
     'document.purchase_invoice_tax_mode',
     'Invoice is tax-exempt or zero-rated. tax_amount must be 0.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
     WHERE x.domain_code = v.domain_code
       AND x.code        = v.code
       AND x.tenant_id  IS NULL);

-- ---------------------------------------------------------------------------
-- §V4 — document.purchase_invoice_tax_mode_source domain + values
--
-- Records how tax_mode was determined on an AP invoice.
-- Provides an audit trail and drives UI attribution labels.
-- is_extensible=false: fixed set of determination sources.
-- ---------------------------------------------------------------------------

INSERT INTO control.lookup_domain
       (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'document.purchase_invoice_tax_mode_source',
       'Tax Mode Source',
       'Records how tax_mode was determined on an AP invoice, for audit trail and UI attribution.',
       'document',
       false,
       'active',
       '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain
     WHERE code = 'document.purchase_invoice_tax_mode_source');

INSERT INTO control.lookup_value
       (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('supplier_profile',
     'Supplier Profile',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode defaulted from the supplier''s tax configuration profile.',
     10),
    ('tax_group',
     'Tax Group',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode inferred from the invoice''s tax group settings.',
     20),
    ('company_default',
     'Company Default',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode set from the company code''s default tax configuration.',
     30),
    ('user_override',
     'User Override',
     'document.purchase_invoice_tax_mode_source',
     'Tax mode was manually overridden by the user (requires ap.override_tax_mode permission).',
     40),
    ('cannot_infer',
     'Cannot Infer',
     'document.purchase_invoice_tax_mode_source',
     'System could not determine tax mode from available supplier/tax data — user must enter manually.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
     WHERE x.domain_code = v.domain_code
       AND x.code        = v.code
       AND x.tenant_id  IS NULL);

RAISE NOTICE 'purchase_invoice_streamlining: lookup values updated, tax_mode and tax_mode_source domains seeded';

END $$;
