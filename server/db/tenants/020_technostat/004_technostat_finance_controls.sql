-- ============================================================================
-- FILE: 004_technostat_finance_controls.sql
-- Tenant: technostat  (UUID: 019db587-47de-7dd2-8a5e-ef07e08f476c)
-- Companies: TKSA (SA/SAR/IFRS) · SSK (SA/SAR/IFRS) · TEGY (EG/EGP/IFRS)
--            SDTX (EG/EGP/IFRS)
--
-- Purpose: Finance & Supply Chain controls and configuration missing from
--          the foundation seed (003_technostat_production_seed.sql).
--
--   P01   Tax registration numbers on legal entities
--   P02   Rounding rules (SAR · EGP)
--   P03   Tax groups — composite VAT+WHT presets per jurisdiction
--   P04   Entity numbering config is provided by platform defaults
--   P05   Accounting profiles — AP (4) · AR (2) standard profiles
--   P06   Spend categories — hierarchical procurement taxonomy (17 nodes)
--   P07   Bank accounts + bank_account_link to company codes (4 per CC)
--   P08   Payment methods — wire · local transfer · cheque · cash · IC offset
--   P09   Intercompany agreements — TKSA ↔ SSK · TEGY · SDTX (4 ICAs)
--   P10   Validation assertions
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING / DO UPDATE
-- Depends on: 003_technostat_production_seed.sql (legal entities, CCs, etc.)
-- ============================================================================



-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P01: TAX REGISTRATION NUMBERS ON LEGAL ENTITIES                         ║
-- ║                                                                          ║
-- ║  SA (ZATCA):  15-digit VAT registration number                           ║
-- ║              + 10-digit Commercial Registration (CR) in metadata         ║
-- ║  EG (ETA):    9-digit Tax Identification Number                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p01$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    UPDATE master.legal_entity
    SET
        tax_registration_number = '310567890100003',
        metadata = metadata || jsonb_build_object(
            'cr_number',      '1010567890',
            'zatca_vat_no',   '310567890100003',
            'zatca_status',   'registered',
            'zatca_reg_date', '2015-03-15'
        ),
        updated_at = now()
    WHERE tenant_id = v_tid AND code = 'LE-TKSA'
      AND (tax_registration_number IS NULL OR tax_registration_number = '');

    UPDATE master.legal_entity
    SET
        tax_registration_number = '310781234200004',
        metadata = metadata || jsonb_build_object(
            'cr_number',      '1010781234',
            'zatca_vat_no',   '310781234200004',
            'zatca_status',   'registered',
            'zatca_reg_date', '2017-06-01'
        ),
        updated_at = now()
    WHERE tenant_id = v_tid AND code = 'LE-SSK'
      AND (tax_registration_number IS NULL OR tax_registration_number = '');

    UPDATE master.legal_entity
    SET
        tax_registration_number = '123456789',
        metadata = metadata || jsonb_build_object(
            'eta_tax_id',     '123456789',
            'eta_status',     'registered',
            'eta_reg_date',   '2018-09-20',
            'commercial_reg', 'EG-CAIRO-2018-00456'
        ),
        updated_at = now()
    WHERE tenant_id = v_tid AND code = 'LE-TEGY'
      AND (tax_registration_number IS NULL OR tax_registration_number = '');

    UPDATE master.legal_entity
    SET
        tax_registration_number = '987654321',
        metadata = metadata || jsonb_build_object(
            'eta_tax_id',     '987654321',
            'eta_status',     'registered',
            'eta_reg_date',   '2022-01-10',
            'commercial_reg', 'EG-CAIRO-2022-01892'
        ),
        updated_at = now()
    WHERE tenant_id = v_tid AND code = 'LE-SDTX'
      AND (tax_registration_number IS NULL OR tax_registration_number = '');

    RAISE NOTICE '[P01] Tax registration numbers applied to 4 legal entities';
END $p01$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P02: ROUNDING RULES                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p02$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    INSERT INTO control.rounding_rule (
        tenant_id, code, name, method,
        precision_digits, gl_variance_approval_required,
        created_by)
    VALUES
    (v_tid, 'RR-SAR', 'Saudi Riyal Standard Rounding',
     'ROUND_HALF_UP', 2, false, v_su),
    (v_tid, 'RR-EGP', 'Egyptian Pound Standard Rounding',
     'ROUND_HALF_UP', 2, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P02] 2 rounding rules seeded (SAR, EGP)';
