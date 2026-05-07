-- ============================================================================
-- FILE:    040_tenants/020_technostat/010_technostat_bp_advanced_and_risk.sql
-- Tenant:  technostat (019dedac-e40a-7a67-bd35-d34e3e2bf4bf) / Technostat Group
--
-- Scope (extends 007_technostat_bp_supplier_customer_e2e.sql):
--
--   §RSK-CFG   tenant_risk_source_config     — 8 risk sources enabled
--   §IDX       supplier_app_index            — denorm index for 6 suppliers
--              customer_app_index            — denorm index for 6 customers
--   §SUP-SCX   supplier_spend_category       — multi-category bridges (6 sups)
--   §SUP-BLK   supplier_block                — 1 lifted (ANIC) + 1 active (NTP)
--   §CUS-BLK   customer_block                — 1 lifted (STH) + 1 active (SCTC)
--   §CSIP      company_code_supplier_intent_policy
--   §CSSPO     company_code_supplier_spend_policy
--   §CSPO-GL   company_code_supplier_posting_override (ANIC subcontractor GL)
--   §RISK-*    party_risk_evidence / party_risk_assessment /
--              party_risk_dimension_score / party_risk_driver /
--              party_risk_mitigation / party_risk_review_event
--              — one block per external supplier + customer role (12 total)
--
-- Risk summary:
--   AMTS  low  (89) | ANIC  medium (65) | NTP    medium (64) | CSI   low (78)
--   GPS   low  (89) | MGI-S medium (68) | ARD    low    (83) | STH   medium (58)
--   ENI   low  (77) | SCTC  high   (38) | IBH    low    (90) | MGI-C medium (71)
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- Depends:    007_technostat_bp_supplier_customer_e2e.sql
--             010_platform/003_master/002_party_risk_registry.sql
--             020_universal/010_spend_taxonomy/021_business_intents.sql
-- ============================================================================


-- ============================================================================
-- §RSK-CFG  Tenant risk source configuration
-- Enables the 8 platform risk sources for the technostat tenant.
-- Custom trust levels override risk_source.trust_level where required.
-- ============================================================================
DO $rsk_cfg$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[rsk_cfg] technostat tenant not found'; END IF;

    INSERT INTO master.tenant_risk_source_config
        (tenant_id, source_code, is_enabled, custom_trust_level,
         api_config, status, created_by)
    SELECT v_tid, src, enabled, trust_ovr, cfg, 'active', v_sys
    FROM (VALUES
        ('ecovadis',     true,  5, '{"refresh_cadence_months":12,"portal":"ecovadis.com"}'::jsonb),
        ('dun_bradstreet',    true,  5, '{"product":"credit_risk","refresh_cadence_months":6}'::jsonb),
        ('refinitiv_wcc',   true,  5, '{"screening_scope":["entity","directors","ubo"],"frequency":"on_change"}'::jsonb),
        ('ofac_sdn',     true,  5, '{"list_version":"current","auto_block_on_hit":true}'::jsonb),
        ('internal_system',     true,  4, '{}'::jsonb),
        ('manual_review',true,  3, '{}'::jsonb),
        ('supplier_questionnaire', true,  3, '{"template_version":"2025-Q1"}'::jsonb),
        ('customer_questionnaire', true,  3, '{"template_version":"2025-Q1"}'::jsonb)
    ) AS v(src, enabled, trust_ovr, cfg)
    WHERE EXISTS (SELECT 1 FROM master.risk_source WHERE code = v.src)
      AND NOT EXISTS (
        SELECT 1 FROM master.tenant_risk_source_config
         WHERE tenant_id = v_tid AND source_code = v.src);

    RAISE NOTICE '[rsk_cfg] tenant_risk_source_config seeded for technostat';
END $rsk_cfg$;


-- ============================================================================
-- §IDX  Supplier and Customer app indexes
-- Trigger-maintained at runtime; seeded here to bootstrap demo environments
-- where triggers may fire before supplier/customer rows existed in the index.
-- ON CONFLICT (id) DO UPDATE so a re-run refreshes the search_text.
-- ============================================================================
DO $idx$
DECLARE
    v_tid  uuid;
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[idx] technostat tenant not found'; END IF;

    -- supplier_app_index — one row per supplier (id = supplier.id)
    INSERT INTO master.supplier_app_index (
        id, tenant_id, supplier_id, business_partner_id,
        supplier_code, supplier_type, supplier_status, is_payment_ready,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, tax_residence_country_code,
        partner_category, aliases, business_types, search_text, updated_at)
    SELECT
        s.id, s.tenant_id, s.id, bp.id,
        s.supplier_code, s.supplier_type, s.status, s.is_payment_ready,
        bp.code, bp.name, bp.display_name, bp.legal_name, bp.legal_form,
        bp.registration_no, bp.registration_country_code, bp.tax_residence_country_code,
        bp.partner_category, bp.aliases, bp.business_types,
        lower(
            bp.name || ' ' || s.supplier_code || ' ' ||
            COALESCE(bp.display_name, '') || ' ' ||
            COALESCE(bp.legal_name, '') || ' ' ||
            COALESCE(bp.registration_no, '') || ' ' ||
            COALESCE(bp.external_ref, '') || ' ' ||
            COALESCE(array_to_string(bp.aliases::text[], ' '), '')
        ),
        now()
    FROM master.supplier s
    JOIN master.business_partner bp
         ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
    WHERE s.tenant_id = v_tid
    ON CONFLICT (id) DO UPDATE
        SET search_text  = EXCLUDED.search_text,
            supplier_status = EXCLUDED.supplier_status,
            updated_at   = now();

    -- customer_app_index — one row per customer (id = customer.id)
    INSERT INTO master.customer_app_index (
        id, tenant_id, customer_id, business_partner_id,
        customer_code, customer_type, customer_status, is_key_account, risk_rating,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code,
        aliases, business_types, search_text, updated_at)
    SELECT
        c.id, c.tenant_id, c.id, bp.id,
        c.customer_code, c.customer_type, c.status, c.is_key_account, c.risk_rating,
        bp.code, bp.name, bp.display_name, bp.legal_name, bp.legal_form,
        bp.registration_no, bp.registration_country_code,
        bp.aliases, bp.business_types,
        lower(
            bp.name || ' ' || c.customer_code || ' ' ||
            COALESCE(bp.display_name, '') || ' ' ||
            COALESCE(bp.legal_name, '') || ' ' ||
            COALESCE(bp.registration_no, '') || ' ' ||
            COALESCE(bp.external_ref, '') || ' ' ||
            COALESCE(array_to_string(bp.aliases::text[], ' '), '')
        ),
        now()
    FROM master.customer c
    JOIN master.business_partner bp
         ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
    WHERE c.tenant_id = v_tid
    ON CONFLICT (id) DO UPDATE
        SET search_text    = EXCLUDED.search_text,
            customer_status = EXCLUDED.customer_status,
            updated_at     = now();

    RAISE NOTICE '[idx] supplier_app_index + customer_app_index refreshed for technostat';
END $idx$;


-- ============================================================================
-- §SUP-SCX  Supplier spend category bridges
-- Links each supplier to its approved spend categories at the tenant level.
-- is_primary mirrors supplier.spend_category_id (the dominant category).
-- ============================================================================
DO $sup_scx$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;

    -- Supplier IDs
    v_amts uuid; v_anic uuid; v_ntp  uuid; v_csi  uuid;
    v_gps  uuid; v_mgi  uuid;

    -- Spend category IDs (leaf)
    v_sc_it_svc  uuid; v_sc_it_hw   uuid; v_sc_it_sw   uuid;
    v_sc_prof_mg uuid; v_sc_prof_lg uuid;
    v_sc_const_m uuid; v_sc_const_e uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[sup_scx] technostat tenant not found'; END IF;

    -- Supplier lookups
    SELECT id INTO v_amts FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TKSA-AMTS-001';
    SELECT id INTO v_anic FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SSK-ANIC-001';
    SELECT id INTO v_ntp  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';
    SELECT id INTO v_csi  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001';
    SELECT id INTO v_gps  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001';
    SELECT id INTO v_mgi  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-MGI-001';

    -- Spend category lookups
    SELECT id INTO v_sc_it_svc  FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-IT-SVC';
    SELECT id INTO v_sc_it_hw   FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-IT-HW';
    SELECT id INTO v_sc_it_sw   FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-IT-SW';
    SELECT id INTO v_sc_prof_mg FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-PROF-MGMT';
    SELECT id INTO v_sc_prof_lg FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-PROF-LEGAL';
    SELECT id INTO v_sc_const_m FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-CONST-MAT';
    SELECT id INTO v_sc_const_e FROM master.spend_category WHERE tenant_id=v_tid AND code='SC-CONST-EQUIP';

    -- Helper: insert a spend category for a supplier.
    -- is_primary is only claimed when no primary row already exists for that supplier
    -- (guards against sscat_one_primary_uidx when 009 has already assigned a primary).

    -- AMTS: IT Services + IT Hardware
    IF v_amts IS NOT NULL AND v_sc_it_svc IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_amts, v_sc_it_svc,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_amts AND is_primary=true),
               '2023-03-01', 'Primary category — managed IT services and outsourcing.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_amts AND spend_category_id=v_sc_it_svc);
    END IF;
    IF v_amts IS NOT NULL AND v_sc_it_hw IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_amts, v_sc_it_hw, false, '2023-03-01', 'Secondary — hardware supply and infrastructure.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_amts AND spend_category_id=v_sc_it_hw);
    END IF;

    -- ANIC: Construction Materials + Equipment Rental
    IF v_anic IS NOT NULL AND v_sc_const_m IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_anic, v_sc_const_m,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_anic AND is_primary=true),
               '2024-01-10', 'Primary — passive network components and civils materials.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_anic AND spend_category_id=v_sc_const_m);
    END IF;
    IF v_anic IS NOT NULL AND v_sc_const_e IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_anic, v_sc_const_e, false, '2024-01-10', 'Secondary — crane and heavy plant hire for KAEC deployments.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_anic AND spend_category_id=v_sc_const_e);
    END IF;

    -- NTP: IT Services + IT Software
    IF v_ntp IS NOT NULL AND v_sc_it_svc IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_ntp, v_sc_it_svc,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_ntp AND is_primary=true),
               '2023-07-01', 'Primary — digital transformation services for TEGY projects.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_ntp AND spend_category_id=v_sc_it_svc);
    END IF;
    IF v_ntp IS NOT NULL AND v_sc_it_sw IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_ntp, v_sc_it_sw, false, '2023-07-01', 'Secondary — local software and SaaS licences resold.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_ntp AND spend_category_id=v_sc_it_sw);
    END IF;

    -- CSI: IT Services + Management Consulting
    IF v_csi IS NOT NULL AND v_sc_it_svc IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_csi, v_sc_it_svc,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_csi AND is_primary=true),
               '2024-06-01', 'Primary — satellite systems integration for SDTX.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_csi AND spend_category_id=v_sc_it_svc);
    END IF;
    IF v_csi IS NOT NULL AND v_sc_prof_mg IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_csi, v_sc_prof_mg, false, '2024-06-01', 'Secondary — technical consulting and advisory.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_csi AND spend_category_id=v_sc_prof_mg);
    END IF;

    -- GPS: Management Consulting + IT Services + Legal
    IF v_gps IS NOT NULL AND v_sc_prof_mg IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_gps, v_sc_prof_mg,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_gps AND is_primary=true),
               '2022-06-01', 'Primary — global procurement advisory and consulting.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_gps AND spend_category_id=v_sc_prof_mg);
    END IF;
    IF v_gps IS NOT NULL AND v_sc_it_svc IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_gps, v_sc_it_svc, false, '2022-06-01', 'Secondary — technology sourcing and supplier management platforms.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_gps AND spend_category_id=v_sc_it_svc);
    END IF;
    IF v_gps IS NOT NULL AND v_sc_prof_lg IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_gps, v_sc_prof_lg, false, '2022-06-01', 'Tertiary — contract review and regulatory advisory.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_gps AND spend_category_id=v_sc_prof_lg);
    END IF;

    -- MGI supplier: IT Services + Management Consulting
    IF v_mgi IS NOT NULL AND v_sc_it_svc IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_mgi, v_sc_it_svc,
               NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_mgi AND is_primary=true),
               '2021-01-01', 'Primary — satellite comms systems integration and managed services.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_mgi AND spend_category_id=v_sc_it_svc);
    END IF;
    IF v_mgi IS NOT NULL AND v_sc_prof_mg IS NOT NULL THEN
        INSERT INTO master.supplier_spend_category
            (tenant_id, supplier_id, spend_category_id, is_primary, effective_from, notes, metadata, status, created_by)
        SELECT v_tid, v_mgi, v_sc_prof_mg, false, '2021-01-01', 'Secondary — digital transformation consulting across group entities.', v_meta, 'active', v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier_spend_category WHERE tenant_id=v_tid AND supplier_id=v_mgi AND spend_category_id=v_sc_prof_mg);
    END IF;

    RAISE NOTICE '[sup_scx] supplier_spend_category seeded for 6 suppliers';
