-- ============================================================================
-- FILE: 040_tenants/010_demo/party_master/004_athq_intercompany.sql
-- Tenant:  athyper (realm: athyper)
-- Purpose: Intercompany master data for 3 Athyper Group entities
--          (ATHQ HQ, AUET UAE Trading, ASAC Saudi Construction).
--
-- IC GROUP FLOWS (BUYER → SELLER direction):
--   ICA-ATH-001   AUET → ATHQ   (AUET pays ATHQ management fee)
--   ICA-ATH-002   ASAC → ATHQ   (ASAC pays ATHQ admin services fee)
--   ICA-ATH-003   ATHQ → AUET   (ATHQ pays AUET for intercompany trading goods)
--   ICA-ATH-004   ATHQ → ASAC   (ATHQ pays ASAC for construction advisory services)
--
-- EXECUTION ORDER:
--   P01  Enable is_intercompany_enabled on ATHQ, AUET, ASAC
--   P02  Internal business partners (partner_category = 'internal', 3 rows)
--   P03  Intercompany supplier roles (supplier_type = 'intercompany', 3 rows)
--   P04  Intercompany customer roles (customer_type = 'intercompany', 3 rows)
--   P05  LE → BP self_bp identity links (3 rows)
--   P06  company_code_supplier_profile — AP view (4 rows)
--   P07  company_code_customer_profile — AR view (4 rows)
--   P08  intercompany_trading_pair — 4 directional routes
--   P09  Back-link: attach profiles to trading pairs
--   P10  App-index refresh for IC suppliers + customers
--   P11  Validation assertions
--
-- STABLE UUID SERIES (aa001xxx prefix — no overlap with technostat dd002xxx):
--   BP:   aa001000-0000-0000-0000-000000000001..0003
--   SUP:  aa001000-0000-0000-0000-000000000011..0013
--   CUS:  aa001000-0000-0000-0000-000000000021..0023
--   CCSP: aa001000-0000-0000-0000-000000000031..0034
--   CCCP: aa001000-0000-0000-0000-000000000041..0044
--   ICTP: aa001000-0000-0000-0000-000000000051..0054
--   LEPL: aa001000-0000-0000-0000-000000000061..0063
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.
-- Depends:    000_tenant.sql (tenant record)
--             100_org_structure/200_demo_legal_entities.sql (ATHQ LE)
--             100_org_structure/201_athyper_subsidiaries.sql (AUET, ASAC LEs)
--             001_athq_supplier_customer.sql (payment terms)
-- ============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P01: ENABLE INTERCOMPANY FLAG ON COMPANY CODES                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p01$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P01] athyper tenant not found'; END IF;

    UPDATE master.company_code
    SET    is_intercompany_enabled = true
    WHERE  tenant_id = v_tid
      AND  code IN ('ATHQ', 'AUET', 'ASAC')
      AND  is_intercompany_enabled = false;

    RAISE NOTICE '[P01] is_intercompany_enabled = true for ATHQ, AUET, ASAC';
END $p01$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P02: INTERNAL BUSINESS PARTNERS                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p02$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    INSERT INTO master.business_partner (
        id, tenant_id, code, name, display_name,
        partner_category, legal_name, legal_form,
        registration_country_code, description,
        metadata, status, created_by
    )
    VALUES
    -- BP-ATHQ — Athyper Group Holdings (as IC counterparty)
    ('aa001000-0000-0000-0000-000000000001'::uuid,
     v_tid, 'BP-ATHQ', 'Athyper Group Holdings', 'Athyper HQ',
     'internal',
     'Athyper Group Holdings LLC',
     'private_limited', 'AE',
     'Internal BP for Athyper Group Holdings (ATHQ). '
     'Used as counterparty in IC AP/AR flows — management fee billing and intercompany settlements.',
     v_meta, 'active', v_su),

    -- BP-AUET — Athyper UAE Trading (as IC counterparty)
    ('aa001000-0000-0000-0000-000000000002'::uuid,
     v_tid, 'BP-AUET', 'Athyper UAE Trading', 'Athyper UAE Trading',
     'internal',
     'Athyper UAE Trading LLC',
     'private_limited', 'AE',
     'Internal BP for Athyper UAE Trading (AUET). '
     'Used as AP supplier when ATHQ buys trading goods, and as AR customer when AUET pays management fees.',
     v_meta, 'active', v_su),

    -- BP-ASAC — Athyper Saudi Construction (as IC counterparty)
    ('aa001000-0000-0000-0000-000000000003'::uuid,
     v_tid, 'BP-ASAC', 'Athyper Saudi Construction', 'Athyper Saudi Const',
     'internal',
     'Athyper Saudi Construction Co. Ltd.',
     'private_limited', 'SA',
     'Internal BP for Athyper Saudi Construction (ASAC). '
     'Used as AP supplier when ATHQ buys construction advisory, and as AR customer when ASAC pays admin fees.',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P02] 3 internal BPs seeded (BP-ATHQ, BP-AUET, BP-ASAC)';
