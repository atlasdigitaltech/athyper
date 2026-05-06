-- ============================================================================
-- FILE: 006_technostat_intercompany_master.sql
-- Tenant: technostat  (realm: athyper / resolved by code, not hard-coded UUID)
-- Depends on: 003_technostat_production_seed.sql  (LEs, CCs, principals)
--             004_technostat_finance_controls.sql  (payment methods, ICAs)
-- ============================================================================
--
-- IC GROUP STRUCTURE
--   TKSA (HQ, SA) provides management + IT services TO: SSK, TEGY, SDTX
--   SDTX (EG)    provides ICT services              TO: TEGY
--
-- AP FLOW DIRECTION          BUYER CC → SELLER CC
--   ICA-2025-001             SSK  →  TKSA  (management fee)
--   ICA-2025-002             TEGY →  TKSA  (management fee)
--   ICA-2025-003             SDTX →  TKSA  (IT services)
--   ICA-2025-004             TEGY →  SDTX  (ICT services)
--
-- EXECUTION ORDER:
--   P01  Enable is_intercompany_enabled on all 4 company codes
--   P02  Internal business partners (partner_category = 'internal', 4 rows)
--   P03  Supplier roles (supplier_type = 'intercompany', 4 rows)
--   P04  Customer roles (customer_type = 'intercompany', 4 rows)
--   P05  LE → BP self_bp identity links (4 rows)
--   P06  company_code_supplier_profile — AP view per buying CC  (4 rows)
--   P07  company_code_customer_profile — AR view per selling CC (4 rows)
--   P08  intercompany_trading_pair — directional routes (4 rows)
--   P09  Back-link: attach profiles to trading pairs
--   P10  Validation assertions
--
-- STABLE UUID SERIES:
--   BP:   dd002000-0000-0000-0000-000000000001..0004
--   SUP:  dd002000-0000-0000-0000-000000000011..0014
--   CUS:  dd002000-0000-0000-0000-000000000021..0024
--   CCSP: dd002000-0000-0000-0000-000000000031..0034  (company_code_supplier_profile)
--   CCCP: dd002000-0000-0000-0000-000000000041..0044  (company_code_customer_profile)
--   ICTP: dd002000-0000-0000-0000-000000000051..0054  (intercompany_trading_pair)
--   LEPL: dd002000-0000-0000-0000-000000000061..0064  (le_bp_link)
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.
-- ============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P01: ENABLE INTERCOMPANY FLAG ON COMPANY CODES                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p01$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    UPDATE master.company_code
    SET    is_intercompany_enabled = true
    WHERE  tenant_id = v_tid
      AND  code IN ('TKSA', 'SSK', 'TEGY', 'SDTX')
      AND  is_intercompany_enabled = false;

    RAISE NOTICE '[P01] is_intercompany_enabled = true for TKSA, SSK, TEGY, SDTX';
END $p01$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P02: INTERNAL BUSINESS PARTNERS                                          ║
-- ║                                                                          ║
-- ║  Each legal entity gets one internal BP. partner_category = 'internal'   ║
-- ║  means: this BP represents a group entity, not an external party.        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p02$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    INSERT INTO master.business_partner (
        id, tenant_id, code, name, display_name,
        partner_category,
        legal_name,
        legal_form, registration_country_code,
        description,
        metadata, status, created_by)
    VALUES
    -- BP-TKSA — Technostat Group HQ
    ('dd002000-0000-0000-0000-000000000001'::uuid,
     v_tid, 'BP-TKSA', 'Technostat Group HQ', 'Technostat Group',
     'internal',
     'Technostat Group Holdings Co.',
     'private_limited', 'SA',
     'Internal BP for Technostat Group HQ (TKSA). Used as counterparty in IC AP/AR flows.',
     v_meta, 'active', v_su),

    -- BP-SSK — SSK Saudi
    ('dd002000-0000-0000-0000-000000000002'::uuid,
     v_tid, 'BP-SSK', 'SSK Saudi', 'SSK Saudi',
     'internal',
     'SSK Saudi Co. for Construction W.L.L.',
     'private_limited', 'SA',
     'Internal BP for SSK Saudi (SSK). Used as counterparty in IC AP/AR flows.',
     v_meta, 'active', v_su),

    -- BP-TEGY — Technostat Egypt
    ('dd002000-0000-0000-0000-000000000003'::uuid,
     v_tid, 'BP-TEGY', 'Technostat Egypt', 'Technostat Egypt',
     'internal',
     'Technostat Egypt for Trading S.A.E.',
     'private_limited', 'EG',
     'Internal BP for Technostat Egypt (TEGY). Used as counterparty in IC AP/AR flows.',
     v_meta, 'active', v_su),

    -- BP-SDTX — Satellites Digital Transformation
    ('dd002000-0000-0000-0000-000000000004'::uuid,
     v_tid, 'BP-SDTX', 'Satellites DT', 'Satellites for Digital Transformation',
     'internal',
     'Satellites for Digital Transformation S.A.E.',
     'private_limited', 'EG',
     'Internal BP for Satellites DT (SDTX). Used as counterparty in IC AP/AR flows.',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P02] 4 internal business partners seeded (BP-TKSA, BP-SSK, BP-TEGY, BP-SDTX)';
