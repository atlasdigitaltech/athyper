-- ============================================================================
-- teardown-packs.sql
-- ============================================================================
-- Purpose : Remove all industry-pack and module-pack seed data from every
--           tenant, leaving only Tier 1 base/foundation + COA-IFRS data.
-- Scope   : ALL tenants (athyper · technostat · cirrusatlantic)
-- Safe    : Idempotent — DELETE WHERE ... is a no-op if rows are already gone.
-- Run via : psql -d <app_db> -f server/db/scripts/teardown-packs.sql
-- ============================================================================
-- Deletion order (respects FK constraints)
--   §1  AP Non-PO demo documents      (athyper / AUIC only)
--   §2  AP Non-PO module pack configs (all tenants)
--   §3  Industry pack taxonomy        (all tenants)
--   §4  Blueprint application records (all tenants)
--   §5  schema_provisions tracking    (enable re-seed)
-- ============================================================================

BEGIN;

DO $teardown$
DECLARE
    -- ── Industry pack metadata tag values (match v_pack in each seed file) ──
    v_industry_packs text[] := ARRAY[
        '100_pack_utilities',    '101_pack_construction',
        '102_pack_real_estate',  '103_pack_transport',
        '104_pack_trading',      '105_pack_hospitality',
        '106_pack_infocomm',     '107_pack_financial',
        '108_pack_mfg_textile',  '109_pack_mfg_food_bev',
        '110_pack_mfg_pharma',   '111_pack_mfg_electronics',
        '112_pack_mining_petroleum', '113_pack_agriculture',
        '114_pack_education',    '115_pack_healthcare'
    ];

    -- ── AP Non-PO accounting profile codes ──
    v_ap_profiles text[] := ARRAY[
        'AP_NON_PO_STANDARD', 'AP_NON_PO_CAPEX',
        'AP_ADVANCE_SUPPLIER', 'AP_RETENTION_RELEASE'
    ];

    v_n int;
BEGIN

-- ============================================================================
-- §1  AP Non-PO DEMO DOCUMENTS  (athyper / AUIC only)
-- ============================================================================
-- Demo invoices and payments are identified by their pinned invoice_numbers
-- and payment_numbers from the scenario seed files (002–007).
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE '§1  AP Non-PO Demo Documents (athyper / AUIC)';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

-- Activity log entries for demo invoices
DELETE FROM log.activity_log
WHERE entity_type = 'purchase_invoice'
  AND entity_id IN (
      '00000001-0000-0000-0001-000000000001'::uuid,
      '00000001-0000-0000-0001-000000000003'::uuid,
      '00000001-0000-0000-0001-000000000004'::uuid,
      '00000001-0000-0000-0001-000000000007'::uuid,
      '00000001-0000-0000-0001-000000000008'::uuid
  );
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  activity_log                    : % rows', v_n;