END $p02$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P03: INTERCOMPANY SUPPLIER ROLES                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p03$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
    v_pm_offset uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    -- Ensure IC offset payment method exists
    SELECT id INTO v_pm_offset FROM master.payment_method
     WHERE tenant_id = v_tid AND code = 'PM-IC-OFFSET';
    IF v_pm_offset IS NULL THEN
        INSERT INTO master.payment_method (
            tenant_id, code, name, direction, instrument_mode, status, created_by
        ) VALUES (
            v_tid, 'PM-IC-OFFSET', 'Intercompany Netting / Offset',
            'outbound', 'offset', 'active', v_su
        ) RETURNING id INTO v_pm_offset;
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    INSERT INTO master.supplier (
        id, tenant_id, business_partner_id,
        supplier_code, supplier_type,
        payment_method_id, is_payment_ready,
        metadata, status, created_by
    )
    VALUES
    ('aa001000-0000-0000-0000-000000000011'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000001'::uuid,
     'SUP-ATHQ', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su),

    ('aa001000-0000-0000-0000-000000000012'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000002'::uuid,
     'SUP-AUET', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su),

    ('aa001000-0000-0000-0000-000000000013'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000003'::uuid,
     'SUP-ASAC', 'intercompany',
     v_pm_offset, true, v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, supplier_code) DO NOTHING;

    RAISE NOTICE '[P03] 3 intercompany supplier roles seeded (SUP-ATHQ, SUP-AUET, SUP-ASAC)';
END $p03$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P04: INTERCOMPANY CUSTOMER ROLES                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p04$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    INSERT INTO master.customer (
        id, tenant_id, business_partner_id,
        customer_code, customer_type,
        metadata, status, created_by
    )
    VALUES
    ('aa001000-0000-0000-0000-000000000021'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000001'::uuid,
     'CUS-ATHQ', 'intercompany',
     v_meta, 'active', v_su),

    ('aa001000-0000-0000-0000-000000000022'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000002'::uuid,
     'CUS-AUET', 'intercompany',
     v_meta, 'active', v_su),

    ('aa001000-0000-0000-0000-000000000023'::uuid,
     v_tid, 'aa001000-0000-0000-0000-000000000003'::uuid,
     'CUS-ASAC', 'intercompany',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, customer_code) DO NOTHING;

    RAISE NOTICE '[P04] 3 intercompany customer roles seeded (CUS-ATHQ, CUS-AUET, CUS-ASAC)';