END $sup_scx$;


-- ============================================================================
-- §SUP-BLK  Supplier blocks
-- Demonstrates two block scenarios:
--   ANIC: Historical payment block (lifted 2024-08-15) — disputed invoice resolved.
--   NTP:  Active invoice block — ETA tax clearance certificate expired.
-- ============================================================================
DO $sup_blk$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;
    v_anic uuid;
    v_ntp  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[sup_blk] technostat tenant not found'; END IF;

    SELECT id INTO v_anic FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SSK-ANIC-001';
    SELECT id INTO v_ntp  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';

    -- ANIC: Lifted payment block (invoice dispute — resolved)
    IF v_anic IS NOT NULL THEN
        INSERT INTO master.supplier_block
            (tenant_id, supplier_id, block_type, block_reason,
             blocked_at, blocked_by, lifted_at, lifted_by, lift_reason,
             notes, metadata, status, created_by)
        SELECT v_tid, v_anic, 'payment',
            'Invoice #SSK-ANIC-2024-0312 disputed. Payment suspended pending credit note issuance.',
            '2024-05-10 10:00+03'::timestamptz, v_sys,
            '2024-08-15 09:00+03'::timestamptz, v_sys,
            'Credit note CN-2024-ANIC-001 (SAR 48,500) accepted by finance. '
            'Invoice dispute resolved. Payment unblocked by CFO approval.',
            'Block lifted after 97 days. Supplier dispute resolution process completed per procurement policy.',
            v_meta, 'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_block
             WHERE tenant_id=v_tid AND supplier_id=v_anic AND block_type='payment'
               AND blocked_at='2024-05-10 10:00+03'::timestamptz);
    END IF;

    -- NTP: Active invoice block (expired tax clearance)
    IF v_ntp IS NOT NULL THEN
        INSERT INTO master.supplier_block
            (tenant_id, supplier_id, block_type, block_reason,
             blocked_at, blocked_by,
             notes, metadata, status, created_by)
        SELECT v_tid, v_ntp, 'invoice',
            'Egyptian Tax Authority clearance certificate expired 2025-03-31. '
            'TEGY tax team requires renewed certificate before new invoices can be posted.',
            '2025-04-01 08:00+02'::timestamptz, v_sys,
            'Automatically flagged by compliance scheduler. Supplier notified by email 2025-04-01. '
            'Renewal certificate expected within 30 days per supplier SLA.',
            v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_block
             WHERE tenant_id=v_tid AND supplier_id=v_ntp AND block_type='invoice'
               AND lifted_at IS NULL);
    END IF;

    RAISE NOTICE '[sup_blk] supplier_block seeded (ANIC lifted, NTP active)';
END $sup_blk$;


-- ============================================================================
-- §CUS-BLK  Customer blocks
-- STH:  Historical credit block (lifted 2024-10-01) — payment dispute settled.
-- SCTC: Active collection hold — KYC re-verification required by compliance.
-- ============================================================================
DO $cus_blk$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;
    v_sth  uuid;
    v_sctc uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[cus_blk] technostat tenant not found'; END IF;

    SELECT id INTO v_sth  FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SSK-STH-001';
    SELECT id INTO v_sctc FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001';

    -- STH: Lifted credit block (overdue balance dispute resolved)
    IF v_sth IS NOT NULL THEN
        INSERT INTO master.customer_block
            (tenant_id, customer_id, block_type, block_reason,
             blocked_at, blocked_by, lifted_at, lifted_by, lift_reason,
             notes, metadata, status, created_by)
        SELECT v_tid, v_sth, 'credit',
            'Outstanding overdue balance SAR 2,340,000 (invoice STH-INV-2024-0087). '
            'Credit facility suspended pending payment or written repayment schedule.',
            '2024-07-22 09:00+03'::timestamptz, v_sys,
            '2024-10-01 10:00+03'::timestamptz, v_sys,
            'Overdue balance cleared. Payment received SAR 2,340,000 on 2024-09-28. '
            'Credit facility reinstated at SAR 20,000,000 per original terms.',
            'Block duration: 71 days. Customer relationship maintained. No change to credit rating.',
            v_meta, 'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_sth AND block_type='credit'
               AND blocked_at='2024-07-22 09:00+03'::timestamptz);
    END IF;

    -- SCTC: Active collection hold (KYC re-verification required)
    IF v_sctc IS NOT NULL THEN
        INSERT INTO master.customer_block
            (tenant_id, customer_id, block_type, block_reason,
             blocked_at, blocked_by,
             notes, metadata, status, created_by)
        SELECT v_tid, v_sctc, 'collection',
            'Annual KYC re-verification overdue. Compliance team requires updated UBO '
            'declarations and beneficial ownership confirmation before collection actions proceed.',
            '2025-02-15 10:00+02'::timestamptz, v_sys,
            'Government-linked entity — enhanced due diligence applies. '
            'SDTX compliance team following up with Suez Canal Authority for documentation.',
            v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_sctc AND block_type='collection'
               AND lifted_at IS NULL);
    END IF;

    RAISE NOTICE '[cus_blk] customer_block seeded (STH lifted, SCTC active)';
END $cus_blk$;


-- ============================================================================
-- §CSIP  Company code supplier intent policies
-- Maps each supplier's company-code profile to the business intents it is
-- approved to service. is_default=true marks the primary booking intent.
-- ============================================================================

-- Helper lifted to a proper function (inline PROCEDURE in DECLARE is not valid PL/pgSQL)
CREATE OR REPLACE FUNCTION _seed_csip_add_intent(
    p_tid uuid, p_meta jsonb, p_sys uuid,
    p_prof uuid, p_code text, p_default boolean,
    p_src bool, p_po bool, p_inv bool
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_bi_id uuid;
BEGIN
    SELECT id INTO v_bi_id FROM master.business_intent WHERE tenant_id=p_tid AND code=p_code;
    IF v_bi_id IS NULL THEN RETURN; END IF;
    INSERT INTO master.company_code_supplier_intent_policy
        (tenant_id, supplier_profile_id, business_intent_id,
         mapping_mode, is_default,
         is_sourcing_allowed, is_po_allowed, is_invoice_allowed,
         metadata, status, created_by)
    SELECT p_tid, p_prof, v_bi_id, 'ALLOW', p_default, p_src, p_po, p_inv, p_meta, 'active', p_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_intent_policy
         WHERE tenant_id=p_tid AND supplier_profile_id=p_prof AND business_intent_id=v_bi_id);
END;
$fn$;

DO $csip$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;
    v_prof uuid;
    prof_rec record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[csip] technostat tenant not found'; END IF;

    -- ── AMTS @ TKSA: IT services + CAPEX IT ─────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-TKSA-AMTS-001' AND cc.code='TKSA';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-IT',    true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-CAPEX-IT',   false, true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-OUTSRC',false, true, true, true);
    END IF;

    -- ── ANIC @ SSK: CAPEX plant + MRO + equipment ───────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-SSK-ANIC-001' AND cc.code='SSK';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-CAPEX-PLANT', true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-CAPEX-EQUIP', false, true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-MRO',    false, true, true, true);
    END IF;

    -- ── NTP @ TEGY: IT OPEX + outsourcing ───────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-TEGY-NTP-001' AND cc.code='TEGY';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-IT',    true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-OUTSRC',false, true, true, true);
    END IF;

    -- ── CSI @ SDTX: IT OPEX + CAPEX IT ─────────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-SDTX-CSI-001' AND cc.code='SDTX';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-OPEX-IT',   true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, v_prof, 'BI-CAPEX-IT',  false, true, true, true);
    END IF;

    -- ── GPS @ all 4 companies: professional + IT + admin ────────────────────
    FOR prof_rec IN
        SELECT p.id AS prof_id, cc.code AS cc_code
        FROM master.company_code_supplier_profile p
        JOIN master.supplier s ON s.id=p.supplier_id
        JOIN master.company_code cc ON cc.id=p.company_code_id
        WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-GLB-GPS-001'
    LOOP
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-OPEX-PROF', true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-OPEX-IT',   false, true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-ADMIN',     false, true, true, true);
    END LOOP;

    -- ── MGI @ all 4 companies: IT + professional ────────────────────────────
    FOR prof_rec IN
        SELECT p.id AS prof_id, cc.code AS cc_code
        FROM master.company_code_supplier_profile p
        JOIN master.supplier s ON s.id=p.supplier_id
        JOIN master.company_code cc ON cc.id=p.company_code_id
        WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-GLB-MGI-001'
    LOOP
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-OPEX-IT',   true,  true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-OPEX-PROF', false, true, true, true);
        PERFORM _seed_csip_add_intent(v_tid, v_meta, v_sys, prof_rec.prof_id, 'BI-CAPEX-IT',  false, true, true, true);
    END LOOP;

    RAISE NOTICE '[csip] company_code_supplier_intent_policy seeded for 6 suppliers';
END $csip$;

DROP FUNCTION IF EXISTS _seed_csip_add_intent(uuid, jsonb, uuid, uuid, text, boolean, boolean, boolean, boolean);


-- ============================================================================
-- §CSSPO  Company code supplier spend policies
-- Per-supplier-profile eligibility for each approved spend category.
-- qualification_status='qualified' = approved to invoice against this category.
-- ============================================================================