END $p02$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P03: TAX GROUPS                                                         ║
-- ║                                                                          ║
-- ║  KSA_STANDARD  — VAT 15% (PURCHASE direction, recoverable)               ║
-- ║  KSA_WHT_5     — WHT 5%  (PAYMENT direction, technical services)         ║
-- ║  EGY_STANDARD  — VAT 14% (PURCHASE direction, recoverable)               ║
-- ║  EGY_WHT_5     — WHT 5%  (PAYMENT direction, domestic services)          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p03$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_tj_sa    uuid;
    v_tj_eg    uuid;
    v_ttype_vat_sa uuid; v_ttype_wht_sa uuid;
    v_ttype_vat_eg uuid; v_ttype_wht_eg uuid;
    v_trs_vat_sa_pur uuid; v_trs_wht_sa_pay uuid;
    v_trs_vat_eg_pur uuid; v_trs_wht_eg_pay uuid;
    v_grp_ksa_std uuid; v_grp_ksa_wht uuid;
    v_grp_egy_std uuid; v_grp_egy_wht uuid;
BEGIN
    SELECT id INTO v_tid    FROM master.tenant          WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_tj_sa  FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND code = 'TJ-SA';
    SELECT id INTO v_tj_eg  FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND code = 'TJ-EG';
    SELECT id INTO v_ttype_vat_sa FROM master.tax_type  WHERE tenant_id = v_tid AND code = 'VAT-SA';
    SELECT id INTO v_ttype_wht_sa FROM master.tax_type  WHERE tenant_id = v_tid AND code = 'WHT-SA';
    SELECT id INTO v_ttype_vat_eg FROM master.tax_type  WHERE tenant_id = v_tid AND code = 'VAT-EG';
    SELECT id INTO v_ttype_wht_eg FROM master.tax_type  WHERE tenant_id = v_tid AND code = 'WHT-EG';

    -- Resolve tax rate schedule IDs (purchase + payment directions)
    SELECT id INTO v_trs_vat_sa_pur FROM control.tax_rate_schedule
        WHERE tenant_id = v_tid AND tax_type_id = v_ttype_vat_sa
          AND tax_direction = 'PURCHASE' AND rate_value = 15.0 LIMIT 1;
    SELECT id INTO v_trs_wht_sa_pay FROM control.tax_rate_schedule
        WHERE tenant_id = v_tid AND tax_type_id = v_ttype_wht_sa
          AND tax_direction = 'PAYMENT' AND rate_value = 5.0 LIMIT 1;
    SELECT id INTO v_trs_vat_eg_pur FROM control.tax_rate_schedule
        WHERE tenant_id = v_tid AND tax_type_id = v_ttype_vat_eg
          AND tax_direction = 'PURCHASE' AND rate_value = 14.0 LIMIT 1;
    SELECT id INTO v_trs_wht_eg_pay FROM control.tax_rate_schedule
        WHERE tenant_id = v_tid AND tax_type_id = v_ttype_wht_eg
          AND tax_direction = 'PAYMENT' AND rate_value = 5.0 LIMIT 1;

    -- ── Tax groups ──────────────────────────────────────────────────────────
    INSERT INTO control.tax_group (
        tenant_id, code, name, description, created_by)
    VALUES
    (v_tid, 'TG-KSA-STD', 'KSA VAT 15% Standard',
     'Standard KSA VAT at 15% — purchase direction, fully recoverable', v_su),
    (v_tid, 'TG-KSA-WHT5', 'KSA WHT 5% Technical Services',
     'KSA withholding tax at 5% on technical service payments', v_su),
    (v_tid, 'TG-EGY-STD', 'Egypt VAT 14% Standard',
     'Standard Egyptian VAT at 14% — purchase direction, recoverable', v_su),
    (v_tid, 'TG-EGY-WHT5', 'Egypt WHT 5% Domestic Services',
     'Egyptian withholding tax at 5% on domestic service payments', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- Resolve group IDs for component inserts
    SELECT id INTO v_grp_ksa_std  FROM control.tax_group WHERE tenant_id = v_tid AND code = 'TG-KSA-STD';
    SELECT id INTO v_grp_ksa_wht  FROM control.tax_group WHERE tenant_id = v_tid AND code = 'TG-KSA-WHT5';
    SELECT id INTO v_grp_egy_std  FROM control.tax_group WHERE tenant_id = v_tid AND code = 'TG-EGY-STD';
    SELECT id INTO v_grp_egy_wht  FROM control.tax_group WHERE tenant_id = v_tid AND code = 'TG-EGY-WHT5';

    -- ── Tax group components (link groups → rate schedules) ─────────────────
    IF v_trs_vat_sa_pur IS NOT NULL THEN
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq, created_by)
        VALUES (v_tid, v_grp_ksa_std, v_trs_vat_sa_pur, 1, v_su)
        ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;
    END IF;

    IF v_trs_wht_sa_pay IS NOT NULL THEN
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq, created_by)
        VALUES (v_tid, v_grp_ksa_wht, v_trs_wht_sa_pay, 1, v_su)
        ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;
    END IF;

    IF v_trs_vat_eg_pur IS NOT NULL THEN
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq, created_by)
        VALUES (v_tid, v_grp_egy_std, v_trs_vat_eg_pur, 1, v_su)
        ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;
    END IF;

    IF v_trs_wht_eg_pay IS NOT NULL THEN
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq, created_by)
        VALUES (v_tid, v_grp_egy_wht, v_trs_wht_eg_pay, 1, v_su)
        ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[P03] 4 tax groups seeded (KSA-STD, KSA-WHT5, EGY-STD, EGY-WHT5)';