END $p02$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P03: INTERCOMPANY SUPPLIER ROLES                                         ║
-- ║                                                                          ║
-- ║  Each internal BP gets one supplier role (supplier_type = 'intercompany') ║
-- ║  so it can appear in AP as the billing/selling entity.                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p03$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
    v_pm_offset uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_pm_offset FROM master.payment_method
        WHERE tenant_id = v_tid AND code = 'PM-IC-OFFSET';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    INSERT INTO master.supplier (
        id, tenant_id, business_partner_id,
        supplier_code, supplier_type,
        payment_method_id,
        is_payment_ready,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000011'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000001'::uuid,
     'SUP-TKSA', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000012'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000002'::uuid,
     'SUP-SSK', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000013'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000003'::uuid,
     'SUP-TEGY', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000014'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000004'::uuid,
     'SUP-SDTX', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, supplier_code) DO NOTHING;

    RAISE NOTICE '[P03] 4 intercompany supplier roles seeded (SUP-TKSA/SSK/TEGY/SDTX)';
END $p03$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P04: INTERCOMPANY CUSTOMER ROLES                                         ║
-- ║                                                                          ║
-- ║  Each internal BP gets one customer role (customer_type = 'intercompany') ║
-- ║  so it can appear in AR as the buying entity that is billed.             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p04$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    INSERT INTO master.customer (
        id, tenant_id, business_partner_id,
        customer_code, customer_type,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000021'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000001'::uuid,
     'CUS-TKSA', 'intercompany',
     v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000022'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000002'::uuid,
     'CUS-SSK', 'intercompany',
     v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000023'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000003'::uuid,
     'CUS-TEGY', 'intercompany',
     v_meta, 'active', v_su),

    ('dd002000-0000-0000-0000-000000000024'::uuid,
     v_tid, 'dd002000-0000-0000-0000-000000000004'::uuid,
     'CUS-SDTX', 'intercompany',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, customer_code) DO NOTHING;

    RAISE NOTICE '[P04] 4 intercompany customer roles seeded (CUS-TKSA/SSK/TEGY/SDTX)';
END $p04$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P05: LEGAL ENTITY → BP SELF LINKS                                        ║
-- ║                                                                          ║
-- ║  Maps each legal entity to its internal BP (self_bp relationship).       ║
-- ║  Validated by trigger: trg_lebpl_self_bp_guard.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p05$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    -- LE IDs
    v_le_tksa uuid; v_le_ssk  uuid;
    v_le_tegy uuid; v_le_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA';
    SELECT id INTO v_le_ssk  FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SSK';
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY';
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    INSERT INTO master.legal_entity_business_partner_link (
        id, tenant_id, legal_entity_id, business_partner_id,
        relationship_type, status, notes, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000061'::uuid,
     v_tid, v_le_tksa, 'dd002000-0000-0000-0000-000000000001'::uuid,
     'self_bp', 'active',
     'LE-TKSA canonical internal BP. TKSA appears as AR customer (CUS-TKSA) when subsidiaries bill HQ.',
     v_su),

    ('dd002000-0000-0000-0000-000000000062'::uuid,
     v_tid, v_le_ssk, 'dd002000-0000-0000-0000-000000000002'::uuid,
     'self_bp', 'active',
     'LE-SSK canonical internal BP. SSK appears as AP buyer (via SUP-TKSA) when paying HQ management fees.',
     v_su),

    ('dd002000-0000-0000-0000-000000000063'::uuid,
     v_tid, v_le_tegy, 'dd002000-0000-0000-0000-000000000003'::uuid,
     'self_bp', 'active',
     'LE-TEGY canonical internal BP. TEGY appears as AP buyer when paying TKSA and SDTX.',
     v_su),

    ('dd002000-0000-0000-0000-000000000064'::uuid,
     v_tid, v_le_sdtx, 'dd002000-0000-0000-0000-000000000004'::uuid,
     'self_bp', 'active',
     'LE-SDTX canonical internal BP. SDTX appears as AP buyer (TKSA fees) and AR seller (TEGY ICT services).',
     v_su)

    ON CONFLICT (tenant_id, legal_entity_id, business_partner_id, relationship_type) DO NOTHING;

    RAISE NOTICE '[P05] 4 LE→BP self_bp identity links seeded';