CREATE OR REPLACE FUNCTION _seed_csspo_add_spend(
    p_tid uuid, p_meta jsonb, p_sys uuid,
    p_prof uuid, p_sc_code text,
    p_src text, p_qual text, p_po text, p_inv text,
    p_pref boolean, p_max_po numeric, p_ccy text,
    p_note text
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_sc_id uuid;
BEGIN
    SELECT id INTO v_sc_id FROM master.spend_category WHERE tenant_id=p_tid AND code=p_sc_code;
    IF v_sc_id IS NULL THEN RETURN; END IF;
    INSERT INTO master.company_code_supplier_spend_policy
        (tenant_id, supplier_profile_id, spend_category_id,
         mapping_mode, sourcing_status, qualification_status, po_status, invoice_status,
         valid_from, is_preferred_supplier, max_po_amount, max_po_currency_code,
         notes, metadata, status, created_by)
    SELECT p_tid, p_prof, v_sc_id,
           'ALLOW', p_src, p_qual, p_po, p_inv,
           CURRENT_DATE, p_pref, p_max_po, p_ccy,
           p_note, p_meta, 'active', p_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_spend_policy
         WHERE tenant_id=p_tid AND supplier_profile_id=p_prof AND spend_category_id=v_sc_id);
END;
$fn$;

DO $csspo$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;
    v_prof uuid;
    prof_rec record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[csspo] technostat tenant not found'; END IF;

    -- ── AMTS @ TKSA ──────────────────────────────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-TKSA-AMTS-001' AND cc.code='TKSA';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-IT-SVC',  'allowed','qualified','allowed','allowed', true,  5000000,'SAR','Preferred managed-services supplier. Annual frame PO up to SAR 5M.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-IT-HW',   'allowed','qualified','allowed','allowed', false, 2000000,'SAR','Hardware supply — project-based POs.');
    END IF;

    -- ── ANIC @ SSK ───────────────────────────────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-SSK-ANIC-001' AND cc.code='SSK';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-CONST-MAT',  'allowed','qualified','allowed','allowed', false, 3000000,'SAR','Civil works and passive network materials.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-CONST-EQUIP','allowed','qualified','allowed','allowed', false, 1000000,'SAR','Equipment hire — restricted; two-quote minimum required per procurement policy.');
    END IF;

    -- ── NTP @ TEGY ───────────────────────────────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-TEGY-NTP-001' AND cc.code='TEGY';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-IT-SVC', 'allowed','qualified','allowed','allowed', false, 2000000,'EGP','Digital transformation services. PO cap EGP 2M; above requires additional approval.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-IT-SW',  'allowed','pending', 'allowed','allowed', false, 500000, 'EGP','Software resale pending category re-qualification after invoice block lifted.');
    END IF;

    -- ── CSI @ SDTX ───────────────────────────────────────────────────────────
    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-SDTX-CSI-001' AND cc.code='SDTX';
    IF v_prof IS NOT NULL THEN
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-IT-SVC',   'allowed','qualified','allowed','allowed', false, 1500000,'EGP','Satellite systems integration for SDTX projects.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, v_prof, 'SC-PROF-MGMT','allowed','qualified','allowed','allowed', false, 500000, 'EGP','Technical advisory and project management consulting.');
    END IF;

    -- ── GPS @ all 4 companies ────────────────────────────────────────────────
    FOR prof_rec IN
        SELECT p.id AS prof_id, cc.functional_currency AS ccy
        FROM master.company_code_supplier_profile p
        JOIN master.supplier s ON s.id=p.supplier_id
        JOIN master.company_code cc ON cc.id=p.company_code_id
        WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-GLB-GPS-001'
    LOOP
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, prof_rec.prof_id, 'SC-PROF-MGMT', 'allowed','qualified','allowed','allowed', true,  NULL, prof_rec.ccy, 'Preferred global procurement advisory — no PO cap.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, prof_rec.prof_id, 'SC-IT-SVC',    'allowed','qualified','allowed','allowed', false, NULL, prof_rec.ccy, 'Technology sourcing support services.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, prof_rec.prof_id, 'SC-PROF-LEGAL','allowed','qualified','allowed','allowed', false, NULL, prof_rec.ccy, 'Contract and procurement legal advisory.');
    END LOOP;

    -- ── MGI @ all 4 companies ────────────────────────────────────────────────
    FOR prof_rec IN
        SELECT p.id AS prof_id, cc.functional_currency AS ccy
        FROM master.company_code_supplier_profile p
        JOIN master.supplier s ON s.id=p.supplier_id
        JOIN master.company_code cc ON cc.id=p.company_code_id
        WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-GLB-MGI-001'
    LOOP
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, prof_rec.prof_id, 'SC-IT-SVC',    'allowed','qualified','allowed','allowed', false, NULL, prof_rec.ccy, 'Satellite comms and digital transformation services.');
        PERFORM _seed_csspo_add_spend(v_tid, v_meta, v_sys, prof_rec.prof_id, 'SC-PROF-MGMT', 'allowed','qualified','allowed','allowed', false, NULL, prof_rec.ccy, 'Strategic consulting — subject to monthly netting reconciliation.');
    END LOOP;

    RAISE NOTICE '[csspo] company_code_supplier_spend_policy seeded for 6 suppliers';
END $csspo$;

DROP FUNCTION IF EXISTS _seed_csspo_add_spend(uuid, jsonb, uuid, uuid, text, text, text, text, text, boolean, numeric, text, text);


-- ============================================================================
-- §CSPO-GL  Company code supplier posting overrides
-- ANIC @ SSK uses CST-L-AP-SUB (Subcontractor Payables) instead of the
-- standard AP trade payable account to correctly classify network civil works.
-- ============================================================================
DO $cspo_gl$
DECLARE
    v_tid   uuid;
    v_sys   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta  jsonb := '{"_seed":{"pack":"tksa_bp_advanced_v1"}}'::jsonb;
    v_prof  uuid;
    v_gl_sub uuid;
    v_gl_vnd uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[cspo_gl] technostat tenant not found'; END IF;

    SELECT p.id INTO v_prof
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.tenant_id=v_tid AND s.supplier_code='SUP-SSK-ANIC-001' AND cc.code='SSK';

    -- Resolve GL accounts from SSK's COA (COA-SOCPA)
    SELECT a.id INTO v_gl_sub
    FROM master.gl_account a
    JOIN master.chart_of_account c ON c.id = a.chart_of_account_id
    WHERE a.tenant_id=v_tid AND c.code='COA-SOCPA' AND a.code='CST-L-AP-SUB';

    SELECT a.id INTO v_gl_vnd
    FROM master.gl_account a
    JOIN master.chart_of_account c ON c.id = a.chart_of_account_id
    WHERE a.tenant_id=v_tid AND c.code='COA-SOCPA' AND a.code='CST-L-AP-VEND';

    IF v_prof IS NOT NULL AND v_gl_sub IS NOT NULL THEN
        -- Subcontractor posting role override (civil/network contractor classification)
        INSERT INTO master.company_code_supplier_posting_override
            (tenant_id, supplier_profile_id, posting_role_code, gl_account_id, book_code,
             effective_from, reason, metadata, status, created_by)
        SELECT v_tid, v_prof, 'AP_TRADE_PAYABLE', v_gl_sub, 'BOOK-SOCPA',
               '2024-01-10'::date,
               'ANIC classified as subcontractor per KSA VAT regulations. '
               'Passive network infrastructure = construction activity — requires CST-L-AP-SUB '
               'not standard trade payable for WHT withholding calculation.',
               v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.company_code_supplier_posting_override
             WHERE tenant_id=v_tid AND supplier_profile_id=v_prof
               AND posting_role_code='AP_TRADE_PAYABLE' AND book_code='BOOK-SOCPA'
               AND effective_to IS NULL);
    END IF;

    IF v_prof IS NOT NULL AND v_gl_vnd IS NOT NULL THEN
        -- Materials vendor posting (separate from subcontractor services)
        INSERT INTO master.company_code_supplier_posting_override
            (tenant_id, supplier_profile_id, posting_role_code, gl_account_id, book_code,
             effective_from, reason, metadata, status, created_by)
        SELECT v_tid, v_prof, 'AP_MATERIAL_PAYABLE', v_gl_vnd, 'BOOK-SOCPA',
               '2024-01-10'::date,
               'Material invoices (cables, conduit, hardware) posted to CST-L-AP-VEND for '
               'correct inventory/COGS split on ANIC material sub-contracts.',
               v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.company_code_supplier_posting_override
             WHERE tenant_id=v_tid AND supplier_profile_id=v_prof
               AND posting_role_code='AP_MATERIAL_PAYABLE' AND book_code='BOOK-SOCPA'
               AND effective_to IS NULL);
    END IF;

    RAISE NOTICE '[cspo_gl] company_code_supplier_posting_override seeded for ANIC@SSK';
END $cspo_gl$;


-- ============================================================================
-- §RISK-AMTS  Al Madar Technology Solutions — SUP-TKSA-AMTS-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 89 / low risk | EcoVadis Silver 78 | D&B 4A2 | Clear sanctions
-- ============================================================================
DO $risk_amts$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid; v_ev3 uuid;
    v_ds   uuid; -- temp for RETURNING
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-01';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TKSA-AMTS-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_amts] SUP-TKSA-AMTS-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_amts] approved assessment exists — skip'; RETURN;
    END IF;

    -- Evidence
    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'ecovadis','score','EcoVadis Sustainability Rating 2024 — Al Madar Technology Solutions','Silver medal score 78/100. Environment 80, Ethics 84, Labour & Human Rights 72, Sustainable Procurement 76. Improvement plan submitted for L&HR.','2024-08-15',now(),'2024-08-15','2025-08-14',
        '{"score":78,"medal":"silver","percentile":74,"dimensions":{"environment":80,"labor_human_rights":72,"ethics":84,"sustainable_procurement":76}}'::jsonb,92,'active',v_sys,'api',ARRAY['ecovadis','esg','annual'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'dun_bradstreet','score','D&B Credit Report Q1 2025 — Al Madar Technology Solutions','PAYDEX 86/100. Composite risk rating 4A2. Risk class 2 (Low). Stable 12-month financial outlook. No negative payment events recorded.','2025-02-10',now(),'2025-02-10','2026-02-09',
        '{"paydex":86,"rating":"4A2","risk_class":2,"failure_score":92,"delinquency_score":88,"payment_trend":"positive"}'::jsonb,95,'active',v_sys,'api',ARRAY['dnb','credit','financial'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'refinitiv_wcc','alert','Refinitiv World-Check Screening Q1 2025 — Al Madar Technology Solutions','No matches. Entity, 3 directors, and 2 UBO entities screened. OFAC SDN, EU Consolidated, UN, and PEP lists checked.','2025-03-01',now(),'2025-03-01','2025-09-01',
        '{"hits":0,"screening_status":"clear","entities_screened":5,"lists_checked":["OFAC_SDN","EU_CONSOLIDATED","UN","PEP","ADVERSE_MEDIA"]}'::jsonb,98,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep','annual'],v_sys)
    RETURNING id INTO v_ev3;

    -- Assessment
    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',89,'low',false,'approved','2025-03-15 10:00+03'::timestamptz,v_sys,'2025-03-20 14:00+03'::timestamptz,v_sys,'2026-03-15','annually',1,
        'Preferred supplier. Strong overall performance. Minor ESG gap in Labour & Human Rights (score 72) — improvement plan accepted. No sanctions, credit, or compliance concerns.',v_sys)
    RETURNING id INTO v_ass;

    -- Dimension scores
    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',    100,25.0,0.25,'low',   false,0,100,false,'Entity, all directors and UBO clear. OFAC, EU, UN, PEP lists screened March 2025.'),
    (v_tid,v_ass,'compliance',    92,18.4,0.20,'low',   false,0, 95,false,'ZATCA Phase 2 e-invoicing compliant since Jan 2023. ISO 9001 current. No regulatory findings.'),
    (v_tid,v_ass,'esg',           78,15.6,0.20,'low',   false,1, 90,false,'EcoVadis Silver 78/100. Labour & Human Rights at 72 — improvement plan submitted and accepted.'),
    (v_tid,v_ass,'credit',        86,12.9,0.15,'low',   false,0, 88,false,'D&B PAYDEX 86, rating 4A2, risk class 2. Stable 12-month outlook.'),
    (v_tid,v_ass,'operational',   88, 8.8,0.10,'low',   false,0, 80,false,'Established 2012, 500+ employees, multi-site delivery, ISO 45001 certified.'),
    (v_tid,v_ass,'reputational',  84, 8.4,0.10,'low',   false,0, 75,false,'No adverse media. Active Ariba network. Positive TKSA account history since 2018.');

    -- Driver (L&HR gap from EcoVadis)
    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='esg';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev1,'esg','esg_score_low','low',15,false,
        'Labour & Human Rights score below internal threshold (72 < 75)',
        'EcoVadis 2024: L&HR score 72 reflects limited worker representation disclosure '
        'and absence of a formal third-party labour audit. Improvement plan submitted '
        'October 2024; reassessment scheduled Q3 2025.',v_sys);

    -- Review events
    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',       NULL,NULL,   'Assessment created by automated risk engine based on new EcoVadis + D&B evidence.','2025-03-15 10:00+03'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'system','draft','pending_review',NULL,NULL,'Submitted for procurement manager review — all critical evidence complete.','2025-03-17 09:30+03'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. L&HR improvement plan accepted. Annual review scheduled March 2026.','2025-03-20 14:00+03'::timestamptz);

    RAISE NOTICE '[risk_amts] SUP-TKSA-AMTS-001 risk assessment seeded (ass=%, score=89, band=low)', v_ass;