END $p04$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P05: LEGAL ENTITY → BP SELF LINKS                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p05$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_le_athq uuid; v_le_auet uuid; v_le_asac uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    SELECT id INTO v_le_athq FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'ATHQ';
    SELECT id INTO v_le_auet FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'AUET';
    SELECT id INTO v_le_asac FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'ASAC';

    IF v_le_athq IS NOT NULL THEN
        INSERT INTO master.legal_entity_business_partner_link (
            id, tenant_id, legal_entity_id, business_partner_id,
            relationship_type, status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000061'::uuid,
            v_tid, v_le_athq, 'aa001000-0000-0000-0000-000000000001'::uuid,
            'self_bp', 'active',
            'ATHQ canonical internal BP. Appears as AR customer (CUS-ATHQ) when subsidiaries bill HQ.',
            v_su
        ) ON CONFLICT (tenant_id, legal_entity_id, business_partner_id, relationship_type) DO NOTHING;
    END IF;

    IF v_le_auet IS NOT NULL THEN
        INSERT INTO master.legal_entity_business_partner_link (
            id, tenant_id, legal_entity_id, business_partner_id,
            relationship_type, status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000062'::uuid,
            v_tid, v_le_auet, 'aa001000-0000-0000-0000-000000000002'::uuid,
            'self_bp', 'active',
            'AUET canonical internal BP. AUET pays ATHQ management fees (AP buyer, SUP-ATHQ).',
            v_su
        ) ON CONFLICT (tenant_id, legal_entity_id, business_partner_id, relationship_type) DO NOTHING;
    END IF;

    IF v_le_asac IS NOT NULL THEN
        INSERT INTO master.legal_entity_business_partner_link (
            id, tenant_id, legal_entity_id, business_partner_id,
            relationship_type, status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000063'::uuid,
            v_tid, v_le_asac, 'aa001000-0000-0000-0000-000000000003'::uuid,
            'self_bp', 'active',
            'ASAC canonical internal BP. ASAC pays ATHQ admin fees and sells construction advisory to ATHQ.',
            v_su
        ) ON CONFLICT (tenant_id, legal_entity_id, business_partner_id, relationship_type) DO NOTHING;
    END IF;

    RAISE NOTICE '[P05] LE→BP self_bp links seeded (ATHQ, AUET, ASAC)';