END $p05$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P06: COMPANY_CODE_SUPPLIER_PROFILE — AP VIEW                             ║
-- ║                                                                          ║
-- ║  Each buying CC registers the selling CC's BP as an AP supplier.         ║
-- ║                                                                          ║
-- ║  SSK  CC + SUP-TKSA  → SSK  pays TKSA management fees (ICA-2025-001)     ║
-- ║  TEGY CC + SUP-TKSA  → TEGY pays TKSA management fees (ICA-2025-002)     ║
-- ║  SDTX CC + SUP-TKSA  → SDTX pays TKSA IT services    (ICA-2025-003)      ║
-- ║  TEGY CC + SUP-SDTX  → TEGY pays SDTX ICT services   (ICA-2025-004)      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p06$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    -- Company code IDs
    v_cc_tksa uuid; v_cc_ssk  uuid;
    v_cc_tegy uuid; v_cc_sdtx uuid;
    -- Supplier IDs (stable)
    v_sup_tksa uuid := 'dd002000-0000-0000-0000-000000000011';
    v_sup_sdtx uuid := 'dd002000-0000-0000-0000-000000000014';
    -- Accounting profile IDs
    v_ap_std uuid;
    -- Payment terms
    v_pt_net30 uuid;
    v_pm_offset uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    SELECT id INTO v_ap_std   FROM master.accounting_profile WHERE tenant_id = v_tid AND code = 'AP_NON_PO_STANDARD';
    SELECT id INTO v_pt_net30 FROM master.payment_term       WHERE tenant_id = v_tid AND code = 'PT-NET30';
    SELECT id INTO v_pm_offset FROM master.payment_method    WHERE tenant_id = v_tid AND code = 'PM-IC-OFFSET';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    -- SSK CC / SUP-TKSA — SSK pays TKSA management fees
    INSERT INTO master.company_code_supplier_profile (
        id, tenant_id, supplier_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id, payment_method_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000031'::uuid,
     v_tid, v_sup_tksa, v_cc_ssk,
     'SAR', v_ap_std, v_pt_net30, v_pm_offset,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;

    -- TEGY CC / SUP-TKSA — TEGY pays TKSA management fees
    INSERT INTO master.company_code_supplier_profile (
        id, tenant_id, supplier_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id, payment_method_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000032'::uuid,
     v_tid, v_sup_tksa, v_cc_tegy,
     'SAR', v_ap_std, v_pt_net30, v_pm_offset,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;

    -- SDTX CC / SUP-TKSA — SDTX pays TKSA IT services
    INSERT INTO master.company_code_supplier_profile (
        id, tenant_id, supplier_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id, payment_method_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000033'::uuid,
     v_tid, v_sup_tksa, v_cc_sdtx,
     'SAR', v_ap_std, v_pt_net30, v_pm_offset,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;

    -- TEGY CC / SUP-SDTX — TEGY pays SDTX ICT services
    INSERT INTO master.company_code_supplier_profile (
        id, tenant_id, supplier_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id, payment_method_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000034'::uuid,
     v_tid, v_sup_sdtx, v_cc_tegy,
     'EGP', v_ap_std, v_pt_net30, v_pm_offset,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;

    RAISE NOTICE '[P06] 4 company_code_supplier_profile rows seeded for IC AP flows';
END $p06$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P07: COMPANY_CODE_CUSTOMER_PROFILE — AR VIEW                             ║
-- ║                                                                          ║
-- ║  Each selling CC registers the buying CC's BP as an AR customer.         ║
-- ║                                                                          ║
-- ║  TKSA CC + CUS-SSK   → TKSA bills SSK  for management fees               ║
-- ║  TKSA CC + CUS-TEGY  → TKSA bills TEGY for management fees               ║
-- ║  TKSA CC + CUS-SDTX  → TKSA bills SDTX for IT services                   ║
-- ║  SDTX CC + CUS-TEGY  → SDTX bills TEGY for ICT services                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p07$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    -- Company code IDs
    v_cc_tksa uuid; v_cc_sdtx uuid;
    -- Customer IDs (stable)
    v_cus_ssk  uuid := 'dd002000-0000-0000-0000-000000000022';
    v_cus_tegy uuid := 'dd002000-0000-0000-0000-000000000023';
    v_cus_sdtx uuid := 'dd002000-0000-0000-0000-000000000024';
    -- Accounting profile, payment term
    v_ar_std  uuid;
    v_pt_net30 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    SELECT id INTO v_ar_std   FROM master.accounting_profile WHERE tenant_id = v_tid AND code = 'AR_STANDARD';
    SELECT id INTO v_pt_net30 FROM master.payment_term       WHERE tenant_id = v_tid AND code = 'PT-NET30';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    -- TKSA CC / CUS-SSK
    INSERT INTO master.company_code_customer_profile (
        id, tenant_id, customer_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000041'::uuid,
     v_tid, v_cus_ssk, v_cc_tksa,
     'SAR', v_ar_std, v_pt_net30,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;

    -- TKSA CC / CUS-TEGY
    INSERT INTO master.company_code_customer_profile (
        id, tenant_id, customer_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000042'::uuid,
     v_tid, v_cus_tegy, v_cc_tksa,
     'SAR', v_ar_std, v_pt_net30,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;

    -- TKSA CC / CUS-SDTX
    INSERT INTO master.company_code_customer_profile (
        id, tenant_id, customer_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000043'::uuid,
     v_tid, v_cus_sdtx, v_cc_tksa,
     'SAR', v_ar_std, v_pt_net30,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;

    -- SDTX CC / CUS-TEGY
    INSERT INTO master.company_code_customer_profile (
        id, tenant_id, customer_id, company_code_id,
        currency_code,
        default_accounting_profile_id,
        payment_term_id,
        metadata, status, created_by)
    VALUES
    ('dd002000-0000-0000-0000-000000000044'::uuid,
     v_tid, v_cus_tegy, v_cc_sdtx,
     'EGP', v_ar_std, v_pt_net30,
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;

    RAISE NOTICE '[P07] 4 company_code_customer_profile rows seeded for IC AR flows';
END $p07$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P08: INTERCOMPANY TRADING PAIRS                                          ║
-- ║                                                                          ║
-- ║  Directional. source_cc BUYS FROM counterparty_cc.                       ║
-- ║  Profile FKs wired in P09 after profile IDs are confirmed.              ║
-- ║                                                                          ║
-- ║  ICTP-001   SSK  → TKSA  (management fee, ICA-2025-001)                  ║
-- ║  ICTP-002   TEGY → TKSA  (management fee, ICA-2025-002)                  ║
-- ║  ICTP-003   SDTX → TKSA  (IT services,   ICA-2025-003)                   ║
-- ║  ICTP-004   TEGY → SDTX  (ICT services,  ICA-2025-004)                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p08$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk  uuid;
    v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '006_ic_master', 'version', '1.0.0'));

    -- Profile IDs are stable (seeded in P06/P07) so they can be inlined here.
    -- This satisfies trg_ictp_profile_gate which requires counterparty_supplier_profile_id
    -- IS NOT NULL before a pair can be set to status='active'.
    INSERT INTO master.intercompany_trading_pair (
        id, tenant_id,
        source_company_code_id, counterparty_company_code_id,
        counterparty_supplier_profile_id,
        mirror_customer_profile_id,
        requires_agreement,
        auto_create_mirror_transaction, auto_create_mirror_invoice,
        settlement_mode, valid_from, valid_until,
        status, notes, created_by)
    VALUES
    -- ICTP-001: SSK buys management services from TKSA
    ('dd002000-0000-0000-0000-000000000051'::uuid,
     v_tid, v_cc_ssk, v_cc_tksa,
     'dd002000-0000-0000-0000-000000000031',  -- CCSP: SSK CC / SUP-TKSA
     'dd002000-0000-0000-0000-000000000041',  -- CCCP: TKSA CC / CUS-SSK
     true, false, false,
     'open_item', '2025-01-01', NULL,
     'active',
     'SSK pays TKSA group management and shared services fee. Governed by ICA-2025-001.',
     v_su),

    -- ICTP-002: TEGY buys management services from TKSA
    ('dd002000-0000-0000-0000-000000000052'::uuid,
     v_tid, v_cc_tegy, v_cc_tksa,
     'dd002000-0000-0000-0000-000000000032',  -- CCSP: TEGY CC / SUP-TKSA
     'dd002000-0000-0000-0000-000000000042',  -- CCCP: TKSA CC / CUS-TEGY
     true, false, false,
     'open_item', '2025-01-01', NULL,
     'active',
     'TEGY pays TKSA group management and shared services fee. Governed by ICA-2025-002.',
     v_su),

    -- ICTP-003: SDTX buys IT services from TKSA
    ('dd002000-0000-0000-0000-000000000053'::uuid,
     v_tid, v_cc_sdtx, v_cc_tksa,
     'dd002000-0000-0000-0000-000000000033',  -- CCSP: SDTX CC / SUP-TKSA
     'dd002000-0000-0000-0000-000000000043',  -- CCCP: TKSA CC / CUS-SDTX
     true, false, false,
     'open_item', '2025-01-01', NULL,
     'active',
     'SDTX pays TKSA group IT and shared services fee. Governed by ICA-2025-003.',
     v_su),

    -- ICTP-004: TEGY buys ICT services from SDTX
    ('dd002000-0000-0000-0000-000000000054'::uuid,
     v_tid, v_cc_tegy, v_cc_sdtx,
     'dd002000-0000-0000-0000-000000000034',  -- CCSP: TEGY CC / SUP-SDTX
     'dd002000-0000-0000-0000-000000000044',  -- CCCP: SDTX CC / CUS-TEGY
     true, false, false,
     'open_item', '2025-01-01', NULL,
     'active',
     'TEGY pays SDTX for ICT infrastructure and NOC monitoring. Governed by ICA-2025-004.',
     v_su)

    ON CONFLICT (tenant_id, source_company_code_id, counterparty_company_code_id) DO NOTHING;

    RAISE NOTICE '[P08] 4 intercompany_trading_pair rows seeded';
END $p08$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P09: ATTACH SUPPLIER + CUSTOMER PROFILES TO TRADING PAIRS               ║
-- ║                                                                          ║
-- ║  Back-fills the profile FK references after both profiles and pairs      ║
-- ║  exist. Uses stable IDs from P06/P07 so this is safe to re-run.         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p09$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    -- ICTP-001 (SSK → TKSA): counterparty_supplier_profile = CCSP-031, mirror_customer_profile = CCCP-041
    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'dd002000-0000-0000-0000-000000000031',
           mirror_customer_profile_id       = 'dd002000-0000-0000-0000-000000000041'
    WHERE  tenant_id = v_tid AND id = 'dd002000-0000-0000-0000-000000000051'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    -- ICTP-002 (TEGY → TKSA): CCSP-032, CCCP-042
    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'dd002000-0000-0000-0000-000000000032',
           mirror_customer_profile_id       = 'dd002000-0000-0000-0000-000000000042'
    WHERE  tenant_id = v_tid AND id = 'dd002000-0000-0000-0000-000000000052'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    -- ICTP-003 (SDTX → TKSA): CCSP-033, CCCP-043
    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'dd002000-0000-0000-0000-000000000033',
           mirror_customer_profile_id       = 'dd002000-0000-0000-0000-000000000043'
    WHERE  tenant_id = v_tid AND id = 'dd002000-0000-0000-0000-000000000053'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    -- ICTP-004 (TEGY → SDTX): CCSP-034, CCCP-044
    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'dd002000-0000-0000-0000-000000000034',
           mirror_customer_profile_id       = 'dd002000-0000-0000-0000-000000000044'
    WHERE  tenant_id = v_tid AND id = 'dd002000-0000-0000-0000-000000000054'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    RAISE NOTICE '[P09] Trading pair profile FKs wired (4 pairs fully resolved)';
END $p09$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P10: VALIDATION                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p10$
DECLARE
    v_tid             uuid;
    v_ic_cc           int;
    v_internal_bp     int;
    v_ic_suppliers    int;
    v_ic_customers    int;
    v_le_bp_links     int;
    v_ccsp            int;
    v_cccp            int;
    v_trading_pairs   int;
    v_pairs_wired     int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P10] technostat tenant missing'; END IF;

    SELECT count(*) INTO v_ic_cc
        FROM master.company_code WHERE tenant_id = v_tid AND is_intercompany_enabled = true;

    SELECT count(*) INTO v_internal_bp
        FROM master.business_partner WHERE tenant_id = v_tid AND partner_category = 'internal';

    SELECT count(*) INTO v_ic_suppliers
        FROM master.supplier s
        JOIN master.business_partner bp ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
        WHERE s.tenant_id = v_tid AND s.supplier_type = 'intercompany';

    SELECT count(*) INTO v_ic_customers
        FROM master.customer c
        JOIN master.business_partner bp ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
        WHERE c.tenant_id = v_tid AND c.customer_type = 'intercompany';

    SELECT count(*) INTO v_le_bp_links
        FROM master.legal_entity_business_partner_link
        WHERE tenant_id = v_tid AND relationship_type = 'self_bp' AND status = 'active';

    SELECT count(*) INTO v_ccsp
        FROM master.company_code_supplier_profile ccsp
        JOIN master.supplier s ON s.id = ccsp.supplier_id AND s.tenant_id = ccsp.tenant_id
        JOIN master.business_partner bp ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
        WHERE ccsp.tenant_id = v_tid AND bp.partner_category = 'internal';

    SELECT count(*) INTO v_cccp
        FROM master.company_code_customer_profile cccp
        JOIN master.customer c ON c.id = cccp.customer_id AND c.tenant_id = cccp.tenant_id
        JOIN master.business_partner bp ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
        WHERE cccp.tenant_id = v_tid AND bp.partner_category = 'internal';

    SELECT count(*) INTO v_trading_pairs
        FROM master.intercompany_trading_pair WHERE tenant_id = v_tid AND status = 'active';

    SELECT count(*) INTO v_pairs_wired
        FROM master.intercompany_trading_pair
        WHERE tenant_id = v_tid AND status = 'active'
          AND counterparty_supplier_profile_id IS NOT NULL
          AND mirror_customer_profile_id IS NOT NULL;

    -- Assertions
    IF v_ic_cc          < 4 THEN RAISE EXCEPTION '[P10] Expected 4 IC-enabled CCs, got %', v_ic_cc; END IF;
    IF v_internal_bp    < 4 THEN RAISE EXCEPTION '[P10] Expected 4 internal BPs, got %', v_internal_bp; END IF;
    IF v_ic_suppliers   < 4 THEN RAISE EXCEPTION '[P10] Expected 4 IC suppliers, got %', v_ic_suppliers; END IF;
    IF v_ic_customers   < 4 THEN RAISE EXCEPTION '[P10] Expected 4 IC customers, got %', v_ic_customers; END IF;
    IF v_le_bp_links    < 4 THEN RAISE EXCEPTION '[P10] Expected 4 LE→BP self_bp links, got %', v_le_bp_links; END IF;
    IF v_ccsp           < 4 THEN RAISE EXCEPTION '[P10] Expected 4 IC supplier profiles, got %', v_ccsp; END IF;
    IF v_cccp           < 4 THEN RAISE EXCEPTION '[P10] Expected 4 IC customer profiles, got %', v_cccp; END IF;
    IF v_trading_pairs  < 4 THEN RAISE EXCEPTION '[P10] Expected 4 trading pairs, got %', v_trading_pairs; END IF;
    IF v_pairs_wired    < 4 THEN RAISE EXCEPTION '[P10] Expected 4 fully-wired trading pairs, got %', v_pairs_wired; END IF;

    RAISE NOTICE '=== [P10] Technostat Intercompany Master Validated ===';
    RAISE NOTICE '  IC-enabled company codes:          %', v_ic_cc;
    RAISE NOTICE '  Internal business partners:        %', v_internal_bp;
    RAISE NOTICE '  IC supplier roles:                 %', v_ic_suppliers;
    RAISE NOTICE '  IC customer roles:                 %', v_ic_customers;
    RAISE NOTICE '  LE→BP self_bp links:               %', v_le_bp_links;
    RAISE NOTICE '  IC company_code_supplier_profiles: %', v_ccsp;
    RAISE NOTICE '  IC company_code_customer_profiles: %', v_cccp;
    RAISE NOTICE '  Active trading pairs:              %', v_trading_pairs;
    RAISE NOTICE '  Fully-wired trading pairs:         %', v_pairs_wired;
    RAISE NOTICE '  Tenant ID:                         %', v_tid;
END $p10$;