END $p03$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P05: ACCOUNTING PROFILES                                                ║
-- ║                                                                          ║
-- ║  AP profiles (INBOUND/AP):                                               ║
-- ║    AP_NON_PO_STANDARD   — OPEX Non-PO invoices                           ║
-- ║    AP_NON_PO_CAPEX      — CAPEX Non-PO invoices                          ║
-- ║    AP_ADVANCE_SUPPLIER  — Supplier advance / prepayment                  ║
-- ║    AP_RETENTION_RELEASE — AP Retention Payable release                   ║
-- ║                                                                          ║
-- ║  AR profiles (OUTBOUND/AR):                                              ║
-- ║    AR_STANDARD          — Standard sales invoice / revenue               ║
-- ║    AR_ADVANCE_CUSTOMER  — Customer advance / deposit                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p05$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    INSERT INTO master.accounting_profile (
        tenant_id, code, name, description,
        direction, subledger_type, domain_hint,
        icon_key, color_token, sort_order,
        status, created_by)
    VALUES
    -- AP profiles
    (v_tid, 'AP_NON_PO_STANDARD',
     'AP Non-PO — Standard OPEX',
     'Standard Non-PO supplier invoice for operating expenditure. '
     'Dr Expense / Cr AP Trade Payable. Supports VAT and WHT.',
     'INBOUND', 'AP', 'OPEX',
     'file-text', 'violet', 100, 'active', v_su),

    (v_tid, 'AP_NON_PO_CAPEX',
     'AP Non-PO — CAPEX',
     'Non-PO supplier invoice for capital expenditure. '
     'Dr Fixed Asset (CWIP or direct) / Cr AP Trade Payable.',
     'INBOUND', 'AP', 'CAPEX',
     'building', 'indigo', 110, 'active', v_su),

    (v_tid, 'AP_ADVANCE_SUPPLIER',
     'AP Advance — Supplier Level',
     'Standalone advance payment to supplier without a prior invoice. '
     'Dr AP Advance (asset) / Cr Bank Clearing on payment. '
     'Recovered by later invoices.',
     'INBOUND', 'AP', 'OPEX',
     'circle-dollar-sign', 'amber', 120, 'active', v_su),

    (v_tid, 'AP_RETENTION_RELEASE',
     'AP Retention Release',
     'Release of previously-withheld supplier retention on milestone. '
     'Dr AP Retention Payable / Cr Bank Clearing.',
     'INBOUND', 'AP', 'OPEX',
     'unlock', 'teal', 130, 'active', v_su),

    -- AR profiles
    (v_tid, 'AR_STANDARD',
     'AR Standard — Revenue Invoice',
     'Standard customer sales invoice. '
     'Dr AR Trade Receivable / Cr Revenue. Supports VAT collection and WHT deduction.',
     'OUTBOUND', 'AR', 'REVENUE',
     'receipt', 'emerald', 200, 'active', v_su),

    (v_tid, 'AR_ADVANCE_CUSTOMER',
     'AR Advance — Customer Deposit',
     'Advance payment received from customer before invoice. '
     'Dr Bank Clearing / Cr Customer Advance (liability). '
     'Applied against future invoices.',
     'OUTBOUND', 'AR', 'OPEX',
     'piggy-bank', 'cyan', 210, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P05] 6 accounting profiles seeded (4 AP + 2 AR)';