END $risk_amts$;


-- ============================================================================
-- §RISK-ANIC  Arabian Network Infrastructure Co — SUP-SSK-ANIC-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 65 / medium | No ESG policy | ZATCA gap | Operational concentration
-- ============================================================================
DO $risk_anic$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid; v_drv1 uuid; v_drv2 uuid; v_drv3 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-02';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SSK-ANIC-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_anic] SUP-SSK-ANIC-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_anic] approved assessment exists — skip'; RETURN;
    END IF;

    -- Evidence
    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'dun_bradstreet','score','D&B Credit Report Q1 2025 — Arabian Network Infrastructure Co.','PAYDEX 71/100. Composite risk rating 2A3. Risk class 3 (Moderate). One payment delinquency event (Q4 2024) — resolved. Financial size category revised down due to project completion cycle.','2025-01-20',now(),'2025-01-20','2026-01-19',
        '{"paydex":71,"rating":"2A3","risk_class":3,"failure_score":72,"delinquency_score":68,"payment_events":1,"payment_trend":"stable"}'::jsonb,88,'active',v_sys,'api',ARRAY['dnb','credit','financial'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_questionnaire','questionnaire','ANIC Supplier Self-Assessment Questionnaire 2025','ESG policy: None established. ZATCA Phase 2 e-invoicing: Not yet compliant (target Q3 2025). ISO 14001: Not certified. Single project site (KAEC) represents 85% of current revenue.','2025-02-01',now(),'2025-02-01','2026-02-01',
        '{"esg_policy":false,"iso14001":false,"zatca_phase2":false,"zatca_target_date":"2025-09-01","revenue_concentration_pct":85,"primary_site":"KAEC"}'::jsonb,80,'active',v_sys,'workflow',ARRAY['questionnaire','esg','compliance','annual'],v_sys)
    RETURNING id INTO v_ev2;

    -- Assessment
    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',65,'medium',false,'approved','2025-02-28 10:00+03'::timestamptz,v_sys,'2025-03-05 16:00+03'::timestamptz,v_sys,'2025-09-05','quarterly',1,
        'Medium risk. Three material findings: no ESG policy, ZATCA Phase 2 non-compliance, '
        'single-site revenue concentration. Monitoring plan approved. Semi-annual review.',v_sys)
    RETURNING id INTO v_ass;

    -- Dimension scores
    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,25.0,0.25,'low',   false,0,100,false,'Clear. OFAC, EU, UN, PEP lists checked January 2025.'),
    (v_tid,v_ass,'compliance',  58,11.6,0.20,'medium',false,1, 85,false,'ZATCA Phase 2 non-compliant. Target compliance Q3 2025. ISO 9001 current.'),
    (v_tid,v_ass,'esg',         38, 7.6,0.20,'high',  false,1, 60,false,'No ESG policy. No ISO 14001. No ESG reporting. Construction sector — elevated HSE concern.'),
    (v_tid,v_ass,'credit',      60, 9.0,0.15,'medium',false,1, 82,false,'D&B rating 2A3, risk class 3. One delinquency event Q4 2024. Project-cycle cash flow.'),
    (v_tid,v_ass,'operational', 52, 5.2,0.10,'medium',false,1, 70,false,'85% revenue concentration at KAEC site. Single-client dependency risk.'),
    (v_tid,v_ass,'reputational',70, 7.0,0.10,'low',   false,0, 72,false,'No adverse media. Payment dispute (May–Aug 2024) resolved without escalation.');

    -- Drivers
    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='esg';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'esg',NULL,'high',40,false,'No ESG policy or environmental management system',
        'ANIC operates in construction/infrastructure — elevated HSE and environmental exposure. '
        'No ISO 14001, no formal environmental policy, no GHG reporting. '
        'SSK procurement team has issued formal improvement request.',v_sys)
    RETURNING id INTO v_drv1;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='compliance';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'compliance',NULL,'medium',25,false,'ZATCA Phase 2 e-invoicing not yet implemented',
        'ANIC confirmed non-compliance with ZATCA Fatoorah Phase 2 mandate in self-assessment. '
        'Target go-live Q3 2025. Risk: cannot issue compliant e-invoices until live; '
        'SSK must manually record invoices with WHT certificate coordination.',v_sys)
    RETURNING id INTO v_drv2;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='operational';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'operational','strategic_concentration','medium',28,false,'85% revenue concentration at single KAEC project site',
        'ANIC''s current order book is 85% dependent on the King Abdullah Economic City '
        'deployment contract. Contract renewal risk in Q4 2025 could materially affect '
        'supplier viability. Procurement has engaged two alternative contractors.',v_sys)
    RETURNING id INTO v_drv3;

    -- Mitigations
    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by) VALUES
    (v_tid,v_bp,v_ass,v_drv1,'monitoring',
        'ESG Improvement Plan — ANIC 2025',
        'ANIC to submit: (1) Environmental policy document by June 2025, (2) ISO 14001 gap analysis by Sep 2025, (3) Initial HSE incident register by Mar 2025. SSK EHS team to review quarterly.',
        'in_progress','2025-09-30'::date,v_sys,v_sys,'2025-03-05 16:00+03'::timestamptz,v_sys),
    (v_tid,v_bp,v_ass,v_drv2,'corrective_action',
        'ZATCA Phase 2 Compliance — ANIC go-live Q3 2025',
        'ANIC to engage ZATCA-accredited e-invoicing solution provider and achieve Phase 2 '
        'certification by 1 Sep 2025. SSK AP team to continue manual WHT certificate process '
        'until then. Invoice block to be applied if deadline missed.',
        'in_progress','2025-09-01'::date,v_sys,v_sys,'2025-03-05 16:00+03'::timestamptz,v_sys);

    -- Review events
    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Assessment initiated after annual supplier review cycle trigger.','2025-02-28 10:00+03'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted by procurement manager for senior approval — 3 material findings documented.','2025-03-03 11:00+03'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'medium','Approved with conditions. Monitoring plan and corrective actions signed off. Semi-annual review cadence.','2025-03-05 16:00+03'::timestamptz);

    RAISE NOTICE '[risk_anic] SUP-SSK-ANIC-001 risk assessment seeded (ass=%, score=65, band=medium)', v_ass;
END $risk_anic$;


-- ============================================================================
-- §RISK-NTP  Nile Technology Partners — SUP-TEGY-NTP-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 64 / medium | Single-owner concentration | ETA clearance lapsed
-- ============================================================================
DO $risk_ntp$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid; v_drv1 uuid; v_drv2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-01';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_ntp] SUP-TEGY-NTP-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_ntp] approved assessment exists — skip'; RETURN;
    END IF;

    -- Evidence
    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'ecovadis','score','EcoVadis Sustainability Rating 2024 — Nile Technology Partners','Bronze medal score 65/100. Environment 68, Ethics 70, Labour & Human Rights 62, Sustainable Procurement 60. First-time assessment — improvement actions in progress.','2024-10-01',now(),'2024-10-01','2025-10-01',
        '{"score":65,"medal":"bronze","percentile":48,"dimensions":{"environment":68,"labor_human_rights":62,"ethics":70,"sustainable_procurement":60}}'::jsonb,85,'active',v_sys,'api',ARRAY['ecovadis','esg','annual'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_questionnaire','questionnaire','NTP Supplier Self-Assessment 2025','Single-founder ownership (Ahmed El-Masry 100%). ETA tax clearance certificate expired 31 March 2025. No succession plan. Revenue 90% from 3 clients. Gross margin 28%.','2025-03-01',now(),'2025-03-01','2026-03-01',
        '{"founder_ownership_pct":100,"eta_clearance_expired":true,"eta_expiry_date":"2025-03-31","client_concentration_top3_pct":90,"gross_margin_pct":28,"succession_plan":false}'::jsonb,82,'active',v_sys,'workflow',ARRAY['questionnaire','governance','compliance'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',64,'medium',false,'approved','2025-04-10 10:00+02'::timestamptz,v_sys,'2025-04-15 15:00+02'::timestamptz,v_sys,'2025-10-15','quarterly',1,
        'Medium risk. Key concerns: expired ETA tax clearance (invoice block applied 2025-04-01) '
        'and 100% single-founder ownership with no succession plan. Monitoring plan active.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,25.0,0.25,'low',   false,0,100,false,'Clear. OFAC, UN, and Egyptian regulatory watchlist screened.'),
    (v_tid,v_ass,'compliance',  62,12.4,0.20,'medium',false,1, 80,false,'ETA tax clearance expired 31 March 2025. Invoice block active. Renewal in progress.'),
    (v_tid,v_ass,'esg',         65,13.0,0.20,'low',   false,0, 78,false,'EcoVadis Bronze 65/100. First assessment — baseline established.'),
    (v_tid,v_ass,'credit',      45, 6.75,0.15,'medium',false,1, 70,false,'Single-founder concentration. Limited financial disclosure. 3-client revenue dependency.'),
    (v_tid,v_ass,'operational', 40, 4.0,0.10,'medium',false,1, 65,false,'No succession plan. Operational resilience limited for a 70-person firm.'),
    (v_tid,v_ass,'reputational',72, 7.2,0.10,'low',   false,0, 68,false,'No adverse media. Positive project references from TEGY project managers.');

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='compliance';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'compliance',NULL,'high',35,false,'ETA Tax Clearance Certificate expired — invoice block active',
        'Egyptian Tax Authority tax clearance certificate expired 31 March 2025. '
        'Active invoice block applied per TEGY AP policy. Supplier in renewal process; '
        'TEGY tax team supporting documentation. Expected renewal by 30 April 2025.',v_sys)
    RETURNING id INTO v_drv1;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='credit';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'credit','strategic_concentration','medium',28,false,'Single-founder ownership — no succession or continuity plan',
        '100% ownership by founder Ahmed El-Masry. No formal succession plan or key-person '
        'insurance. In the event of incapacity, there is no continuity mechanism. '
        'Procurement to require KPI on succession plan completion by end of 2025.',v_sys)
    RETURNING id INTO v_drv2;

    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by) VALUES
    (v_tid,v_bp,v_ass,v_drv1,'corrective_action','ETA Tax Clearance Renewal — NTP April 2025',
        'NTP to provide renewed ETA clearance certificate by 30 April 2025. Invoice block to be lifted upon receipt and verification by TEGY tax team. Procurement to reschedule pending PO releases.',
        'in_progress','2025-04-30'::date,v_sys,v_sys,'2025-04-15 15:00+02'::timestamptz,v_sys),
    (v_tid,v_bp,v_ass,v_drv2,'monitoring','Key-Person and Succession Plan — NTP 2025',
        'NTP to present succession plan and key-person insurance policy by 31 Dec 2025. '
        'Quarterly check-ins with founder to monitor business continuity posture.',
        'in_progress','2025-12-31'::date,v_sys,v_sys,'2025-04-15 15:00+02'::timestamptz,v_sys);

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Assessment triggered by compliance scheduler — ETA clearance expiry alert.','2025-04-10 10:00+02'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted for approval. Invoice block already applied 2025-04-01.','2025-04-12 09:00+02'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'medium','Approved with conditions. Corrective plan for ETA renewal and succession planning sign-off.','2025-04-15 15:00+02'::timestamptz);

    RAISE NOTICE '[risk_ntp] SUP-TEGY-NTP-001 risk assessment seeded (ass=%, score=64, band=medium)', v_ass;