END $p05$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P06: COMPANY_CODE_SUPPLIER_PROFILE — AP VIEW (buyer sees seller)         ║
-- ║                                                                           ║
-- ║  CCSP-31: AUET CC + SUP-ATHQ  → AUET buys mgmt services from ATHQ        ║
-- ║  CCSP-32: ASAC CC + SUP-ATHQ  → ASAC buys admin services from ATHQ       ║
-- ║  CCSP-33: ATHQ CC + SUP-AUET  → ATHQ buys trading goods from AUET        ║
-- ║  CCSP-34: ATHQ CC + SUP-ASAC  → ATHQ buys construction advisory from ASAC║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p06$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_athq uuid; v_cc_auet uuid; v_cc_asac uuid;
    v_sup_athq uuid := 'aa001000-0000-0000-0000-000000000011';
    v_sup_auet uuid := 'aa001000-0000-0000-0000-000000000012';
    v_sup_asac uuid := 'aa001000-0000-0000-0000-000000000013';
    v_ap_std   uuid;
    v_pt_net30 uuid;
    v_pm_offset uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    SELECT id INTO v_cc_athq FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ';
    SELECT id INTO v_cc_auet FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUET';
    SELECT id INTO v_cc_asac FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAC';

    SELECT id INTO v_ap_std   FROM master.accounting_profile WHERE tenant_id = v_tid AND code = 'AP_NON_PO_STANDARD';
    SELECT id INTO v_pt_net30 FROM master.payment_term       WHERE tenant_id = v_tid AND code = 'PT-NET30' AND is_current_version = true LIMIT 1;
    SELECT id INTO v_pm_offset FROM master.payment_method    WHERE tenant_id = v_tid AND code = 'PM-IC-OFFSET';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    -- CCSP-31: AUET buys from ATHQ
    IF v_cc_auet IS NOT NULL THEN
        INSERT INTO master.company_code_supplier_profile (
            id, tenant_id, supplier_id, company_code_id,
            currency_code, default_accounting_profile_id,
            payment_term_id, payment_method_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000031'::uuid,
            v_tid, v_sup_athq, v_cc_auet,
            'AED', v_ap_std, v_pt_net30, v_pm_offset,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;
    END IF;

    -- CCSP-32: ASAC buys from ATHQ
    IF v_cc_asac IS NOT NULL THEN
        INSERT INTO master.company_code_supplier_profile (
            id, tenant_id, supplier_id, company_code_id,
            currency_code, default_accounting_profile_id,
            payment_term_id, payment_method_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000032'::uuid,
            v_tid, v_sup_athq, v_cc_asac,
            'SAR', v_ap_std, v_pt_net30, v_pm_offset,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;
    END IF;

    -- CCSP-33: ATHQ buys from AUET
    IF v_cc_athq IS NOT NULL THEN
        INSERT INTO master.company_code_supplier_profile (
            id, tenant_id, supplier_id, company_code_id,
            currency_code, default_accounting_profile_id,
            payment_term_id, payment_method_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000033'::uuid,
            v_tid, v_sup_auet, v_cc_athq,
            'AED', v_ap_std, v_pt_net30, v_pm_offset,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;

        -- CCSP-34: ATHQ buys from ASAC
        INSERT INTO master.company_code_supplier_profile (
            id, tenant_id, supplier_id, company_code_id,
            currency_code, default_accounting_profile_id,
            payment_term_id, payment_method_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000034'::uuid,
            v_tid, v_sup_asac, v_cc_athq,
            'SAR', v_ap_std, v_pt_net30, v_pm_offset,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, supplier_id, company_code_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[P06] CCSP (AP views): AUET/SUP-ATHQ, ASAC/SUP-ATHQ, ATHQ/SUP-AUET, ATHQ/SUP-ASAC';
END $p06$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P07: COMPANY_CODE_CUSTOMER_PROFILE — AR VIEW (seller sees buyer)         ║
-- ║                                                                           ║
-- ║  CCCP-41: ATHQ CC + CUS-AUET  → ATHQ bills AUET (AUET is customer)       ║
-- ║  CCCP-42: ATHQ CC + CUS-ASAC  → ATHQ bills ASAC (ASAC is customer)       ║
-- ║  CCCP-43: AUET CC + CUS-ATHQ  → AUET bills ATHQ (ATHQ is customer)       ║
-- ║  CCCP-44: ASAC CC + CUS-ATHQ  → ASAC bills ATHQ (ATHQ is customer)       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p07$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_athq uuid; v_cc_auet uuid; v_cc_asac uuid;
    v_cus_athq uuid := 'aa001000-0000-0000-0000-000000000021';
    v_cus_auet uuid := 'aa001000-0000-0000-0000-000000000022';
    v_cus_asac uuid := 'aa001000-0000-0000-0000-000000000023';
    v_ar_std   uuid;
    v_pt_net30 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    SELECT id INTO v_cc_athq FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ';
    SELECT id INTO v_cc_auet FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUET';
    SELECT id INTO v_cc_asac FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAC';

    SELECT id INTO v_ar_std   FROM master.accounting_profile WHERE tenant_id = v_tid AND code = 'AR_STANDARD' LIMIT 1;
    SELECT id INTO v_pt_net30 FROM master.payment_term       WHERE tenant_id = v_tid AND code = 'PT-NET30' AND is_current_version = true LIMIT 1;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    -- CCCP-41: ATHQ bills AUET (AUET is the AR customer)
    IF v_cc_athq IS NOT NULL THEN
        INSERT INTO master.company_code_customer_profile (
            id, tenant_id, customer_id, company_code_id,
            currency_code, default_accounting_profile_id, payment_term_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000041'::uuid,
            v_tid, v_cus_auet, v_cc_athq,
            'AED', v_ar_std, v_pt_net30,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;

        -- CCCP-42: ATHQ bills ASAC (ASAC is the AR customer)
        INSERT INTO master.company_code_customer_profile (
            id, tenant_id, customer_id, company_code_id,
            currency_code, default_accounting_profile_id, payment_term_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000042'::uuid,
            v_tid, v_cus_asac, v_cc_athq,
            'SAR', v_ar_std, v_pt_net30,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;
    END IF;

    -- CCCP-43: AUET bills ATHQ (ATHQ is the AR customer)
    IF v_cc_auet IS NOT NULL THEN
        INSERT INTO master.company_code_customer_profile (
            id, tenant_id, customer_id, company_code_id,
            currency_code, default_accounting_profile_id, payment_term_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000043'::uuid,
            v_tid, v_cus_athq, v_cc_auet,
            'AED', v_ar_std, v_pt_net30,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;
    END IF;

    -- CCCP-44: ASAC bills ATHQ (ATHQ is the AR customer)
    IF v_cc_asac IS NOT NULL THEN
        INSERT INTO master.company_code_customer_profile (
            id, tenant_id, customer_id, company_code_id,
            currency_code, default_accounting_profile_id, payment_term_id,
            metadata, status, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000044'::uuid,
            v_tid, v_cus_athq, v_cc_asac,
            'SAR', v_ar_std, v_pt_net30,
            v_meta, 'active', v_su
        ) ON CONFLICT (tenant_id, customer_id, company_code_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[P07] CCCP (AR views): ATHQ/CUS-AUET, ATHQ/CUS-ASAC, AUET/CUS-ATHQ, ASAC/CUS-ATHQ';
END $p07$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P08: INTERCOMPANY TRADING PAIRS                                          ║
-- ║                                                                           ║
-- ║  source_cc BUYS FROM counterparty_cc (source = buyer, counterparty = seller) ║
-- ║                                                                           ║
-- ║  ICTP-A-001: AUET → ATHQ  (AUET pays management fee to ATHQ)             ║
-- ║  ICTP-A-002: ASAC → ATHQ  (ASAC pays admin services fee to ATHQ)         ║
-- ║  ICTP-A-003: ATHQ → AUET  (ATHQ buys intercompany trading goods from AUET)║
-- ║  ICTP-A-004: ATHQ → ASAC  (ATHQ buys construction advisory from ASAC)    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p08$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_athq uuid; v_cc_auet uuid; v_cc_asac uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    SELECT id INTO v_cc_athq FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ';
    SELECT id INTO v_cc_auet FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUET';
    SELECT id INTO v_cc_asac FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAC';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '004_athq_ic', 'version', '1.0.0'));

    -- Stable profile IDs from P06/P07 are inlined.
    -- counterparty_supplier_profile_id = CCSP of the BUYER viewing the SELLER as supplier
    -- mirror_customer_profile_id       = CCCP of the SELLER viewing the BUYER as customer

    -- ICTP-A-001: AUET buys from ATHQ (AUET pays ATHQ management fee — ICA-ATH-001)
    IF v_cc_auet IS NOT NULL AND v_cc_athq IS NOT NULL THEN
        INSERT INTO master.intercompany_trading_pair (
            id, tenant_id,
            source_company_code_id, counterparty_company_code_id,
            counterparty_supplier_profile_id,
            mirror_customer_profile_id,
            requires_agreement, auto_create_mirror_transaction, auto_create_mirror_invoice,
            settlement_mode, valid_from, valid_until,
            status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000051'::uuid,
            v_tid, v_cc_auet, v_cc_athq,
            'aa001000-0000-0000-0000-000000000031',  -- CCSP: AUET CC / SUP-ATHQ
            'aa001000-0000-0000-0000-000000000041',  -- CCCP: ATHQ CC / CUS-AUET
            true, false, false,
            'open_item', '2025-01-01'::date, NULL,
            'active',
            'AUET pays ATHQ Group Management fee. Scope: group services, IT support, HR shared services. Governed by ICA-ATH-001.',
            v_su
        ) ON CONFLICT (tenant_id, source_company_code_id, counterparty_company_code_id) DO NOTHING;
    END IF;

    -- ICTP-A-002: ASAC buys from ATHQ (ASAC pays ATHQ admin services — ICA-ATH-002)
    IF v_cc_asac IS NOT NULL AND v_cc_athq IS NOT NULL THEN
        INSERT INTO master.intercompany_trading_pair (
            id, tenant_id,
            source_company_code_id, counterparty_company_code_id,
            counterparty_supplier_profile_id,
            mirror_customer_profile_id,
            requires_agreement, auto_create_mirror_transaction, auto_create_mirror_invoice,
            settlement_mode, valid_from, valid_until,
            status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000052'::uuid,
            v_tid, v_cc_asac, v_cc_athq,
            'aa001000-0000-0000-0000-000000000032',  -- CCSP: ASAC CC / SUP-ATHQ
            'aa001000-0000-0000-0000-000000000042',  -- CCCP: ATHQ CC / CUS-ASAC
            true, false, false,
            'open_item', '2025-01-01'::date, NULL,
            'active',
            'ASAC pays ATHQ Group admin and shared services allocation. Governed by ICA-ATH-002.',
            v_su
        ) ON CONFLICT (tenant_id, source_company_code_id, counterparty_company_code_id) DO NOTHING;
    END IF;

    -- ICTP-A-003: ATHQ buys from AUET (ATHQ pays AUET for intercompany trading goods — ICA-ATH-003)
    IF v_cc_athq IS NOT NULL AND v_cc_auet IS NOT NULL THEN
        INSERT INTO master.intercompany_trading_pair (
            id, tenant_id,
            source_company_code_id, counterparty_company_code_id,
            counterparty_supplier_profile_id,
            mirror_customer_profile_id,
            requires_agreement, auto_create_mirror_transaction, auto_create_mirror_invoice,
            settlement_mode, valid_from, valid_until,
            status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000053'::uuid,
            v_tid, v_cc_athq, v_cc_auet,
            'aa001000-0000-0000-0000-000000000033',  -- CCSP: ATHQ CC / SUP-AUET
            'aa001000-0000-0000-0000-000000000043',  -- CCCP: AUET CC / CUS-ATHQ
            true, false, false,
            'open_item', '2025-01-01'::date, NULL,
            'active',
            'ATHQ purchases intercompany trading goods from AUET for Group consolidation. Governed by ICA-ATH-003.',
            v_su
        ) ON CONFLICT (tenant_id, source_company_code_id, counterparty_company_code_id) DO NOTHING;
    END IF;

    -- ICTP-A-004: ATHQ buys from ASAC (ATHQ pays ASAC for construction advisory — ICA-ATH-004)
    IF v_cc_athq IS NOT NULL AND v_cc_asac IS NOT NULL THEN
        INSERT INTO master.intercompany_trading_pair (
            id, tenant_id,
            source_company_code_id, counterparty_company_code_id,
            counterparty_supplier_profile_id,
            mirror_customer_profile_id,
            requires_agreement, auto_create_mirror_transaction, auto_create_mirror_invoice,
            settlement_mode, valid_from, valid_until,
            status, notes, created_by
        ) VALUES (
            'aa001000-0000-0000-0000-000000000054'::uuid,
            v_tid, v_cc_athq, v_cc_asac,
            'aa001000-0000-0000-0000-000000000034',  -- CCSP: ATHQ CC / SUP-ASAC
            'aa001000-0000-0000-0000-000000000044',  -- CCCP: ASAC CC / CUS-ATHQ
            true, false, false,
            'open_item', '2025-01-01'::date, NULL,
            'active',
            'ATHQ purchases construction advisory and project management services from ASAC. Governed by ICA-ATH-004.',
            v_su
        ) ON CONFLICT (tenant_id, source_company_code_id, counterparty_company_code_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[P08] 4 intercompany_trading_pair rows seeded (AUET↔ATHQ, ASAC↔ATHQ)';
END $p08$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P09: ATTACH PROFILES TO TRADING PAIRS (idempotent back-fill)            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p09$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'aa001000-0000-0000-0000-000000000031',
           mirror_customer_profile_id       = 'aa001000-0000-0000-0000-000000000041'
    WHERE  tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000051'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'aa001000-0000-0000-0000-000000000032',
           mirror_customer_profile_id       = 'aa001000-0000-0000-0000-000000000042'
    WHERE  tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000052'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'aa001000-0000-0000-0000-000000000033',
           mirror_customer_profile_id       = 'aa001000-0000-0000-0000-000000000043'
    WHERE  tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000053'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    UPDATE master.intercompany_trading_pair
    SET    counterparty_supplier_profile_id = 'aa001000-0000-0000-0000-000000000034',
           mirror_customer_profile_id       = 'aa001000-0000-0000-0000-000000000044'
    WHERE  tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000054'
      AND  (counterparty_supplier_profile_id IS NULL OR mirror_customer_profile_id IS NULL);

    RAISE NOTICE '[P09] Trading pair profile FKs confirmed (4 pairs fully resolved)';
END $p09$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P10: APP INDEX — IC SUPPLIERS + IC CUSTOMERS                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p10$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';

    -- IC suppliers into supplier_app_index
    INSERT INTO master.supplier_app_index (
        id, tenant_id, supplier_id, business_partner_id,
        supplier_code, supplier_type, supplier_status, is_payment_ready,
        business_partner_code, name, display_name, legal_name,
        partner_category, aliases, business_types, search_text, updated_at
    )
    SELECT
        s.id, s.tenant_id, s.id, bp.id,
        s.supplier_code, s.supplier_type, s.status, s.is_payment_ready,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.partner_category, bp.aliases, bp.business_types,
        lower(bp.name || ' ' || s.supplier_code || ' intercompany ic internal'),
        now()
    FROM master.supplier s
    JOIN master.business_partner bp ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
    WHERE s.tenant_id = v_tid AND s.supplier_type = 'intercompany'
    ON CONFLICT (id) DO UPDATE
        SET search_text     = EXCLUDED.search_text,
            supplier_status = EXCLUDED.supplier_status,
            updated_at      = now();

    -- IC customers into customer_app_index
    INSERT INTO master.customer_app_index (
        id, tenant_id, customer_id, business_partner_id,
        customer_code, customer_type, customer_status, is_key_account,
        business_partner_code, name, display_name, legal_name,
        aliases, business_types, search_text, updated_at
    )
    SELECT
        c.id, c.tenant_id, c.id, bp.id,
        c.customer_code, c.customer_type, c.status, c.is_key_account,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.aliases, bp.business_types,
        lower(bp.name || ' ' || c.customer_code || ' intercompany ic internal'),
        now()
    FROM master.customer c
    JOIN master.business_partner bp ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
    WHERE c.tenant_id = v_tid AND c.customer_type = 'intercompany'
    ON CONFLICT (id) DO UPDATE
        SET search_text     = EXCLUDED.search_text,
            customer_status = EXCLUDED.customer_status,
            updated_at      = now();

    RAISE NOTICE '[P10] IC supplier/customer app indexes refreshed';
END $p10$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P11: VALIDATION                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DO $p11$
DECLARE
    v_tid          uuid;
    v_ic_cc        int;
    v_internal_bp  int;
    v_ic_sup       int;
    v_ic_cus       int;
    v_ccsp         int;
    v_cccp         int;
    v_pairs        int;
    v_pairs_wired  int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P11] athyper tenant missing'; END IF;

    SELECT count(*) INTO v_ic_cc      FROM master.company_code      WHERE tenant_id = v_tid AND is_intercompany_enabled = true;
    SELECT count(*) INTO v_internal_bp FROM master.business_partner  WHERE tenant_id = v_tid AND partner_category = 'internal';
    SELECT count(*) INTO v_ic_sup     FROM master.supplier           WHERE tenant_id = v_tid AND supplier_type = 'intercompany';
    SELECT count(*) INTO v_ic_cus     FROM master.customer           WHERE tenant_id = v_tid AND customer_type = 'intercompany';
    SELECT count(*) INTO v_ccsp       FROM master.company_code_supplier_profile
        WHERE tenant_id = v_tid AND supplier_id IN (
            SELECT id FROM master.supplier WHERE tenant_id = v_tid AND supplier_type = 'intercompany'
        );
    SELECT count(*) INTO v_cccp       FROM master.company_code_customer_profile
        WHERE tenant_id = v_tid AND customer_id IN (
            SELECT id FROM master.customer WHERE tenant_id = v_tid AND customer_type = 'intercompany'
        );
    SELECT count(*) INTO v_pairs      FROM master.intercompany_trading_pair WHERE tenant_id = v_tid;
    SELECT count(*) INTO v_pairs_wired FROM master.intercompany_trading_pair
        WHERE tenant_id = v_tid AND counterparty_supplier_profile_id IS NOT NULL
          AND mirror_customer_profile_id IS NOT NULL;

    RAISE NOTICE '[P11] Athyper IC validation: ic_cc=% internal_bp=% ic_sup=% ic_cus=% ccsp=% cccp=% pairs=% wired=%',
        v_ic_cc, v_internal_bp, v_ic_sup, v_ic_cus, v_ccsp, v_cccp, v_pairs, v_pairs_wired;

    IF v_internal_bp < 3 THEN RAISE WARNING '[P11] Expected ≥3 internal BPs, got %', v_internal_bp; END IF;
    IF v_ic_sup      < 3 THEN RAISE WARNING '[P11] Expected ≥3 IC suppliers, got %', v_ic_sup;      END IF;
    IF v_ic_cus      < 3 THEN RAISE WARNING '[P11] Expected ≥3 IC customers, got %', v_ic_cus;      END IF;
    IF v_pairs       < 4 THEN RAISE WARNING '[P11] Expected ≥4 trading pairs, got %', v_pairs;       END IF;
    IF v_pairs_wired < 4 THEN RAISE WARNING '[P11] Expected ≥4 fully wired pairs, got %', v_pairs_wired; END IF;
END $p11$;