-- Invoice lines first (ON DELETE RESTRICT on purchase_invoice)
DELETE FROM document.purchase_invoice_line
WHERE purchase_invoice_id IN (
    SELECT id FROM document.purchase_invoice
    WHERE invoice_number IN (
        'INV-A1-0001','INV-A3-0001','INV-A4-0001',
        'INV-A7-0001','INV-A8-0001'
    )
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  purchase_invoice_line           : % rows', v_n;

-- Demo purchase invoices
DELETE FROM document.purchase_invoice
WHERE invoice_number IN (
    'INV-A1-0001','INV-A3-0001','INV-A4-0001',
    'INV-A7-0001','INV-A8-0001'
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  purchase_invoice                : % rows', v_n;

-- Demo payment entries (supplier advance + advance recovery)
DELETE FROM document.payment_entry
WHERE payment_number IN ('ADV-A7-0001','ADV-VA-0001');
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  payment_entry                   : % rows', v_n;

-- Supplier profile link (AUIC × ACME-CONSULT-US)
DELETE FROM master.company_code_supplier_profile csp
USING master.supplier s
JOIN  master.tenant   t ON t.id = s.tenant_id
WHERE csp.supplier_id = s.id
  AND t.code          = 'athyper'
  AND s.supplier_code = 'ACME-CONSULT-US';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  company_code_supplier_profile   : % rows', v_n;

-- Demo supplier
DELETE FROM master.supplier s
USING master.tenant t
WHERE s.tenant_id   = t.id
  AND t.code        = 'athyper'
  AND s.supplier_code = 'ACME-CONSULT-US';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  supplier (ACME-CONSULT-US)      : % rows', v_n;

-- Demo tax groups — delete components first (FK: tax_group_component → tax_group)
DELETE FROM control.tax_group_component tgc
USING control.tax_group tg
JOIN  master.tenant t ON t.id = tg.tenant_id
WHERE tgc.tenant_id = tg.tenant_id
  AND tgc.tax_group_id = tg.id
  AND t.code = 'athyper'
  AND tg.code IN ('VAT_STD_US_7PCT','WHT_CONSULT_10PCT');
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  tax_group_component (demo)      : % rows', v_n;

DELETE FROM control.tax_group tg
USING master.tenant t
WHERE tg.tenant_id = t.id
  AND t.code       = 'athyper'
  AND tg.code IN ('VAT_STD_US_7PCT','WHT_CONSULT_10PCT');
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  tax_group (demo)                : % rows', v_n;

-- Demo payment method
DELETE FROM master.payment_method pm
USING master.tenant t
WHERE pm.tenant_id = t.id
  AND t.code       = 'athyper'
  AND pm.code      = 'WIRE-USD';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  payment_method (WIRE-USD)       : % rows', v_n;

-- ============================================================================
-- §2  AP Non-PO MODULE PACK CONFIGS  (all tenants)
-- ============================================================================
-- Delete in FK cascade order:
--   entry_template → profile_event → profile_config → accounting_profile
--   intent_to_profile_rule, commodity_classification_to_intent_rule, payment_settlement_rule
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE '§2  AP Non-PO Module Pack Configs (all tenants)';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

-- Chain: accounting_profile → acct_profile_config → acct_profile_event → acct_profile_entry_template
DELETE FROM control.acct_profile_entry_template
WHERE profile_event_id IN (
    SELECT ape.id FROM control.acct_profile_event ape
    JOIN   control.acct_profile_config apc ON apc.id = ape.profile_config_id
    JOIN   master.accounting_profile   ap  ON ap.id  = apc.accounting_profile_id
    WHERE  ap.code = ANY(v_ap_profiles)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  acct_profile_entry_template     : % rows', v_n;

DELETE FROM control.acct_profile_event
WHERE profile_config_id IN (
    SELECT apc.id FROM control.acct_profile_config apc
    JOIN   master.accounting_profile ap ON ap.id = apc.accounting_profile_id
    WHERE  ap.code = ANY(v_ap_profiles)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  acct_profile_event              : % rows', v_n;

-- intent_to_accounting_profile_rule FKs to acct_profile_config via resolved_profile_config_id
DELETE FROM control.intent_to_accounting_profile_rule
WHERE resolved_profile_config_id IN (
    SELECT apc.id FROM control.acct_profile_config apc
    JOIN   master.accounting_profile ap ON ap.id = apc.accounting_profile_id
    WHERE  ap.code = ANY(v_ap_profiles)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  intent_to_accounting_profile_rule: % rows', v_n;

DELETE FROM control.acct_profile_config
WHERE accounting_profile_id IN (
    SELECT id FROM master.accounting_profile WHERE code = ANY(v_ap_profiles)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  acct_profile_config             : % rows', v_n;

DELETE FROM control.commodity_classification_to_intent_rule
WHERE metadata->'_seed'->>'pack' = 'pack_ap_non_po';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  commodity_classification_to_intent_rule   : % rows', v_n;

DELETE FROM control.payment_settlement_rule
WHERE metadata->>'auto_created_by' = 'pack_ap_non_po';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  payment_settlement_rule         : % rows', v_n;

DELETE FROM master.accounting_profile
WHERE code = ANY(v_ap_profiles);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  accounting_profile              : % rows', v_n;

-- ============================================================================
-- §3  INDUSTRY PACK TAXONOMY  (all tenants)
-- ============================================================================
-- Order: routing rules → classifications → business_intent → spend_category
--        (nullify RESTRICT FKs first)
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE '§3  Industry Pack Taxonomy (all tenants)';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

-- Commodity routing rules
DELETE FROM control.commodity_to_spend_category_rule
WHERE metadata->'_seed'->>'pack' = ANY(v_industry_packs);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  commodity_to_spend_category_rule: % rows', v_n;

-- Commodity → spend_category bridge
DELETE FROM master.commodity_classification
WHERE metadata->'_seed'->>'pack' = ANY(v_industry_packs);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  commodity_classification        : % rows', v_n;

-- Business intents (ON DELETE CASCADE → company_code_business_intent_policy)
DELETE FROM master.business_intent
WHERE metadata->'_seed'->>'pack' = ANY(v_industry_packs);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  business_intent                 : % rows', v_n;

-- Commodity categories: nullify RESTRICT FKs in document lines first
UPDATE document.purchase_invoice_line
SET    commodity_category_id = NULL,
       business_intent_id = NULL
WHERE  commodity_category_id IN (
    SELECT id FROM master.commodity_category
    WHERE  metadata->'_seed'->>'pack' = ANY(v_industry_packs)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  purchase_invoice_line nullified  : % rows', v_n;

DELETE FROM control.commodity_category_buy_policy
WHERE commodity_category_id IN (
    SELECT id FROM master.spend_category
    WHERE  metadata->'_seed'->>'pack' = ANY(v_industry_packs)
);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  commodity_category_buy_policy  : % rows', v_n;

-- Spend categories — leaves before roots
DELETE FROM master.spend_category
WHERE parent_id IS NOT NULL
  AND metadata->'_seed'->>'pack' = ANY(v_industry_packs);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  spend_category (leaves)          : % rows', v_n;

DELETE FROM master.spend_category
WHERE metadata->'_seed'->>'pack' = ANY(v_industry_packs);
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  spend_category (roots)           : % rows', v_n;

-- ============================================================================
-- §4  BLUEPRINT APPLICATION RECORDS  (all tenants)
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE '§4  Blueprint Application Records';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

DELETE FROM control.tenant_blueprint_application
WHERE blueprint_code LIKE '%pack_%';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  tenant_blueprint_application    : % rows', v_n;

-- ============================================================================
-- §5  schema_provisions TRACKING  (allow re-seeding pack files later)
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE '§5  schema_provisions Tracking';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

-- Keep blueprints/industry rows intact — provisioning script treats them as "done"
-- and will skip re-applying packs on the next run.
-- Only clear ap_non_po/600_modules if the module pack needs to be re-seeded.
DELETE FROM public.schema_provisions
WHERE file_name LIKE '%ap_non_po%'
   OR file_name LIKE '%600_modules%';
GET DIAGNOSTICS v_n = ROW_COUNT;
RAISE NOTICE '  schema_provisions cleared       : % rows', v_n;

RAISE NOTICE '';
RAISE NOTICE '════════════════════════════════════════════════════════════════';
RAISE NOTICE ' Teardown complete — all pack data removed.';
RAISE NOTICE ' Base data retained: base · foundation_* · coa_ifrs';
RAISE NOTICE '════════════════════════════════════════════════════════════════';

END $teardown$;

COMMIT;