END $risk_ntp$;


-- ============================================================================
-- §RISK-CSI  Cairo Systems Integration — SUP-SDTX-CSI-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 78 / low | New company — limited data history; strong technical profile
-- ============================================================================
DO $risk_csi$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-02';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_csi] SUP-SDTX-CSI-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_csi] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'refinitiv_wcc','alert','World-Check + OFAC Screening 2025 — Cairo Systems Integration','No sanctions, PEP, or adverse media matches. 3 directors and 2 UBOs screened. Egyptian regulatory lists also checked.','2025-01-15',now(),'2025-01-15','2025-07-15',
        '{"hits":0,"screening_status":"clear","entities_screened":5,"pep_hits":0,"adverse_media_hits":0}'::jsonb,97,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_questionnaire','questionnaire','CSI Supplier Self-Assessment 2025','Founded 2017, 8 years trading. ETA tax clearance valid until Dec 2025. ISO 27001 certified (satellite systems scope). EcoVadis not yet enrolled (< 3 years of ESG reporting history). Audited financial statements available for 2023 and 2024.','2025-02-01',now(),'2025-02-01','2026-02-01',
        '{"founded_year":2017,"eta_clearance_valid":true,"eta_expiry":"2025-12-31","iso27001":true,"ecovadis_enrolled":false,"audited_accounts_years":[2023,2024],"employee_count":45}'::jsonb,82,'active',v_sys,'workflow',ARRAY['questionnaire','compliance','onboarding'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',78,'low',false,'approved','2025-02-15 10:00+02'::timestamptz,v_sys,'2025-02-20 14:00+02'::timestamptz,v_sys,'2026-02-20','annually',1,
        'Low risk. New company (8 years) with strong technical credentials and clean sanctions profile. '
        'Data coverage gap (no EcoVadis) noted — requested for next annual cycle.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,25.0,0.25,'low',false,0,100,false,'Clear. Egyptian regulatory, UN, and OFAC lists checked.'),
    (v_tid,v_ass,'compliance',  85,17.0,0.20,'low',false,0, 88,false,'ETA clearance valid Dec 2025. ISO 27001 certified. ETA VAT registration active.'),
    (v_tid,v_ass,'esg',         55,11.0,0.20,'medium',false,1, 40,true, 'EcoVadis not yet enrolled — data coverage limited. Score estimated from questionnaire responses.'),
    (v_tid,v_ass,'credit',      75,11.25,0.15,'low',false,0, 72,false,'Audited accounts available. Moderate revenue size (EGP 8M ARR). No adverse payment history with SDTX.'),
    (v_tid,v_ass,'operational', 80, 8.0,0.10,'low',false,0, 75,false,'45 employees, satellite engineering expertise, ISO 27001 scope confirms security ops maturity.'),
    (v_tid,v_ass,'reputational',78, 7.8,0.10,'low',false,0, 68,false,'No adverse media. Positive references from SDTX project management team.');

    -- Driver: data quality gap (no EcoVadis)
    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='esg';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'esg','incomplete_governance','low',18,false,'EcoVadis not yet enrolled — ESG score estimated from questionnaire only',
        'CSI has fewer than 3 years of ESG reporting history and is not yet eligible for full '
        'EcoVadis assessment. ESG score estimated from self-assessment questionnaire responses. '
        'EcoVadis enrolment target: Q1 2026.',v_sys);

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Initial onboarding risk assessment — CSI approved as SDTX satellite integration supplier.','2025-02-15 10:00+02'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted. All evidence available; ESG gap documented as low-severity finding.','2025-02-18 09:00+02'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. EcoVadis enrolment requested for 2026 cycle. Annual review.','2025-02-20 14:00+02'::timestamptz);

    RAISE NOTICE '[risk_csi] SUP-SDTX-CSI-001 risk assessment seeded (ass=%, score=78, band=low)', v_ass;
END $risk_csi$;


-- ============================================================================
-- §RISK-GPS  Global Procurement Solutions Ltd — SUP-GLB-GPS-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 89 / low | Top-decile preferred supplier | Gold EcoVadis | D&B 5A1
-- ============================================================================
DO $risk_gps$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid; v_ev3 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-GLB-01';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_gps] SUP-GLB-GPS-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_gps] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'ecovadis','score','EcoVadis Sustainability Rating 2024 — Global Procurement Solutions Ltd','Gold medal score 85/100. Top 10% in Professional Services sector. Strong performance across all four pillars. Labour & Human Rights 88 — Living Wage commitment documented.','2024-06-01',now(),'2024-06-01','2025-06-01',
        '{"score":85,"medal":"gold","percentile":91,"dimensions":{"environment":84,"labor_human_rights":88,"ethics":86,"sustainable_procurement":82}}'::jsonb,95,'active',v_sys,'api',ARRAY['ecovadis','esg','gold','annual'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'dun_bradstreet','score','D&B Credit Report H1 2025 — Global Procurement Solutions Ltd','PAYDEX 94/100. Risk rating 5A1. Risk class 1 (Minimal). 8-year consistent payment performance with no adverse events. Revenue GBP 42M, 500+ employees.','2025-01-10',now(),'2025-01-10','2026-01-09',
        '{"paydex":94,"rating":"5A1","risk_class":1,"failure_score":98,"delinquency_score":96,"payment_trend":"excellent","revenue_gbp_m":42}'::jsonb,97,'active',v_sys,'api',ARRAY['dnb','credit','financial'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'refinitiv_wcc','alert','World-Check + OFAC Screening Q1 2025 — Global Procurement Solutions Ltd','No sanctions, PEP, or adverse media matches. 5 entities screened across UK, EU, OFAC, and UN lists.','2025-02-01',now(),'2025-02-01','2025-08-01',
        '{"hits":0,"screening_status":"clear","entities_screened":5}'::jsonb,99,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev3;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',89,'low',false,'approved','2025-02-10 10:00+00'::timestamptz,v_sys,'2025-02-14 12:00+00'::timestamptz,v_sys,'2026-02-14','annually',1,
        'Top-decile preferred global supplier. Exceptional performance across all dimensions. '
        'No findings. Annual review cadence maintained for governance completeness.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,25.0,0.25,'low',false,0,100,false,'Clear. OFAC, EU, UK, UN, and PEP lists. No adverse media.'),
    (v_tid,v_ass,'compliance',  92,18.4,0.20,'low',false,0, 98,false,'ISO 27001, ISO 9001, and UK Bribery Act compliance program documented. No regulatory events.'),
    (v_tid,v_ass,'esg',         85,17.0,0.20,'low',false,0, 95,false,'EcoVadis Gold 85 — top 10% professional services sector. Living Wage employer.'),
    (v_tid,v_ass,'credit',      94,14.1,0.15,'low',false,0, 97,false,'D&B 5A1, PAYDEX 94. Risk class 1. GBP 42M revenue. Zero adverse payment events.'),
    (v_tid,v_ass,'operational', 88, 8.8,0.10,'low',false,0, 92,false,'500+ employees, 12 offices, ISO 27001 certified. Robust BCP and DR documented.'),
    (v_tid,v_ass,'reputational',88, 8.8,0.10,'low',false,0, 88,false,'Award-winning procurement advisory firm. No adverse media. Active professional memberships.');

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Annual preferred supplier assessment cycle.','2025-02-10 10:00+00'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'system','draft','pending_review',NULL,NULL,'Auto-submitted — all evidence verified, no findings.','2025-02-12 08:00+00'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. No change to risk profile. Global preferred status maintained.','2025-02-14 12:00+00'::timestamptz);

    RAISE NOTICE '[risk_gps] SUP-GLB-GPS-001 risk assessment seeded (ass=%, score=89, band=low)', v_ass;
END $risk_gps$;


-- ============================================================================
-- §RISK-MGI-SUP  Meridian Group International BV — SUP-GLB-MGI-001
-- Context: supplier_role | Model: standard_supplier/1.0
-- Overall: 68 / medium | Dual-role netting complexity | Settlement risk
-- ============================================================================
DO $risk_mgi_sup$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_sup uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid; v_drv1 uuid; v_drv2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='BOTH-GLB-01';
    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-MGI-001';
    IF v_sup IS NULL THEN RAISE WARNING '[risk_mgi_sup] SUP-GLB-MGI-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='supplier' AND subject_id=v_sup AND status='approved') THEN
        RAISE NOTICE '[risk_mgi_sup] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'ecovadis','score','EcoVadis Sustainability Rating 2024 — Meridian Group International BV','Silver medal 72/100. Strong Ethics pillar (82). Environment and Labour pillars at 70. Sustainable Procurement 65 — third-party supplier oversight gaps noted.','2024-09-01',now(),'2024-09-01','2025-09-01',
        '{"score":72,"medal":"silver","percentile":65,"dimensions":{"environment":70,"labor_human_rights":70,"ethics":82,"sustainable_procurement":65}}'::jsonb,90,'active',v_sys,'api',ARRAY['ecovadis','esg','annual'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'internal_system','finding','Internal Dual-Role Assessment 2025 — Meridian Group','Meridian is both a material supplier and a strategic customer of Technostat Group. Monthly intercompany netting applies. Net exposure as of Feb 2025: Technostat payable EUR 340,000. Risk: offset disputes could result in delayed or withheld supplier payments.','2025-02-15',now(),'2025-02-15','2026-02-15',
        '{"dual_role":true,"monthly_netting_active":true,"net_payable_eur":340000,"netting_disputes_12m":1,"netting_dispute_resolved":true}'::jsonb,85,'active',v_sys,'workflow',ARRAY['dual-role','netting','credit','internal'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'supplier',v_sup,v_bp,'supplier_role','standard_supplier','1.0',68,'medium',false,'approved','2025-03-01 10:00+01'::timestamptz,v_sys,'2025-03-10 15:00+01'::timestamptz,v_sys,'2025-09-10','quarterly',1,
        'Medium risk driven by dual-role netting complexity. Credit dimension affected by '
        'off-balance-sheet intercompany exposure. Monitoring plan with quarterly netting '
        'reconciliation review in place. EcoVadis Silver accepted.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,25.0,0.25,'low',   false,0,100,false,'Clear. EU, OFAC, UK, UN, Dutch watchlists checked.'),
    (v_tid,v_ass,'compliance',  78,15.6,0.20,'low',   false,0, 88,false,'Dutch and German regulatory compliance. GDPR compliance documented. No findings.'),
    (v_tid,v_ass,'esg',         72,14.4,0.20,'low',   false,0, 85,false,'EcoVadis Silver 72. Ethics pillar strong at 82. Sustainable procurement gap noted.'),
    (v_tid,v_ass,'credit',      48, 7.2,0.15,'medium',false,1, 80,false,'Dual-role netting creates contingent credit risk. Net payable EUR 340K as of Feb 2025.'),
    (v_tid,v_ass,'operational', 68, 6.8,0.10,'medium',false,1, 75,false,'Intercompany settlement process requires monthly reconciliation; one dispute recorded in 12m.'),
    (v_tid,v_ass,'reputational',76, 7.6,0.10,'low',   false,0, 72,false,'No adverse media. Established European consulting group with strong professional reputation.');

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='credit';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'credit','payment_history_poor','medium',30,false,'Dual-role netting creates contingent supplier payment risk',
        'Meridian is both a supplier (IT consulting) and a customer (satellite services buyer). '
        'Monthly netting reconciliation exposes AP payments to dispute risk if AR balances '
        'are contested. One netting dispute occurred in Q3 2024 (EUR 28,000) — resolved after '
        '45 days. Treasury monitoring with monthly dashboard.',v_sys)
    RETURNING id INTO v_drv1;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='operational';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'operational','strategic_concentration','low',20,false,'Intercompany settlement complexity — dual-role reconciliation overhead',
        'Monthly netting process requires coordination between AP (all 4 company codes) and '
        'AR (Meridian customer account) teams. Operational overhead and error risk elevated '
        'relative to single-role counterparties. Treasury to automate netting by Q3 2025.',v_sys)
    RETURNING id INTO v_drv2;

    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by) VALUES
    (v_tid,v_bp,v_ass,v_drv1,'monitoring','Quarterly Dual-Role Netting Review — Meridian',
        'Treasury to publish monthly netting position dashboard. Quarterly review with Meridian finance '
        'contact to pre-agree netting balances before month-end close. Escalation to CFO if net '
        'payable exceeds EUR 500K.',
        'in_progress','2025-12-31'::date,v_sys,v_sys,'2025-03-10 15:00+01'::timestamptz,v_sys);

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Dual-role assessment — triggered by annual supplier review and treasury netting report.','2025-03-01 10:00+01'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted. Dual-role netting risk documented. EcoVadis Silver accepted.','2025-03-05 11:00+01'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'medium','Approved. Monitoring plan for netting position active. Semi-annual review.','2025-03-10 15:00+01'::timestamptz);

    RAISE NOTICE '[risk_mgi_sup] SUP-GLB-MGI-001 risk assessment seeded (ass=%, score=68, band=medium)', v_ass;