END $p05$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P06: SPEND CATEGORIES                                                   ║
-- ║                                                                          ║
-- ║  Hierarchical taxonomy — 5 root + 12 leaf nodes = 17 total              ║
-- ║                                                                          ║
-- ║  SC-IT       Information Technology                                      ║
-- ║    SC-IT-HW    Hardware & Infrastructure                                 ║
-- ║    SC-IT-SW    Software & Licenses                                       ║
-- ║    SC-IT-SVC   IT Services & Consulting                                  ║
-- ║  SC-PROF     Professional Services                                       ║
-- ║    SC-PROF-LEGAL   Legal & Compliance                                    ║
-- ║    SC-PROF-AUDIT   Audit & Advisory                                      ║
-- ║    SC-PROF-MGMT    Management Consulting                                 ║
-- ║  SC-FACIL    Facilities & Utilities                                      ║
-- ║    SC-FACIL-RENT   Office Rent & Leases                                  ║
-- ║    SC-FACIL-UTIL   Utilities & Telecoms                                  ║
-- ║    SC-FACIL-MAINT  Maintenance & Repairs                                 ║
-- ║  SC-CONST    Construction Materials (SSK)                                ║
-- ║    SC-CONST-MAT    Raw Materials & Supplies                              ║
-- ║    SC-CONST-EQUIP  Equipment Rental                                      ║
-- ║  SC-TRADE    Trading Goods (TEGY)                                        ║
-- ║    SC-TRADE-IMP    Imported Goods                                        ║
-- ║    SC-TRADE-LOC    Local Procurement                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p06$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    -- Root IDs
    v_sc_it     uuid; v_sc_prof  uuid; v_sc_facil uuid;
    v_sc_const  uuid; v_sc_trade uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_finance_controls', 'version', '1.0.0'));

    -- ── STAGE A: Root categories (root_category_id = self) ──────────────────
    v_sc_it    := shared.uuidv7();
    v_sc_prof  := shared.uuidv7();
    v_sc_facil := shared.uuidv7();
    v_sc_const := shared.uuidv7();
    v_sc_trade := shared.uuidv7();

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description,
        parent_id, root_category_id,
        procurement_type, visibility, sort_order,
        metadata, created_by)
    VALUES
    (v_sc_it,    v_tid, 'SC-IT',    'Information Technology',
     'All IT goods and services: hardware, software, managed services',
     NULL, v_sc_it,    'services', 'standard', 10, v_meta, v_su),
    (v_sc_prof,  v_tid, 'SC-PROF',  'Professional Services',
     'Legal, audit, advisory, consulting and other professional services',
     NULL, v_sc_prof,  'services', 'standard', 20, v_meta, v_su),
    (v_sc_facil, v_tid, 'SC-FACIL', 'Facilities & Utilities',
     'Office rent, utilities, telecommunications, maintenance',
     NULL, v_sc_facil, 'goods',    'standard', 30, v_meta, v_su),
    (v_sc_const, v_tid, 'SC-CONST', 'Construction Materials',
     'Raw materials, consumables, and equipment for SSK construction operations',
     NULL, v_sc_const, 'goods',    'standard', 40, v_meta, v_su),
    (v_sc_trade, v_tid, 'SC-TRADE', 'Trading Goods',
     'Import and local procurement of goods for TEGY trading operations',
     NULL, v_sc_trade, 'goods',    'standard', 50, v_meta, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- Re-resolve root IDs in case of conflict (already existed)
    SELECT id INTO v_sc_it    FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-IT';
    SELECT id INTO v_sc_prof  FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-PROF';
    SELECT id INTO v_sc_facil FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-FACIL';
    SELECT id INTO v_sc_const FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-CONST';
    SELECT id INTO v_sc_trade FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-TRADE';

    -- ── STAGE B: Leaf categories ─────────────────────────────────────────────
    INSERT INTO master.spend_category (
        tenant_id, code, name, description,
        parent_id, root_category_id,
        procurement_type, visibility, sort_order,
        metadata, created_by)
    VALUES
    -- IT children
    (v_tid, 'SC-IT-HW', 'Hardware & Infrastructure',
     'Servers, network equipment, end-user devices, DC infrastructure, cables',
     v_sc_it, v_sc_it, 'goods',    'standard', 11, v_meta, v_su),
    (v_tid, 'SC-IT-SW', 'Software & Licenses',
     'Commercial software, SaaS subscriptions, OS, database, productivity',
     v_sc_it, v_sc_it, 'services', 'standard', 12, v_meta, v_su),
    (v_tid, 'SC-IT-SVC', 'IT Services & Consulting',
     'Managed services, outsourcing, NOC/SOC, implementation, support',
     v_sc_it, v_sc_it, 'services', 'standard', 13, v_meta, v_su),
    -- Professional Services children
    (v_tid, 'SC-PROF-LEGAL', 'Legal & Compliance',
     'Legal fees, regulatory filings, compliance advisory',
     v_sc_prof, v_sc_prof, 'services', 'standard', 21, v_meta, v_su),
    (v_tid, 'SC-PROF-AUDIT', 'Audit & Advisory',
     'External audit, internal audit, tax advisory, financial due diligence',
     v_sc_prof, v_sc_prof, 'services', 'standard', 22, v_meta, v_su),
    (v_tid, 'SC-PROF-MGMT', 'Management Consulting',
     'Strategy, transformation, HR advisory, process improvement',
     v_sc_prof, v_sc_prof, 'services', 'standard', 23, v_meta, v_su),
    -- Facilities children
    (v_tid, 'SC-FACIL-RENT', 'Office Rent & Leases',
     'Office premises, warehouse leases, compound fees, car parking',
     v_sc_facil, v_sc_facil, 'services', 'standard', 31, v_meta, v_su),
    (v_tid, 'SC-FACIL-UTIL', 'Utilities & Telecoms',
     'Electricity, water, gas, internet connectivity, mobile data',
     v_sc_facil, v_sc_facil, 'goods',    'standard', 32, v_meta, v_su),
    (v_tid, 'SC-FACIL-MAINT', 'Maintenance & Repairs',
     'Building maintenance, AC, janitorial, security, pest control',
     v_sc_facil, v_sc_facil, 'services', 'standard', 33, v_meta, v_su),
    -- Construction children
    (v_tid, 'SC-CONST-MAT', 'Raw Materials & Supplies',
     'Cement, steel, aggregates, electrical, MEP materials, site consumables',
     v_sc_const, v_sc_const, 'goods',    'standard', 41, v_meta, v_su),
    (v_tid, 'SC-CONST-EQUIP', 'Equipment Rental',
     'Crane, excavator, scaffolding, heavy plant and specialised tool hire',
     v_sc_const, v_sc_const, 'goods',    'standard', 42, v_meta, v_su),
    -- Trading Goods children
    (v_tid, 'SC-TRADE-IMP', 'Imported Goods',
     'CIF/FOB imported goods for resale: electronics, industrial, consumer',
     v_sc_trade, v_sc_trade, 'goods',    'standard', 51, v_meta, v_su),
    (v_tid, 'SC-TRADE-LOC', 'Local Procurement',
     'Locally-sourced goods for resale or distribution within Egypt',
     v_sc_trade, v_sc_trade, 'goods',    'standard', 52, v_meta, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        level_no, sort_order, buy_allowed, is_classification_required,
        is_hs_required, is_regulated, allowed_classification_domains,
        metadata, status, created_by)
    SELECT
        sc.id,
        sc.tenant_id,
        sc.code,
        sc.name,
        sc.description,
        NULL,
        sc.id,
        1,
        sc.sort_order,
        true,
        sc.is_classification_required,
        sc.is_hs_required,
        sc.is_regulated,
        COALESCE(sc.allowed_domains, '[]'::jsonb),
        COALESCE(sc.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', '004_finance_controls',
                'source_table', 'master.spend_category',
                'source_id', sc.id,
                'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE
       SET name                           = EXCLUDED.name,
           description                    = EXCLUDED.description,
           buy_allowed                    = true,
           is_classification_required     = EXCLUDED.is_classification_required,
           is_hs_required                 = EXCLUDED.is_hs_required,
           is_regulated                   = EXCLUDED.is_regulated,
           allowed_classification_domains = EXCLUDED.allowed_classification_domains,
           metadata                       = master.commodity_category.metadata
                                            || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
           updated_at                     = now(),
           updated_by                     = v_su;

    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        level_no, sort_order, buy_allowed, is_classification_required,
        is_hs_required, is_regulated, allowed_classification_domains,
        metadata, status, created_by)
    SELECT
        sc.id,
        sc.tenant_id,
        sc.code,
        sc.name,
        sc.description,
        parent_cc.id,
        root_cc.id,
        COALESCE(parent_cc.level_no + 1, 2),
        sc.sort_order,
        true,
        sc.is_classification_required,
        sc.is_hs_required,
        sc.is_regulated,
        COALESCE(sc.allowed_domains, '[]'::jsonb),
        COALESCE(sc.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', '004_finance_controls',
                'source_table', 'master.spend_category',
                'source_id', sc.id,
                'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    JOIN master.spend_category parent_sc
      ON parent_sc.tenant_id = sc.tenant_id
     AND parent_sc.id = sc.parent_id
    JOIN master.spend_category root_sc
      ON root_sc.tenant_id = sc.tenant_id
     AND root_sc.id = sc.root_category_id
    JOIN master.commodity_category parent_cc
      ON parent_cc.tenant_id = sc.tenant_id
     AND parent_cc.code = parent_sc.code
    JOIN master.commodity_category root_cc
      ON root_cc.tenant_id = sc.tenant_id
     AND root_cc.code = root_sc.code
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE
       SET name                           = EXCLUDED.name,
           description                    = EXCLUDED.description,
           parent_id                      = EXCLUDED.parent_id,
           root_category_id               = EXCLUDED.root_category_id,
           level_no                       = EXCLUDED.level_no,
           sort_order                     = EXCLUDED.sort_order,
           buy_allowed                    = true,
           is_classification_required     = EXCLUDED.is_classification_required,
           is_hs_required                 = EXCLUDED.is_hs_required,
           is_regulated                   = EXCLUDED.is_regulated,
           allowed_classification_domains = EXCLUDED.allowed_classification_domains,
           metadata                       = master.commodity_category.metadata
                                            || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
           updated_at                     = now(),
           updated_by                     = v_su;

    RAISE NOTICE '[P06] 17 spend categories seeded (5 root + 12 leaf)';
END $p06$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P07: BANK ACCOUNTS + BANK ACCOUNT LINKS                                 ║
-- ║                                                                          ║
-- ║  One operating bank account per company code.                            ║
-- ║  Saudi accounts: IBAN (account_id_type = 'iban')                         ║
-- ║  Egyptian accounts: local (account_id_type = 'local')                   ║
-- ║                                                                          ║
-- ║  TKSA → Riyad Bank, SA IBAN, SAR                                        ║
-- ║  SSK  → Riyad Bank, SA IBAN, SAR                                        ║
-- ║  TEGY → Banque Misr, EG local, EGP                                      ║
-- ║  SDTX → Banque Misr, EG local, EGP                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p07$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
    -- Bank account IDs (pre-generated stable UUIDs for idempotency)
    v_ba_tksa uuid := 'dd001000-0000-0000-0000-000000000001';
    v_ba_ssk  uuid := 'dd001000-0000-0000-0000-000000000002';
    v_ba_tegy uuid := 'dd001000-0000-0000-0000-000000000003';
    v_ba_sdtx uuid := 'dd001000-0000-0000-0000-000000000004';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_finance_controls', 'version', '1.0.0'));

    -- ── STAGE A: master.bank_account ─────────────────────────────────────────
    INSERT INTO master.bank_account (
        id, tenant_id, code, name,
        account_holder_name,
        account_id_type, account_id_value, account_last4,
        currency_code,
        account_nature,
        bic_override, bank_name_override, bank_country_override,
        is_verified, verified_at, metadata, created_by)
    VALUES
    -- TKSA — Riyad Bank Saudi Arabia (SAR)
    (v_ba_tksa, v_tid, 'ba-tksa-sar-01', 'Technostat Group — Riyad Bank SAR',
     'Technostat Group Holdings Co.',
     'iban', 'SA4480000456780000012345', '2345',
     'SAR',
     'direct',
     'RIBLSARI', 'Riyad Bank', 'SA',
     true, now(), v_meta, v_su),

    -- SSK — Riyad Bank Saudi Arabia (SAR)
    (v_ba_ssk, v_tid, 'ba-ssk-sar-01', 'SSK Saudi — Riyad Bank SAR',
     'SSK Saudi Co. for Construction W.L.L.',
     'iban', 'SA8780000456780000056789', '6789',
     'SAR',
     'direct',
     'RIBLSARI', 'Riyad Bank', 'SA',
     true, now(), v_meta, v_su),

    -- TEGY — Banque Misr Egypt (EGP)
    (v_ba_tegy, v_tid, 'ba-tegy-egp-01', 'Technostat Egypt — Banque Misr EGP',
     'Technostat Egypt for Trading S.A.E.',
     'local', '1234567890123456', '3456',
     'EGP',
     'direct',
     'BMISEGCX', 'Banque Misr', 'EG',
     true, now(), v_meta, v_su),

    -- SDTX — Banque Misr Egypt (EGP)
    (v_ba_sdtx, v_tid, 'ba-sdtx-egp-01', 'Satellites DT — Banque Misr EGP',
     'Satellites for Digital Transformation S.A.E.',
     'local', '9876543210987654', '7654',
     'EGP',
     'direct',
     'BMISEGCX', 'Banque Misr', 'EG',
     true, now(), v_meta, v_su)

    ON CONFLICT (tenant_id, id) DO NOTHING;

    -- ── STAGE B: master.bank_account_link (company_code ownership) ───────────
    INSERT INTO master.bank_account_link (
        tenant_id, owner_type, owner_id,
        bank_account_id, company_code_id,
        purpose, is_primary,
        effective_from, created_by)
    VALUES
    (v_tid, 'company_code', v_cc_tksa, v_ba_tksa, v_cc_tksa,
     'default', true, '2025-01-01', v_su),
    (v_tid, 'company_code', v_cc_ssk,  v_ba_ssk,  v_cc_ssk,
     'default', true, '2025-01-01', v_su),
    (v_tid, 'company_code', v_cc_tegy, v_ba_tegy, v_cc_tegy,
     'default', true, '2025-01-01', v_su),
    (v_tid, 'company_code', v_cc_sdtx, v_ba_sdtx, v_cc_sdtx,
     'default', true, '2025-01-01', v_su)

    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[P07] 4 bank accounts + 4 bank_account_link rows seeded';
END $p07$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P08: PAYMENT METHODS                                                    ║
-- ║                                                                          ║
-- ║  5 methods per tenant:                                                   ║
-- ║    PM-WIRE      Wire / RTGS transfer (outbound, requires bank)           ║
-- ║    PM-LOCAL-TRF Local bank transfer / SWIFT (outbound)                   ║
-- ║    PM-CHEQUE    Paper cheque (outbound)                                  ║
-- ║    PM-CASH      Cash disbursement (outbound, no bank required)           ║
-- ║    PM-IC-OFFSET Intercompany offset — no physical settlement             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p08$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    INSERT INTO master.payment_method (
        tenant_id, code, name, description,
        direction, instrument_mode,
        requires_bank_account, requires_counterparty_bank,
        requires_bank_interface, requires_reference_number,
        supports_batch, supports_partial, supports_reversal,
        supports_file_generation, supports_real_time_api,
        sort_order, status, created_by)
    VALUES
    -- Wire / RTGS (SADAD/SARIE in SA; ACH in EG)
    (v_tid, 'PM-WIRE',
     'Wire Transfer (RTGS)',
     'High-value wire or RTGS transfer. '
     'Used for large AP payments and interbank settlements.',
     'outbound', 'bank_transfer',
     true,  true,  true,  true,
     false, true,  true,  true,  true,
     10, 'active', v_su),

    -- Local bank transfer (SARIE for SA domestic, ACH for EG)
    (v_tid, 'PM-LOCAL-TRF',
     'Local Bank Transfer',
     'Domestic electronic fund transfer (SARIE, ACH). '
     'Standard AP payment method for routine supplier payments.',
     'outbound', 'bank_transfer',
     true,  true,  true,  false,
     true,  true,  true,  true,  false,
     20, 'active', v_su),

    -- Cheque
    (v_tid, 'PM-CHEQUE',
     'Cheque / Demand Draft',
     'Paper cheque or demand draft issued to supplier. '
     'Requires manual printing and dispatch.',
     'outbound', 'check',
     true,  false, false, true,
     true,  false, false, false, false,
     30, 'active', v_su),

    -- Cash
    (v_tid, 'PM-CASH',
     'Cash Disbursement',
     'Petty cash or cash-in-hand payment. '
     'No bank account required; limited to small amounts by policy.',
     'outbound', 'cash',
     false, false, false, false,
     false, false, false, false, false,
     40, 'active', v_su),

    -- Intercompany offset
    (v_tid, 'PM-IC-OFFSET',
     'Intercompany Offset',
     'Internal offset of AP vs AR between group companies. '
     'No physical bank settlement; produces IC clearing journal entry.',
     'outbound', 'offset',
     false, false, false, false,
     false, true,  true,  false, false,
     50, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P08] 5 payment methods seeded (WIRE, LOCAL-TRF, CHEQUE, CASH, IC-OFFSET)';
END $p08$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P09: INTERCOMPANY AGREEMENTS                                            ║
-- ║                                                                          ║
-- ║  4 ICAs covering intra-group service recharges:                          ║
-- ║                                                                          ║
-- ║  ICA-2025-001  TKSA → SSK   Management & Group Services (COST_PLUS 5%)  ║
-- ║  ICA-2025-002  TKSA → TEGY  Management & Group Services (COST_PLUS 5%)  ║
-- ║  ICA-2025-003  TKSA → SDTX  Group IT & Shared Services (COST_PLUS 3%)   ║
-- ║  ICA-2025-004  SDTX → TEGY  ICT Services Recharge (TNMM)                ║
-- ║                                                                          ║
-- ║  Status: draft (requires workflow approval before going active)          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p09$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_cc_tksa uuid; v_cc_ssk  uuid;
    v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid      FROM master.tenant       WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_tksa  FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk   FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy  FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    INSERT INTO document.intercompany_agreement (
        tenant_id, code, name,
        company_code_id,
        agreement_number,
        source_company_code_id, dest_company_code_id,
        agreement_type, description,
        transfer_pricing_method, markup_pct,
        currency_code,
        annual_value,
        effective_from, effective_to,
        version, priority, conflict_strategy,
        status, created_by)
    VALUES
    -- ICA 1: TKSA → SSK Management Services
    (v_tid, 'ICA-2025-001', 'TKSA–SSK Management & Group Services Agreement',
     v_cc_tksa, 'ICA-2025-001',
     v_cc_tksa, v_cc_ssk,
     'MANAGEMENT_FEE',
     'Group management and shared services recharge from TKSA HQ to SSK Saudi. '
     'Covers: finance, HR, legal, IT, procurement oversight.',
     'COST_PLUS', 5.00,
     'SAR', 1500000.00,
     '2025-01-01', '2025-12-31',
     1, 10, 'HIGHEST_PRIORITY',
     'draft', v_su),

    -- ICA 2: TKSA → TEGY Management Services
    (v_tid, 'ICA-2025-002', 'TKSA–TEGY Management & Group Services Agreement',
     v_cc_tksa, 'ICA-2025-002',
     v_cc_tksa, v_cc_tegy,
     'MANAGEMENT_FEE',
     'Group management and shared services recharge from TKSA HQ to Technostat Egypt. '
     'Covers: finance, HR, legal, group IT.',
     'COST_PLUS', 5.00,
     'SAR', 800000.00,
     '2025-01-01', '2025-12-31',
     1, 10, 'HIGHEST_PRIORITY',
     'draft', v_su),

    -- ICA 3: TKSA → SDTX Group IT Services
    (v_tid, 'ICA-2025-003', 'TKSA–SDTX Group IT & Shared Services Agreement',
     v_cc_tksa, 'ICA-2025-003',
     v_cc_tksa, v_cc_sdtx,
     'MANAGEMENT_FEE',
     'Group IT infrastructure and shared services recharge from TKSA to Satellites DT. '
     'Covers: ERP hosting, group network, cybersecurity overhead.',
     'COST_PLUS', 3.00,
     'SAR', 600000.00,
     '2025-01-01', '2025-12-31',
     1, 10, 'HIGHEST_PRIORITY',
     'draft', v_su),

    -- ICA 4: SDTX → TEGY ICT Services
    (v_tid, 'ICA-2025-004', 'SDTX–TEGY ICT Services Recharge Agreement',
     v_cc_sdtx, 'ICA-2025-004',
     v_cc_sdtx, v_cc_tegy,
     'SERVICES',
     'ICT services recharge from Satellites DT to Technostat Egypt. '
     'Covers: ERP support, network management, NOC monitoring for TEGY. '
     'Priced on TNMM basis (operating margin comparison).',
     'TNMM', NULL,
     'EGP', 12000000.00,
     '2025-01-01', '2025-12-31',
     1, 20, 'HIGHEST_PRIORITY',
     'draft', v_su)

    ON CONFLICT (tenant_id, company_code_id, agreement_number) DO NOTHING;

    RAISE NOTICE '[P09] 4 intercompany agreements seeded (all draft — pending workflow approval)';
END $p09$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P10: VALIDATION                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p10$
DECLARE
    v_tid         uuid;
    v_tax_reg     int;
    v_rounding    int;
    v_tax_groups  int;
    v_acct_prof   int;
    v_spend_cat   int;
    v_bank_accts  int;
    v_pay_methods int;
    v_ic_agmt     int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P10] technostat tenant missing'; END IF;

    SELECT count(*) INTO v_tax_reg
        FROM master.legal_entity
        WHERE tenant_id = v_tid
          AND tax_registration_number IS NOT NULL
          AND tax_registration_number <> '';

    SELECT count(*) INTO v_rounding
        FROM control.rounding_rule WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_tax_groups
        FROM control.tax_group WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_acct_prof
        FROM master.accounting_profile WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_spend_cat
        FROM master.spend_category WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_bank_accts
        FROM master.bank_account WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_pay_methods
        FROM master.payment_method WHERE tenant_id = v_tid;

    SELECT count(*) INTO v_ic_agmt
        FROM document.intercompany_agreement WHERE tenant_id = v_tid;

    -- Assertions
    IF v_tax_reg    < 4  THEN RAISE EXCEPTION '[P10] Expected 4 LEs with tax reg, got %', v_tax_reg; END IF;
    IF v_rounding   < 2  THEN RAISE EXCEPTION '[P10] Expected ≥2 rounding rules, got %',  v_rounding; END IF;
    IF v_tax_groups < 4  THEN RAISE EXCEPTION '[P10] Expected ≥4 tax groups, got %',      v_tax_groups; END IF;
    IF v_acct_prof  < 6  THEN RAISE EXCEPTION '[P10] Expected ≥6 accounting profiles, got %', v_acct_prof; END IF;
    IF v_spend_cat  < 17 THEN RAISE EXCEPTION '[P10] Expected ≥17 spend categories, got %', v_spend_cat; END IF;
    IF v_bank_accts < 4  THEN RAISE EXCEPTION '[P10] Expected ≥4 bank accounts, got %',   v_bank_accts; END IF;
    IF v_pay_methods < 5 THEN RAISE EXCEPTION '[P10] Expected ≥5 payment methods, got %', v_pay_methods; END IF;
    IF v_ic_agmt    < 4  THEN RAISE EXCEPTION '[P10] Expected ≥4 IC agreements, got %',   v_ic_agmt; END IF;

    RAISE NOTICE '=== [P10] Technostat Finance Controls Validated ===';
    RAISE NOTICE '  Legal entities w/tax reg:     %', v_tax_reg;
    RAISE NOTICE '  Rounding rules:               %', v_rounding;
    RAISE NOTICE '  Tax groups:                   %', v_tax_groups;
    RAISE NOTICE '  Accounting profiles:          %', v_acct_prof;
    RAISE NOTICE '  Spend categories:             %', v_spend_cat;
    RAISE NOTICE '  Bank accounts:                %', v_bank_accts;
    RAISE NOTICE '  Payment methods:              %', v_pay_methods;
    RAISE NOTICE '  Intercompany agreements:      %', v_ic_agmt;
    RAISE NOTICE '  Tenant ID:                    %', v_tid;
END $p10$;