END $risk_mgi_sup$;


-- ============================================================================
-- §RISK-ARD  Al Rajhi Digital Systems Co — CUS-TKSA-ARD-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 83 / low | Al Rajhi Banking Group subsidiary | Strong financials
-- ============================================================================
DO $risk_ard$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-01';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TKSA-ARD-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_ard] CUS-TKSA-ARD-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_ard] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check Screening 2025 — Al Rajhi Digital Systems Co','No sanctions or PEP matches. Al Rajhi Banking Group entities and UBOs screened against OFAC SDN, EU, UN, SAMA watchlists.','2025-01-20',now(),'2025-01-20','2025-07-20',
        '{"hits":0,"screening_status":"clear","entities_screened":6,"lists":["OFAC_SDN","EU","UN","SAMA"]}'::jsonb,98,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'dun_bradstreet','score','D&B Credit Score 2025 — Al Rajhi Digital Systems Co','Exceptional rating backed by Al Rajhi Banking Group. PAYDEX 92. Risk class 1. DSO consistently under 30 days. No payment events.','2025-02-01',now(),'2025-02-01','2026-02-01',
        '{"paydex":92,"risk_class":1,"dso_days":24,"payment_behavior":"excellent","parent_group":"Al Rajhi Banking Group"}'::jsonb,96,'active',v_sys,'api',ARRAY['dnb','credit','annual'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',83,'low',false,'approved','2025-02-15 10:00+03'::timestamptz,v_sys,'2025-02-20 14:00+03'::timestamptz,v_sys,'2026-02-20','annually',1,
        'Low risk strategic customer. Al Rajhi Banking Group subsidiary with strong credit profile. '
        'No payment events. Credit facility SAR 15M confirmed appropriate.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,20.0,0.20,'low',false,0,100,false,'Clear. OFAC, EU, UN, SAMA lists. Al Rajhi parent group regularly screened by SAMA.'),
    (v_tid,v_ass,'credit',      92,27.6,0.30,'low',false,0, 97,false,'D&B PAYDEX 92. DSO 24 days. Banking group parent. No adverse events. Credit limit SAR 15M appropriate.'),
    (v_tid,v_ass,'compliance',  84,12.6,0.15,'low',false,0, 90,false,'SAMA-regulated entity. ZATCA Phase 2 compliant. Saudi Vision 2030 alignment documented.'),
    (v_tid,v_ass,'esg',         74, 7.4,0.10,'low',false,0, 62,false,'ESG data not formally collected. Banking Group publishes sustainability report — indirect coverage.'),
    (v_tid,v_ass,'operational', 82,12.3,0.15,'low',false,0, 85,false,'Subsidiary of major banking group. Stable operations, government-aligned digital contracts.'),
    (v_tid,v_ass,'reputational',86, 8.6,0.10,'low',false,0, 80,false,'No adverse media. High-profile banking group subsidiary with public accountability.');

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Annual customer risk assessment — Al Rajhi Digital.','2025-02-15 10:00+03'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'system','draft','pending_review',NULL,NULL,'Auto-submitted — clean profile, no findings.','2025-02-18 08:00+03'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. Annual review cadence. Credit limit confirmed at SAR 15M.','2025-02-20 14:00+03'::timestamptz);

    RAISE NOTICE '[risk_ard] CUS-TKSA-ARD-001 risk assessment seeded (ass=%, score=83, band=low)', v_ass;
END $risk_ard$;


-- ============================================================================
-- §RISK-STH  Saudi Telecom Holdings — CUS-SSK-STH-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 58 / medium | Invoice dispute history | Credit block lifted Oct 2024
-- ============================================================================
DO $risk_sth$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid; v_drv1 uuid; v_drv2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-02';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SSK-STH-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_sth] CUS-SSK-STH-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_sth] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'internal_system','finding','Internal AR Aging Review Q4 2024 — Saudi Telecom Holdings','Invoice STH-INV-2024-0087 (SAR 2.34M) 71 days overdue at peak. Credit block applied July 2024, lifted October 2024 after full payment. DSO spiked from 35 to 78 days during dispute period.','2024-10-15',now(),'2024-10-15','2025-10-15',
        '{"peak_overdue_days":71,"dispute_amount_sar":2340000,"credit_block_applied":true,"block_lifted":true,"dso_peak":78,"dso_current":42,"payment_received":"2024-09-28"}'::jsonb,92,'active',v_sys,'workflow',ARRAY['ar-aging','credit-block','dispute','internal'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check Screening Q1 2025 — Saudi Telecom Holdings','No sanctions matches. STH and parent entities screened. Note: 2 board members identified as Politically Exposed Persons (PEPs) per SAMA notification — government-affiliated roles confirmed, no adverse finding.','2025-01-20',now(),'2025-01-20','2025-07-20',
        '{"hits":0,"pep_identified":2,"pep_type":"government_affiliated","adverse_finding":false,"screening_status":"clear_with_note"}'::jsonb,90,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',58,'medium',false,'approved','2025-01-25 10:00+03'::timestamptz,v_sys,'2025-01-31 15:00+03'::timestamptz,v_sys,'2025-07-31','quarterly',1,
        'Medium risk following 2024 invoice dispute and credit block. Payment behaviour '
        'improved post-resolution (DSO normalising at 42 days). PEP note documented. '
        'Credit limit maintained at SAR 20M with enhanced monitoring. Semi-annual review.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,20.0,0.20,'low',   false,0,100,false,'Clear. 2 PEPs identified — government-affiliated, no adverse finding per SAMA guidance.'),
    (v_tid,v_ass,'credit',      52,15.6,0.30,'medium',false,1, 90,false,'DSO 42 days (post-dispute normalisation). Credit block lifted Oct 2024. One significant overdue event.'),
    (v_tid,v_ass,'compliance',  72,10.8,0.15,'low',   false,0, 80,false,'SAMA and CMA regulated. No regulatory findings. Government-linked board composition noted.'),
    (v_tid,v_ass,'esg',         60, 6.0,0.10,'medium',false,0, 55,false,'Limited ESG disclosure. STC Group sustainability report partially applicable. No direct assessment.'),
    (v_tid,v_ass,'operational', 62, 9.3,0.15,'medium',false,1, 78,false,'Large telecom group — operational stability good but procurement cycle creates payment variability.'),
    (v_tid,v_ass,'reputational',68, 6.8,0.10,'low',   false,0, 72,false,'No adverse media. Invoice dispute handled professionally. Board PEP status publicly disclosed.');

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='credit';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev1,'credit','payment_history_poor','medium',35,false,'Invoice dispute Q3 2024 — SAR 2.34M overdue 71 days, credit block applied',
        'Invoice STH-INV-2024-0087 disputed over services scope interpretation. SAR 2.34M balance '
        'outstanding for 71 days. Credit block applied July 2024. Payment received in full '
        'September 2024; credit block lifted October 2024. First adverse event in 3-year relationship.',v_sys)
    RETURNING id INTO v_drv1;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='operational';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev1,'operational','strategic_concentration','low',18,false,'Procurement approval cycle causes late-quarter payment concentration',
        'STH internal approval process creates systematic end-of-quarter payment bunching. '
        '68% of annual payments fall in last 2 weeks of each quarter. '
        'SSK AR team has agreed advance payment schedule notification with STH procurement.',v_sys)
    RETURNING id INTO v_drv2;

    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by)
    VALUES (v_tid,v_bp,v_ass,v_drv1,'monitoring','Enhanced AR Monitoring — STH H1 2025',
        'Monthly AR aging review for STH account. 45-day payment alert threshold (down from 60). '
        'SSK CFO notified if DSO exceeds 50 days. Quarterly payment behaviour review with STH Finance Director.',
        'in_progress','2025-07-31'::date,v_sys,v_sys,'2025-01-31 15:00+03'::timestamptz,v_sys);

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Assessment triggered by credit block lifting event and annual review cycle.','2025-01-25 10:00+03'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted. Dispute documented. PEP note included from World-Check screening.','2025-01-28 11:00+03'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'medium','Approved. Medium risk designation. Enhanced monitoring plan signed off. Semi-annual cadence.','2025-01-31 15:00+03'::timestamptz);

    RAISE NOTICE '[risk_sth] CUS-SSK-STH-001 risk assessment seeded (ass=%, score=58, band=medium)', v_ass;
END $risk_sth$;


-- ============================================================================
-- §RISK-ENI  Egyptian National Industries SAE — CUS-TEGY-ENI-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 77 / low | IFC-backed, good governance | Stable industrial customer
-- ============================================================================
DO $risk_eni$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-01';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TEGY-ENI-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_eni] CUS-TEGY-ENI-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_eni] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check Screening 2025 — Egyptian National Industries SAE','No sanctions, PEP, or adverse media matches. IFC, Nasser Industrial Group and directors screened against OFAC, EU, UN, and CBE watchlists.','2025-01-20',now(),'2025-01-20','2025-07-20',
        '{"hits":0,"screening_status":"clear","entities_screened":7,"ifc_shareholder_noted":true}'::jsonb,97,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'dun_bradstreet','score','D&B Credit Report 2025 — Egyptian National Industries SAE','Strong industrial group credit profile. IFC co-investor (World Bank Group) provides institutional discipline. DSO 35 days. No overdue events in 5-year history with Technostat Egypt.','2025-02-01',now(),'2025-02-01','2026-02-01',
        '{"risk_class":2,"dso_days":35,"payment_behavior":"good","ifc_shareholder":true,"overdue_events_5y":0}'::jsonb,90,'active',v_sys,'api',ARRAY['dnb','credit','annual'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',77,'low',false,'approved','2025-02-20 10:00+02'::timestamptz,v_sys,'2025-02-25 14:00+02'::timestamptz,v_sys,'2026-02-25','annually',1,
        'Low risk. IFC co-investor provides strong governance anchor. Good payment history. '
        'Credit limit EGP 20M confirmed appropriate.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,20.0,0.20,'low',false,0,100,false,'Clear. All directors and IFC shareholder screened.'),
    (v_tid,v_ass,'credit',      78,23.4,0.30,'low',false,0, 90,false,'D&B risk class 2. DSO 35 days. IFC co-investor imposes institutional financial discipline. No overdue events.'),
    (v_tid,v_ass,'compliance',  80,12.0,0.15,'low',false,0, 85,false,'ETA and GAFI registered. ISO 9001 and ISO 14001 current. IFC environmental covenants met.'),
    (v_tid,v_ass,'esg',         72, 7.2,0.10,'low',false,0, 75,false,'ISO 14001 certified. IFC Environmental & Social performance standards apply.'),
    (v_tid,v_ass,'operational', 78,11.7,0.15,'low',false,0, 80,false,'Established Egyptian industrial group since 2005. Multiple plant sites. Stable sector.'),
    (v_tid,v_ass,'reputational',74, 7.4,0.10,'low',false,0, 72,false,'No adverse media. Strong community and government relations in Suez industrial corridor.');

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Annual customer risk assessment — ENI.','2025-02-20 10:00+02'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'system','draft','pending_review',NULL,NULL,'Auto-submitted — clean profile, IFC-backed governance.','2025-02-23 08:00+02'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. Annual review. Credit limit EGP 20M confirmed.','2025-02-25 14:00+02'::timestamptz);

    RAISE NOTICE '[risk_eni] CUS-TEGY-ENI-001 risk assessment seeded (ass=%, score=77, band=low)', v_ass;
END $risk_eni$;


-- ============================================================================
-- §RISK-SCTC  Suez Canal Trading Company — CUS-SDTX-SCTC-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 38 / HIGH risk | Government-linked opacity | PEP exposure |
--          KYC overdue | Active collection block
-- ============================================================================
DO $risk_sctc$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid; v_ev3 uuid;
    v_ds   uuid;
    v_drv1 uuid; v_drv2 uuid; v_drv3 uuid; v_drv4 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-02';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_sctc] CUS-SDTX-SCTC-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_sctc] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check Screening Feb 2025 — Suez Canal Trading Company','3 PEP matches identified: Chairman (Egyptian Parliament member), Deputy CEO (Suez Canal Authority appointee), 1 board member (former ministry official). No OFAC SDN or EU sanctions hits. Enhanced due diligence required.','2025-02-01',now(),'2025-02-01','2025-08-01',
        '{"hits":0,"pep_identified":3,"pep_type":"government_officials","sanctions_hits":0,"edd_required":true,"screening_status":"clear_pep_noted"}'::jsonb,88,'active',v_sys,'api',ARRAY['worldcheck','pep','edd','high-risk'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_questionnaire','questionnaire','SCTC Customer KYC Questionnaire 2025 — OVERDUE','Annual KYC questionnaire overdue since 31 January 2025. UBO declaration form not returned. Beneficial ownership structure beyond SCAF (Suez Canal Authority Fund) not confirmed. Company financial statements unavailable — government-linked entity exempt from public disclosure.','2025-02-15',now(),NULL,NULL,
        '{"questionnaire_status":"overdue","ubo_declaration_returned":false,"financial_statements":"not_available","exemption_reason":"government_linked","overdue_since":"2025-01-31"}'::jsonb,60,'active',v_sys,'workflow',ARRAY['kyc','overdue','compliance','high-risk'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'manual_review','finding','SDTX Compliance Officer Manual Review — SCTC Feb 2025','Enhanced due diligence triggered by PEP findings. Historical payment behavior: 3 late payments in 24 months (avg 22 days late). No fraud indicators. Government procurement cycles drive systematic Q4 late payments. DSO 68 days. Collection block applied Feb 2025 pending KYC renewal.','2025-02-15',now(),'2025-02-15','2025-08-15',
        '{"late_payments_24m":3,"avg_days_late":22,"fraud_indicators":false,"dso_days":68,"collection_block_active":true,"edd_completed":true}'::jsonb,85,'active',v_sys,'manual',ARRAY['edd','manual','compliance','high-risk'],v_sys)
    RETURNING id INTO v_ev3;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',38,'high',false,'approved','2025-02-20 10:00+02'::timestamptz,v_sys,'2025-02-28 16:00+02'::timestamptz,v_sys,'2025-05-31','quarterly',1,
        'HIGH RISK. Government-linked entity with 3 PEPs on board. KYC questionnaire overdue — '
        'active collection block applied. UBO structure not confirmed beyond SCAF. '
        'DSO 68 days. Conditional approval: collection block to remain until KYC renewed. '
        'Credit limit EGP 5M (reduced from EGP 8M). Quarterly review.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',   78,15.6,0.20,'low',   false,1, 80,false,'No SDN/sanctions hits. 3 PEPs confirmed — government officials, no adverse finding. EDD completed.'),
    (v_tid,v_ass,'credit',      32, 9.6,0.30,'high',  false,1, 68,false,'DSO 68 days. 3 late payments in 24 months. Financial statements unavailable. Credit limit reduced EGP 5M.'),
    (v_tid,v_ass,'compliance',  28, 4.2,0.15,'high',  false,1, 55,true, 'KYC questionnaire overdue. UBO declaration not returned. Enhanced due diligence required.'),
    (v_tid,v_ass,'esg',         35, 3.5,0.10,'high',  false,0, 30,true, 'No ESG data available. Government-linked entity — exempt from standard disclosure requirements.'),
    (v_tid,v_ass,'operational', 52, 7.8,0.15,'medium',false,1, 62,false,'Active operations in Suez Free Zone. Government-linked budget cycles drive late Q4 payments.'),
    (v_tid,v_ass,'reputational',60, 6.0,0.10,'medium',false,1, 65,false,'State-affiliated entity. PEP composition elevated. No adverse media but limited public transparency.');

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='sanctions';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev1,'sanctions','sanctions_hit_pep','high',30,false,'3 Politically Exposed Persons on board — enhanced due diligence required',
        '3 board members identified as PEPs: Chairman (serving MP), Deputy CEO (SCA appointee), '
        'and 1 former Ministry of Trade official. No sanctions hits. EDD completed February 2025 '
        'found no adverse findings but ongoing monitoring required per CBE guidelines.',v_sys)
    RETURNING id INTO v_drv1;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='compliance';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'compliance',NULL,'high',38,false,'Annual KYC overdue — UBO declaration not returned',
        'KYC questionnaire due 31 January 2025 not returned. UBO structure beyond SCAF (Suez Canal '
        'Authority Fund) not confirmed. Government-linked entity claims exemption from financial '
        'statements disclosure. Active collection block applied per SDTX compliance policy.',v_sys)
    RETURNING id INTO v_drv2;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='credit';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev3,'credit','payment_history_poor','high',35,false,'DSO 68 days with systematic late payment pattern',
        '3 late payment events in 24 months, average 22 days overdue. DSO 68 days — '
        'significantly above SDTX AR policy target of 45 days. Payment delays attributed to '
        'government procurement cycle (budget approval required per EGP 100K). '
        'Credit limit reduced from EGP 8M to EGP 5M.',v_sys)
    RETURNING id INTO v_drv3;

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='reputational';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev3,'reputational',NULL,'low',15,false,'Limited public transparency — government-linked ownership opacity',
        'SCTC is a state-affiliated entity with limited public financial disclosure. '
        'Ownership structure beyond SCAF not publicly available. No adverse media coverage, '
        'but absence of transparency is itself a reputational risk indicator for compliance.',v_sys)
    RETURNING id INTO v_drv4;

    -- Mitigations
    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by) VALUES
    (v_tid,v_bp,v_ass,v_drv2,'corrective_action','KYC Renewal — SCTC March 2025',
        'SCTC to submit completed KYC questionnaire and UBO declaration by 31 March 2025. '
        'Collection block to remain active until received and verified. SDTX Finance Director '
        'engaged Suez Canal Authority legal team directly.',
        'in_progress','2025-03-31'::date,v_sys,v_sys,'2025-02-28 16:00+02'::timestamptz,v_sys),
    (v_tid,v_bp,v_ass,v_drv3,'monitoring','Enhanced AR Monitoring — SCTC Quarterly',
        'Monthly AR aging review. Payment alerts at 30-day overdue (down from 45). '
        'Credit limit capped at EGP 5M until KYC renewed and DSO improves below 50 days. '
        'SDTX CFO to be notified on any new overdue balance above EGP 200K.',
        'in_progress','2025-05-31'::date,v_sys,v_sys,'2025-02-28 16:00+02'::timestamptz,v_sys),
    (v_tid,v_bp,v_ass,v_drv1,'monitoring','PEP Ongoing Monitoring — SCTC',
        'Quarterly World-Check re-screening for all 3 identified PEPs and entity. '
        'EDD file to be maintained and reviewed at each quarterly risk assessment. '
        'Any change in PEP status or sanctions to trigger immediate escalation.',
        'in_progress','2025-05-31'::date,v_sys,v_sys,'2025-02-28 16:00+02'::timestamptz,v_sys);

    -- Review events
    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Assessment triggered by PEP alerts from World-Check screening and overdue KYC notification.','2025-02-20 10:00+02'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted. High risk designation proposed. 4 material findings. EDD completed. Collection block pre-applied.','2025-02-24 09:00+02'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'high','Approved with conditions. High risk band confirmed. Credit limit EGP 5M. Quarterly review. KYC corrective action due 31 Mar 2025.','2025-02-28 16:00+02'::timestamptz),
    (v_tid,v_ass,'scheduled_review',v_sys,'system','approved','approved','high','high','Quarterly scheduled review reminder — KYC renewal status to be confirmed.','2025-05-28 08:00+02'::timestamptz);

    RAISE NOTICE '[risk_sctc] CUS-SDTX-SCTC-001 risk assessment seeded (ass=%, score=38, band=HIGH)', v_ass;
END $risk_sctc$;


-- ============================================================================
-- §RISK-IBH  International Business Holdings Inc — CUS-GLB-IBH-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 90 / low | Strategic global account | US Delaware | Top decile
-- ============================================================================
DO $risk_ibh$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-GLB-01';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-IBH-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_ibh] CUS-GLB-IBH-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_ibh] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check + OFAC Screening Q1 2025 — International Business Holdings Inc','No sanctions, PEP, or adverse media matches. 6 entities screened: IBH entity, 4 directors, and Whitfield Capital Group (UBO). OFAC SDN, EU, UK, UN lists checked.','2025-02-01',now(),'2025-02-01','2025-08-01',
        '{"hits":0,"screening_status":"clear","entities_screened":6}'::jsonb,99,'active',v_sys,'api',ARRAY['worldcheck','sanctions','pep'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'dun_bradstreet','score','D&B Credit Report 2025 — International Business Holdings Inc','Exceptional credit rating. PAYDEX 96. Risk class 1. DSO 27 days consistently over 4-year relationship. Revenue USD 220M+ FY2024. Global account — strategic tier.','2025-01-20',now(),'2025-01-20','2026-01-19',
        '{"paydex":96,"risk_class":1,"dso_days":27,"revenue_usd_m":220,"strategic_account":true,"payment_behavior":"excellent"}'::jsonb,97,'active',v_sys,'api',ARRAY['dnb','credit','strategic','annual'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',90,'low',false,'approved','2025-02-10 10:00+00'::timestamptz,v_sys,'2025-02-14 12:00+00'::timestamptz,v_sys,'2026-02-14','annually',1,
        'Low risk strategic global account. Exceptional credit and payment performance. '
        'No findings across all dimensions. Annual review cadence maintained.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,20.0,0.20,'low',false,0,100,false,'Clear. OFAC, EU, UK, UN lists. All principals screened.'),
    (v_tid,v_ass,'credit',      96,28.8,0.30,'low',false,0, 98,false,'PAYDEX 96. DSO 27 days. USD 220M revenue. Risk class 1. Consistent over 4-year relationship.'),
    (v_tid,v_ass,'compliance',  88,13.2,0.15,'low',false,0, 92,false,'ISO 27001 (2023), ISO 9001 (2022). FCPA and UK Bribery Act compliance program documented.'),
    (v_tid,v_ass,'esg',         82, 8.2,0.10,'low',false,0, 85,false,'Published ESG report. GHG commitments documented. IFC-style ESG framework applied.'),
    (v_tid,v_ass,'operational', 90,13.5,0.15,'low',false,0, 90,false,'Global operations, 500+ employees, multi-continent footprint. Strong BCP.'),
    (v_tid,v_ass,'reputational',92, 9.2,0.10,'low',false,0, 88,false,'Award-winning global firm. No adverse media. Sovereign wealth fund co-investor.');

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Annual strategic account risk assessment — IBH.','2025-02-10 10:00+00'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'system','draft','pending_review',NULL,NULL,'Auto-submitted — excellent profile across all dimensions.','2025-02-12 08:00+00'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'low','Approved. No findings. Strategic account status confirmed. Annual review.','2025-02-14 12:00+00'::timestamptz);

    RAISE NOTICE '[risk_ibh] CUS-GLB-IBH-001 risk assessment seeded (ass=%, score=90, band=low)', v_ass;
END $risk_ibh$;


-- ============================================================================
-- §RISK-MGI-CUS  Meridian Group International BV — CUS-GLB-MGI-001
-- Context: customer_role | Model: standard_customer/1.0
-- Overall: 71 / medium | Dual-role netting complexity | AR/AP settlement overlap
-- ============================================================================
DO $risk_mgi_cus$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid; v_cus uuid; v_ass uuid;
    v_ev1  uuid; v_ev2 uuid;
    v_ds   uuid; v_drv1 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    SELECT id INTO v_bp  FROM master.business_partner WHERE tenant_id=v_tid AND code='BOTH-GLB-01';
    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-MGI-001';
    IF v_cus IS NULL THEN RAISE WARNING '[risk_mgi_cus] CUS-GLB-MGI-001 not found — skip'; RETURN; END IF;
    IF EXISTS (SELECT 1 FROM master.party_risk_assessment WHERE tenant_id=v_tid AND subject_type='customer' AND subject_id=v_cus AND status='approved') THEN
        RAISE NOTICE '[risk_mgi_cus] approved assessment exists — skip'; RETURN;
    END IF;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'refinitiv_wcc','alert','World-Check Screening Q1 2025 — Meridian Group (Customer Role)','No sanctions, PEP, or adverse media matches. Separate screening from supplier role assessment — same entity, different risk context.','2025-02-01',now(),'2025-02-01','2025-08-01',
        '{"hits":0,"screening_status":"clear","role":"customer","shared_with_supplier_assessment":true}'::jsonb,99,'active',v_sys,'api',ARRAY['worldcheck','sanctions','dual-role'],v_sys)
    RETURNING id INTO v_ev1;

    INSERT INTO master.party_risk_evidence (tenant_id,subject_type,subject_id,business_partner_id,source_code,evidence_type,title,summary,evidence_date,received_at,valid_from,valid_until,normalized_payload,confidence_score,status,ingested_by,ingested_via,tags,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'internal_system','finding','Dual-Role AR Assessment 2025 — Meridian Group','Meridian as customer: DSO 48 days (elevated due to netting process timing). Netting agreement allows net receivable to be deducted from AP. One netting dispute Q3 2024 temporarily froze EUR 28K AR collection. Net AR position as of Feb 2025: Technostat receivable EUR 182,000.','2025-02-15',now(),'2025-02-15','2026-02-15',
        '{"dual_role":true,"dso_days":48,"netting_active":true,"net_receivable_eur":182000,"netting_disputes_12m":1,"dispute_amount_eur":28000,"dispute_resolved":true}'::jsonb,85,'active',v_sys,'workflow',ARRAY['dual-role','netting','ar','internal'],v_sys)
    RETURNING id INTO v_ev2;

    INSERT INTO master.party_risk_assessment (tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,is_override,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,review_frequency,version,notes,created_by)
    VALUES (v_tid,'customer',v_cus,v_bp,'customer_role','standard_customer','1.0',71,'medium',false,'approved','2025-03-01 10:00+01'::timestamptz,v_sys,'2025-03-10 15:00+01'::timestamptz,v_sys,'2025-09-10','quarterly',1,
        'Medium risk. Customer credit profile is sound (DSO 48 days) but netting complexity '
        'elevates operational risk. Monthly netting reconciliation monitoring plan shared with '
        'supplier-role assessment. Semi-annual review.',v_sys)
    RETURNING id INTO v_ass;

    INSERT INTO master.party_risk_dimension_score (tenant_id,assessment_id,dimension_code,raw_score,weighted_score,weight_applied,risk_band,knockout_hit,driver_count,coverage_pct,is_incomplete,notes) VALUES
    (v_tid,v_ass,'sanctions',  100,20.0,0.20,'low',   false,0,100,false,'Clear. Same entity as supplier role — no separate exposure.'),
    (v_tid,v_ass,'credit',      68,20.4,0.30,'medium',false,1, 82,false,'DSO 48 days — elevated by netting timing. Net AR EUR 182K. One netting dispute in 12 months.'),
    (v_tid,v_ass,'compliance',  80,12.0,0.15,'low',   false,0, 85,false,'GDPR, Dutch/German regulatory compliance. No adverse regulatory events.'),
    (v_tid,v_ass,'esg',         72, 7.2,0.10,'low',   false,0, 80,false,'EcoVadis Silver 72 — shared with supplier role assessment.'),
    (v_tid,v_ass,'operational', 62, 9.3,0.15,'medium',false,1, 75,false,'Netting reconciliation process creates AR collection timing uncertainty.'),
    (v_tid,v_ass,'reputational',76, 7.6,0.10,'low',   false,0, 72,false,'No adverse media. Established professional consulting group.');

    SELECT id INTO v_ds FROM master.party_risk_dimension_score WHERE assessment_id=v_ass AND dimension_code='credit';
    INSERT INTO master.party_risk_driver (tenant_id,assessment_id,dimension_score_id,evidence_id,dimension_code,driver_code,severity,impact_score,is_knockout,title,description,created_by)
    VALUES (v_tid,v_ass,v_ds,v_ev2,'credit','payment_history_poor','medium',25,false,'Netting agreement creates AR collection timing uncertainty',
        'Monthly AR/AP netting means Technostat cannot collect receivables independently of '
        'the AP netting position. DSO 48 days driven by netting settlement cycle rather than '
        'payment difficulty. One EUR 28K freeze in Q3 2024 during netting dispute. '
        'Treasury to automate monthly netting dashboard by Q3 2025.',v_sys)
    RETURNING id INTO v_drv1;

    INSERT INTO master.party_risk_mitigation (tenant_id,business_partner_id,assessment_id,driver_id,mitigation_type,title,description,status,due_date,assigned_to,approved_by,approved_at,created_by)
    VALUES (v_tid,v_bp,v_ass,v_drv1,'monitoring','Netting Dashboard Automation — Meridian AR/AP',
        'Treasury to implement automated monthly netting position report covering all 4 company codes. '
        'Pre-agreed netting schedule with Meridian finance team by 5th of each month. '
        'DSO target: ≤45 days once automation live.',
        'in_progress','2025-09-30'::date,v_sys,v_sys,'2025-03-10 15:00+01'::timestamptz,v_sys);

    INSERT INTO master.party_risk_review_event (tenant_id,assessment_id,event_type,actor_id,actor_type,prior_status,new_status,prior_risk_band,new_risk_band,comment,created_at) VALUES
    (v_tid,v_ass,'created',  v_sys,'system',NULL,'draft',NULL,NULL,'Annual customer risk assessment — Meridian (customer role, dual-role entity).','2025-03-01 10:00+01'::timestamptz),
    (v_tid,v_ass,'submitted',v_sys,'user','draft','pending_review',NULL,NULL,'Submitted. Netting risk documented. Coordinated with supplier-role assessment.','2025-03-05 11:00+01'::timestamptz),
    (v_tid,v_ass,'approved', v_sys,'user','pending_review','approved',NULL,'medium','Approved. Medium risk. Netting dashboard automation plan sign-off. Semi-annual review.','2025-03-10 15:00+01'::timestamptz);

    RAISE NOTICE '[risk_mgi_cus] CUS-GLB-MGI-001 risk assessment seeded (ass=%, score=71, band=medium)', v_ass;
END $risk_mgi_cus$;
