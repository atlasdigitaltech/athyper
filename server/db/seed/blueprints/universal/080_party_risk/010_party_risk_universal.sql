-- ============================================================================
-- UNIVERSAL PARTY RISK DATASET
-- ============================================================================
-- File:     blueprints/universal/080_party_risk/010_party_risk_universal.sql
-- Schema:   master
-- Purpose:  Comprehensive best-practice risk dataset covering all tenant-scoped
--           risk tables. Seeds 3 supplier profiles (high / medium / low risk),
--           3 customer profiles, governance structure for the high-risk supplier,
--           multi-source evidence records, scored assessments with per-dimension
--           breakdown, individual risk drivers, mitigations, and a full review-
--           event audit trail.
-- Prereqs:  002_party_risk_registry.sql (risk_dimension / risk_driver_registry /
--           risk_source / risk_model / risk_model_dimension must exist).
--           Tenant must exist.  app.seed_tenant_id must be set.
-- Run:      SET app.seed_tenant_id = '<tenant-uuid>'; \i this_file.sql
-- Idempotent: yes — ON CONFLICT DO NOTHING / DO UPDATE guards throughout.
-- Tables:   master.tenant_risk_source_config
--           master.business_partner
--           master.party_governance_relation
--           master.party_risk_evidence
--           master.party_risk_assessment
--           master.party_risk_dimension_score
--           master.party_risk_driver
--           master.party_risk_mitigation
--           master.party_risk_review_event
-- ============================================================================

DO $seed$
DECLARE
    -- ── context ──────────────────────────────────────────────────────────────
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_pack  text := 'party_risk_universal';
    v_ver   text := '1.0.0';
    v_meta  jsonb;

    -- ── business partner ids ─────────────────────────────────────────────────
    v_bp_sup_hi  uuid;   -- Apex Industrial Supplies LLC  (high-risk supplier)
    v_bp_sup_me  uuid;   -- Meridian Tech Solutions FZE   (medium-risk supplier)
    v_bp_sup_lo  uuid;   -- BlueStar Logistics Group      (low-risk supplier)
    v_bp_cus_hi  uuid;   -- Al-Rashid Trading Co.         (high-risk customer)
    v_bp_cus_me  uuid;   -- Falcon Retail Chains LLC      (medium-risk customer)
    v_bp_cus_lo  uuid;   -- Emirates Global Finance Ltd   (low-risk customer)

    -- ── supplier / customer role ids ─────────────────────────────────────────
    v_sup_hi  uuid;   -- master.supplier row for Apex Industrial
    v_sup_me  uuid;   -- master.supplier row for Meridian Tech
    v_sup_lo  uuid;   -- master.supplier row for BlueStar
    v_cus_hi  uuid;   -- master.customer row for Al-Rashid Trading
    v_cus_me  uuid;   -- master.customer row for Falcon Retail
    v_cus_lo  uuid;   -- master.customer row for Emirates Global Finance

    -- ── evidence ids ─────────────────────────────────────────────────────────
    v_evid_sup_hi_dnb      uuid;
    v_evid_sup_hi_wcc      uuid;
    v_evid_sup_hi_eco      uuid;
    v_evid_sup_hi_qst      uuid;
    v_evid_sup_hi_int      uuid;
    v_evid_sup_me_dnb      uuid;
    v_evid_sup_me_wcc      uuid;
    v_evid_sup_me_qst      uuid;
    v_evid_sup_lo_dnb      uuid;
    v_evid_sup_lo_wcc      uuid;
    v_evid_sup_lo_eco      uuid;
    v_evid_cus_hi_dnb      uuid;
    v_evid_cus_hi_wcc      uuid;
    v_evid_cus_me_dnb      uuid;
    v_evid_cus_lo_dnb      uuid;
    v_evid_cus_lo_wcc      uuid;

    -- ── assessment ids ───────────────────────────────────────────────────────
    v_asmnt_sup_hi  uuid;
    v_asmnt_sup_me  uuid;
    v_asmnt_sup_lo  uuid;
    v_asmnt_cus_hi  uuid;
    v_asmnt_cus_me  uuid;
    v_asmnt_cus_lo  uuid;

    -- ── dimension-score ids (assessment × dimension) ─────────────────────────
    -- supplier hi
    v_ds_shi_san  uuid;  v_ds_shi_cmp  uuid;  v_ds_shi_crd  uuid;
    v_ds_shi_ops  uuid;  v_ds_shi_esg  uuid;  v_ds_shi_rep  uuid;
    v_ds_shi_dq   uuid;
    -- supplier me
    v_ds_sme_san  uuid;  v_ds_sme_cmp  uuid;  v_ds_sme_crd  uuid;
    v_ds_sme_ops  uuid;  v_ds_sme_esg  uuid;  v_ds_sme_rep  uuid;
    v_ds_sme_dq   uuid;
    -- supplier lo
    v_ds_slo_san  uuid;  v_ds_slo_cmp  uuid;  v_ds_slo_crd  uuid;
    v_ds_slo_ops  uuid;  v_ds_slo_esg  uuid;  v_ds_slo_rep  uuid;
    v_ds_slo_dq   uuid;
    -- customer hi
    v_ds_chi_san  uuid;  v_ds_chi_crd  uuid;  v_ds_chi_cmp  uuid;
    v_ds_chi_rep  uuid;  v_ds_chi_dq   uuid;
    -- customer me
    v_ds_cme_san  uuid;  v_ds_cme_crd  uuid;  v_ds_cme_cmp  uuid;
    v_ds_cme_rep  uuid;  v_ds_cme_dq   uuid;
    -- customer lo
    v_ds_clo_san  uuid;  v_ds_clo_crd  uuid;  v_ds_clo_cmp  uuid;
    v_ds_clo_rep  uuid;  v_ds_clo_dq   uuid;

    -- ── driver ids ───────────────────────────────────────────────────────────
    v_drv_shi_1  uuid;  v_drv_shi_2  uuid;  v_drv_shi_3  uuid;
    v_drv_shi_4  uuid;  v_drv_shi_5  uuid;  v_drv_shi_6  uuid;
    v_drv_sme_1  uuid;  v_drv_sme_2  uuid;  v_drv_sme_3  uuid;
    v_drv_sme_4  uuid;
    v_drv_slo_1  uuid;
    v_drv_chi_1  uuid;  v_drv_chi_2  uuid;  v_drv_chi_3  uuid;
    v_drv_cme_1  uuid;  v_drv_cme_2  uuid;
    v_drv_clo_1  uuid;

BEGIN
    -- ── resolve tenant ────────────────────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[%] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''', v_pack;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid) THEN
        RAISE EXCEPTION '[%] No tenant row for id=%', v_pack, v_tid;
    END IF;

    v_meta := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_ver, 'seeded_at', now()::text
        )
    );

    RAISE NOTICE '[%] Starting for tenant=%', v_pack, v_tid;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §1  tenant_risk_source_config — enable all platform risk sources
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.tenant_risk_source_config
        (tenant_id, source_code, is_enabled, custom_trust_level, api_config, status, created_by)
    SELECT
        v_tid, rs.code,
        true,
        NULL,
        CASE rs.code
            WHEN 'ecovadis'               THEN '{"endpoint":"https://api.ecovadis.com/v2","auth_scheme":"oauth2"}'::jsonb
            WHEN 'dun_bradstreet'         THEN '{"endpoint":"https://plus.dnb.com/v1","auth_scheme":"api_key"}'::jsonb
            WHEN 'refinitiv_wcc'          THEN '{"endpoint":"https://api.refinitiv.com/user-framework/mobile/v1","auth_scheme":"oauth2"}'::jsonb
            WHEN 'ofac_sdn'               THEN '{"list_url":"https://www.treasury.gov/ofac/downloads/sdn.xml","refresh_cron":"0 3 * * *"}'::jsonb
            ELSE NULL
        END,
        'active',
        v_su
    FROM master.risk_source rs
    ON CONFLICT (tenant_id, source_code) DO UPDATE
        SET is_enabled = true,
            status     = 'active',
            updated_at = now(),
            updated_by = v_su
        WHERE master.tenant_risk_source_config.is_enabled IS DISTINCT FROM true;

    RAISE NOTICE '[%] §1 tenant_risk_source_config: enabled all sources', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §2  business_partner — 6 demo BPs (3 suppliers, 3 customers)
    -- ══════════════════════════════════════════════════════════════════════════

    -- §2a  High-risk supplier: Apex Industrial Supplies LLC (UAE, high-risk jurisdiction)
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-SUP-HI-001', 'Apex Industrial Supplies LLC', 'Apex Industrial',
        'organization', 'Apex Industrial Supplies LLC', 'limited_liability',
        'CN-2015-00412', 'AE', 'AE',
        ARRAY['supplier','manufacturer','trader'],
        2015, '51_200', '5m_25m',
        'Industrial supplies and raw materials distributor with operations across GCC and South Asia. Flagged for sanctions watch-list proximity and labour compliance issues.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_sup_hi;

    IF v_bp_sup_hi IS NULL THEN
        SELECT id INTO v_bp_sup_hi FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-SUP-HI-001';
    END IF;

    -- §2b  Medium-risk supplier: Meridian Tech Solutions FZE
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-SUP-ME-001', 'Meridian Tech Solutions FZE', 'Meridian Tech',
        'organization', 'Meridian Tech Solutions Free Zone Establishment', 'fze',
        'FZ-2018-07734', 'AE', 'AE',
        ARRAY['supplier','technology','services'],
        2018, '11_50', '1m_5m',
        'IT services and software solutions provider in DIFC. Moderate delivery performance and ESG documentation gaps.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_sup_me;

    IF v_bp_sup_me IS NULL THEN
        SELECT id INTO v_bp_sup_me FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-SUP-ME-001';
    END IF;

    -- §2c  Low-risk supplier: BlueStar Logistics Group (Germany, highly rated)
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-SUP-LO-001', 'BlueStar Logistics Group', 'BlueStar Logistics',
        'organization', 'BlueStar Logistics Group GmbH', 'gmbh',
        'HRB-2002-88321', 'DE', 'DE',
        ARRAY['supplier','logistics','freight'],
        2002, '201_1000', '50m_200m',
        'Multi-modal logistics group with EcoVadis Platinum rating, S&P A- credit, DHL supply-chain partnership. Zero adverse findings across all screenings.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_sup_lo;

    IF v_bp_sup_lo IS NULL THEN
        SELECT id INTO v_bp_sup_lo FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-SUP-LO-001';
    END IF;

    -- §2d  High-risk customer: Al-Rashid Trading Co.
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-CUS-HI-001', 'Al-Rashid Trading Co.', 'Al-Rashid Trading',
        'organization', 'Al-Rashid Trading Co. LLC', 'limited_liability',
        'CR-2010-55890', 'AE', 'AE',
        ARRAY['customer','trading','distribution'],
        2010, '11_50', '500k_1m',
        'General trading company with poor payment history and D&B PAYDEX score of 42. Multiple overdue invoices. Missing tax ID registration.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_cus_hi;

    IF v_bp_cus_hi IS NULL THEN
        SELECT id INTO v_bp_cus_hi FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-CUS-HI-001';
    END IF;

    -- §2e  Medium-risk customer: Falcon Retail Chains LLC
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-CUS-ME-001', 'Falcon Retail Chains LLC', 'Falcon Retail',
        'organization', 'Falcon Retail Chains LLC', 'limited_liability',
        'CR-2014-22177', 'AE', 'AE',
        ARRAY['customer','retail','fmcg'],
        2014, '201_1000', '25m_50m',
        'Multi-outlet retail chain with moderate credit risk. Payment delays of 30–45 days in H2 2025. Compliance documentation partially complete.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_cus_me;

    IF v_bp_cus_me IS NULL THEN
        SELECT id INTO v_bp_cus_me FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-CUS-ME-001';
    END IF;

    -- §2f  Low-risk customer: Emirates Global Finance Ltd
    INSERT INTO master.business_partner
        (tenant_id, code, name, display_name, partner_category, legal_name, legal_form,
         registration_no, registration_country_code, tax_residence_country_code,
         business_types, founded_year, employee_count_band, annual_revenue_band,
         description, status, metadata, created_by)
    VALUES (
        v_tid, 'BP-CUS-LO-001', 'Emirates Global Finance Ltd', 'Emirates Global Finance',
        'organization', 'Emirates Global Finance Limited', 'plc',
        'DFSA-2008-0099', 'AE', 'AE',
        ARRAY['customer','financial_services','asset_management'],
        2008, '51_200', '200m_500m',
        'DFSA-regulated asset management firm. S&P BB+ rated. Zero adverse findings, prompt payment record, full KYC/AML compliance on file.',
        'active', v_meta, v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO v_bp_cus_lo;

    IF v_bp_cus_lo IS NULL THEN
        SELECT id INTO v_bp_cus_lo FROM master.business_partner
        WHERE tenant_id = v_tid AND code = 'BP-CUS-LO-001';
    END IF;

    RAISE NOTICE '[%] §2 business_partner: 6 BPs resolved', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §2.5  supplier + customer role records (needed for supplier_role /
    --       customer_role assessment context subject binding trigger)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.supplier
        (tenant_id, business_partner_id, supplier_code, supplier_type, status, created_by)
    VALUES
        (v_tid, v_bp_sup_hi, 'SUP-DEMO-001', 'manufacturer', 'active', v_su),
        (v_tid, v_bp_sup_me, 'SUP-DEMO-002', 'service',      'active', v_su),
        (v_tid, v_bp_sup_lo, 'SUP-DEMO-003', 'general',      'active', v_su)
    ON CONFLICT (tenant_id, business_partner_id) DO NOTHING;

    SELECT id INTO v_sup_hi FROM master.supplier WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi;
    SELECT id INTO v_sup_me FROM master.supplier WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_me;
    SELECT id INTO v_sup_lo FROM master.supplier WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_lo;

    INSERT INTO master.customer
        (tenant_id, business_partner_id, customer_code, customer_type, status, created_by)
    VALUES
        (v_tid, v_bp_cus_hi, 'CUS-DEMO-001', 'corporate', 'active', v_su),
        (v_tid, v_bp_cus_me, 'CUS-DEMO-002', 'corporate', 'active', v_su),
        (v_tid, v_bp_cus_lo, 'CUS-DEMO-003', 'corporate', 'active', v_su)
    ON CONFLICT (tenant_id, business_partner_id) DO NOTHING;

    SELECT id INTO v_cus_hi FROM master.customer WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_hi;
    SELECT id INTO v_cus_me FROM master.customer WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_me;
    SELECT id INTO v_cus_lo FROM master.customer WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_lo;

    RAISE NOTICE '[%] §2.5 supplier/customer roles: 3+3 resolved', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §3  party_governance_relation — ownership and control structure
    --     Fully detailed for the high-risk supplier (Apex Industrial Supplies).
    --     Lighter skeleton for medium and low risk to show pattern variation.
    -- ══════════════════════════════════════════════════════════════════════════

    -- §3a  Apex Industrial Supplies — beneficial owner / majority shareholder (PEP)
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_hi
          AND relation_type = 'shareholder'
          AND member_name = 'Ahmad Khalid Al-Mansoori'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         member_country_code, business_title, ownership_pct, share_class,
         voting_pct, beneficial_ownership_pct, directness, control_nature,
         kyc_status, sanctions_status, pep_status, evidence_status,
         source_of_wealth, appointed_date, last_reviewed_at, next_review_at,
         notes, status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, 'shareholder',
        'Ahmad Khalid Al-Mansoori', 'individual', 'AE',
        'Chairman & Ultimate Beneficial Owner',
        51.0000, 'ordinary', 51.0000, 51.0000,
        'direct', 'equity',
        'verified', 'flagged', 'pep',
        'received',
        'Dividends from Apex Industrial and real estate holdings in Dubai and Abu Dhabi.',
        '2015-03-01'::date, '2025-11-15'::timestamptz, '2026-11-15'::date,
        'PEP flag raised due to prior government advisory role (2018-2021). Enhanced due diligence completed. No active sanctions match. Ongoing monitoring required at enhanced frequency.',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    -- §3b  Apex Industrial — minority corporate shareholder (indirect via Cayman holding)
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_hi
          AND relation_type = 'shareholder'
          AND member_name = 'Gulf Horizon Holdings Ltd'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         company_name, member_country_code, business_title, ownership_pct,
         share_class, voting_pct, beneficial_ownership_pct, directness,
         control_nature, kyc_status, sanctions_status, pep_status,
         evidence_status, appointed_date, last_reviewed_at, next_review_at,
         notes, status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, 'shareholder',
        'Gulf Horizon Holdings Ltd', 'company',
        'Gulf Horizon Holdings Ltd (Cayman Islands)', 'KY',
        'Minority Corporate Shareholder',
        49.0000, 'ordinary', 49.0000, 22.0000,
        'indirect', 'equity',
        'in_progress', 'not_checked', 'unknown',
        'missing',
        '2019-07-01'::date, '2025-09-01'::timestamptz, '2026-03-01'::date,
        'Cayman Islands SPV. UBO chain under active KYC investigation. Beneficial ownership declared at 22% via layered structure. Evidence package incomplete — follow-up issued.',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    -- §3c  Apex Industrial — executive director
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_hi
          AND relation_type = 'director'
          AND member_name = 'Faisal Ibrahim Al-Qassim'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         member_country_code, business_title, authority_scope, authority_limit_amount,
         authority_limit_currency_code, directness, control_nature,
         kyc_status, sanctions_status, pep_status, evidence_status,
         appointed_date, last_reviewed_at, next_review_at,
         notes, status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, 'director',
        'Faisal Ibrahim Al-Qassim', 'individual', 'AE',
        'Executive Director — Operations',
        'procurement_and_payments', 500000.0000, 'USD',
        'direct', 'appointment',
        'passed', 'clear', 'no_pep',
        'verified',
        '2021-01-15'::date, '2025-12-01'::timestamptz, '2026-12-01'::date,
        'Fully cleared director. Sole signatory for operational procurement up to USD 500k. Annual KYC renewal due December 2026.',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    -- §3d  Apex Industrial — silent partner / contractual controller
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_hi
          AND relation_type = 'controller'
          AND member_name = 'MENA Capital Partners PJSC'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         company_name, member_country_code, business_title, directness, control_nature,
         kyc_status, sanctions_status, pep_status, evidence_status,
         appointed_date, notes, status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, 'controller',
        'MENA Capital Partners PJSC', 'company',
        'MENA Capital Partners PJSC', 'AE',
        'Contractual Controller — Debt-Covenant Veto Rights',
        'indirect', 'contractual',
        'in_progress', 'not_checked', 'unknown',
        'missing',
        '2023-06-01'::date,
        'Lender with negative-pledge and veto rights over major disposals per 2023 term-loan covenants. Review of control scope in progress. Evidence request sent.',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    -- §3e  Meridian Tech Solutions — single director/owner (clean)
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_me
          AND relation_type = 'shareholder'
          AND member_name = 'Priya Nair Subramaniam'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         member_country_code, business_title, ownership_pct, beneficial_ownership_pct,
         directness, control_nature, kyc_status, sanctions_status, pep_status,
         evidence_status, appointed_date, last_reviewed_at, next_review_at,
         status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_me, 'shareholder',
        'Priya Nair Subramaniam', 'individual', 'IN',
        'Founder & CEO', 100.0000, 100.0000,
        'direct', 'equity',
        'passed', 'clear', 'no_pep',
        'verified',
        '2018-04-10'::date, '2025-10-01'::timestamptz, '2026-10-01'::date,
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    -- §3f  BlueStar Logistics Group — public-float majority + institutional shareholder
    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_lo
          AND relation_type = 'shareholder'
          AND member_name = 'Public Float'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         company_name, ownership_pct, share_class, voting_pct, directness, control_nature,
         kyc_status, sanctions_status, pep_status, evidence_status,
         status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_lo, 'shareholder',
        'Public Float', 'public_float',
        NULL, 62.5000, 'ordinary', 62.5000,
        'direct', 'equity',
        'not_started', 'clear', 'not_applicable',
        'waived',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
        WHERE tenant_id = v_tid
          AND party_type = 'business_partner'
          AND party_id = v_bp_sup_lo
          AND relation_type = 'shareholder'
          AND member_name = 'Deutsche Investment Management GmbH'
    ) THEN
    INSERT INTO master.party_governance_relation
        (tenant_id, party_type, party_id, relation_type, member_name, member_type,
         company_name, ownership_pct, share_class, voting_pct, directness, control_nature,
         kyc_status, sanctions_status, pep_status, evidence_status,
         status, created_by, metadata)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_lo, 'shareholder',
        'Deutsche Investment Management GmbH', 'company',
        'Deutsche Investment Management GmbH', 37.5000, 'ordinary', 37.5000,
        'direct', 'equity',
        'passed', 'clear', 'no_pep',
        'verified',
        'active', v_su, v_meta
    )
    ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '[%] §3 party_governance_relation: inserted governance members', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §4  party_risk_evidence — multi-source evidence records
    -- ══════════════════════════════════════════════════════════════════════════

    -- §4a  Apex Industrial: D&B credit report (poor score)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, v_bp_sup_hi,
        'dun_bradstreet', 'DNB-2025-AE-042-091', 'score',
        '2025-10-01'::date, '2025-10-01'::date, '2026-10-01'::date,
        'D&B PAYDEX Score Report — Apex Industrial Supplies LLC',
        'PAYDEX 38 (pays 33 days beyond terms). Financial Stress Score 1132 (high risk). Composite Risk Indicator: 4 (significant risk). 3 public derogatory filings in last 24 months.',
        jsonb_build_object(
            'paydex',              38,
            'financial_stress',    1132,
            'cri',                 4,
            'derogatory_filings',  3,
            'credit_limit_usd',    50000,
            'days_beyond_terms',   33
        ),
        90.00, 'active', ARRAY['credit','paydex','high_risk'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_hi_dnb;

    IF v_evid_sup_hi_dnb IS NULL THEN
        SELECT id INTO v_evid_sup_hi_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-AE-042-091';
    END IF;

    -- §4b  Apex Industrial: Refinitiv World-Check sanctions/PEP screening
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, v_bp_sup_hi,
        'refinitiv_wcc', 'RWC-2025-11-AE-018522', 'alert',
        '2025-11-01'::date, '2025-11-01'::date, '2026-02-01'::date,
        'Refinitiv World-Check Screening — Apex Industrial Supplies LLC',
        'Entity clear on OFAC SDN. Possible match on EU Enhanced Due Diligence list (confidence 61%). UBO Ahmad Al-Mansoori confirmed PEP Class B (former UAE regulatory advisor). Requires enhanced due diligence refresh within 90 days.',
        jsonb_build_object(
            'entity_hits',    1,
            'entity_status',  'possible_match',
            'entity_list',    'EU_EDD',
            'entity_score',   61,
            'ubo_hits',       1,
            'ubo_name',       'Ahmad Khalid Al-Mansoori',
            'ubo_pep_class',  'B',
            'ubo_cleared',    true,
            'ofac_clear',     true,
            'un_clear',       true
        ),
        78.00, 'active', ARRAY['sanctions','pep','edd','watch_list'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_hi_wcc;

    IF v_evid_sup_hi_wcc IS NULL THEN
        SELECT id INTO v_evid_sup_hi_wcc FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi
          AND source_code = 'refinitiv_wcc' AND source_reference = 'RWC-2025-11-AE-018522';
    END IF;

    -- §4c  Apex Industrial: EcoVadis ESG assessment (low score)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, v_bp_sup_hi,
        'ecovadis', 'ECV-2025-AE-00441', 'score',
        '2025-09-15'::date, '2025-09-15'::date, '2026-09-15'::date,
        'EcoVadis CSR Assessment — Apex Industrial Supplies LLC',
        'Overall EcoVadis score: 31/100 (Bronze threshold is 45). Labour & Human Rights: 24/100 — findings include undocumented overtime and inadequate grievance mechanism. Environment: 38/100. Ethics: 42/100. Sustainable Procurement: 30/100.',
        jsonb_build_object(
            'overall_score',          31,
            'environment_score',       38,
            'labour_score',            24,
            'ethics_score',            42,
            'procurement_score',       30,
            'medal',                   'none',
            'critical_finding',        true,
            'finding_category',        'labour_human_rights',
            'finding_severity',        'critical'
        ),
        95.00, 'active', ARRAY['esg','ecovadis','labour','critical_finding'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_hi_eco;

    IF v_evid_sup_hi_eco IS NULL THEN
        SELECT id INTO v_evid_sup_hi_eco FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi
          AND source_code = 'ecovadis' AND source_reference = 'ECV-2025-AE-00441';
    END IF;

    -- §4d  Apex Industrial: supplier self-assessment questionnaire (operational gaps)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, v_bp_sup_hi,
        'supplier_questionnaire', 'SQN-2025-HI-001', 'questionnaire',
        '2025-10-15'::date, '2025-10-15'::date, '2026-10-15'::date,
        'Supplier Self-Assessment Questionnaire — Apex Industrial Supplies LLC',
        'Respondent confirmed: no ISO 9001 certification, no business continuity plan, single warehouse facility in Sharjah (no redundancy), capacity utilisation at 94% leaving limited buffer for demand spikes. Delivery SLA compliance: 71% (threshold 85%).',
        jsonb_build_object(
            'iso_9001_certified',      false,
            'iso_14001_certified',     false,
            'bcp_exists',              false,
            'warehouse_count',         1,
            'capacity_utilisation_pct', 94,
            'sla_compliance_pct',      71,
            'single_source_risk',      true,
            'subcontractor_count',     0
        ),
        80.00, 'active',
        ARRAY['questionnaire','operational','capacity','single_source'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_hi_qst;

    IF v_evid_sup_hi_qst IS NULL THEN
        SELECT id INTO v_evid_sup_hi_qst FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi
          AND source_code = 'supplier_questionnaire' AND source_reference = 'SQN-2025-HI-001';
    END IF;

    -- §4e  Apex Industrial: internal system signal (data completeness)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_hi, v_bp_sup_hi,
        'internal_system', 'INT-BP-COMPLETENESS-HI-001', 'finding',
        CURRENT_DATE, CURRENT_DATE,
        'Internal Profile Completeness Check — Apex Industrial Supplies LLC',
        'Automated completeness check: missing bank account details (blocks payment), trade licence expiry date not recorded, 2 of 4 governance members have incomplete KYC evidence.',
        jsonb_build_object(
            'completeness_score_pct', 52,
            'missing_fields',         ARRAY['bank_account','trade_licence_expiry'],
            'governance_kyc_incomplete', 2,
            'governance_kyc_total',   4,
            'last_checked_at',        now()::text
        ),
        100.00, 'active',
        ARRAY['internal','completeness','data_quality'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_hi_int;

    IF v_evid_sup_hi_int IS NULL THEN
        SELECT id INTO v_evid_sup_hi_int FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_hi
          AND source_code = 'internal_system' AND source_reference = 'INT-BP-COMPLETENESS-HI-001';
    END IF;

    -- §4f  Meridian Tech: D&B (medium credit)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_me, v_bp_sup_me,
        'dun_bradstreet', 'DNB-2025-AE-098-035', 'score',
        '2025-10-01'::date, '2025-10-01'::date, '2026-10-01'::date,
        'D&B PAYDEX Score Report — Meridian Tech Solutions FZE',
        'PAYDEX 65 (pays 8 days beyond terms). Financial Stress Score 1340 (low-moderate risk). No derogatory filings.',
        jsonb_build_object('paydex', 65, 'financial_stress', 1340, 'cri', 2, 'days_beyond_terms', 8),
        88.00, 'active', ARRAY['credit','paydex','medium_risk'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_me_dnb;

    IF v_evid_sup_me_dnb IS NULL THEN
        SELECT id INTO v_evid_sup_me_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_me
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-AE-098-035';
    END IF;

    -- §4g  Meridian Tech: World-Check (clear)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_me, v_bp_sup_me,
        'refinitiv_wcc', 'RWC-2025-10-AE-009144', 'finding',
        '2025-10-05'::date, '2025-10-05'::date, '2026-01-05'::date,
        'Refinitiv World-Check Screening — Meridian Tech Solutions FZE',
        'No matches found. Entity, directors, and UBO all clear across OFAC, UN, EU, UK, and FATF lists.',
        jsonb_build_object('entity_hits', 0, 'ubo_hits', 0, 'ofac_clear', true, 'un_clear', true),
        98.00, 'active', ARRAY['sanctions','clear'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_me_wcc;

    IF v_evid_sup_me_wcc IS NULL THEN
        SELECT id INTO v_evid_sup_me_wcc FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_me
          AND source_code = 'refinitiv_wcc' AND source_reference = 'RWC-2025-10-AE-009144';
    END IF;

    -- §4h  Meridian Tech: supplier questionnaire (delivery gaps)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_me, v_bp_sup_me,
        'supplier_questionnaire', 'SQN-2025-ME-001', 'questionnaire',
        '2025-09-20'::date, '2025-09-20'::date, '2026-09-20'::date,
        'Supplier Self-Assessment Questionnaire — Meridian Tech Solutions FZE',
        'ISO 27001 certified (expires Mar 2026). No EcoVadis certificate. SLA compliance 82% vs 85% threshold. Bank details not yet registered in system.',
        jsonb_build_object(
            'iso_27001_certified',  true,
            'iso_27001_expiry',     '2026-03-31',
            'ecovadis_enrolled',    false,
            'sla_compliance_pct',   82,
            'bank_details_onfile',  false
        ),
        80.00, 'active', ARRAY['questionnaire','delivery','data_quality'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_me_qst;

    IF v_evid_sup_me_qst IS NULL THEN
        SELECT id INTO v_evid_sup_me_qst FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_me
          AND source_code = 'supplier_questionnaire' AND source_reference = 'SQN-2025-ME-001';
    END IF;

    -- §4i  BlueStar Logistics: D&B (excellent)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_lo, v_bp_sup_lo,
        'dun_bradstreet', 'DNB-2025-DE-001-882', 'score',
        '2025-10-01'::date, '2025-10-01'::date, '2026-10-01'::date,
        'D&B PAYDEX Score Report — BlueStar Logistics Group GmbH',
        'PAYDEX 89 (pays 5 days early). Financial Stress Score 1490 (minimal risk). No derogatory filings. Maximum credit recommendation EUR 2.5M.',
        jsonb_build_object(
            'paydex', 89, 'financial_stress', 1490, 'cri', 1,
            'max_credit_eur', 2500000, 'days_early', 5
        ),
        96.00, 'active', ARRAY['credit','paydex','low_risk','excellent'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_lo_dnb;

    IF v_evid_sup_lo_dnb IS NULL THEN
        SELECT id INTO v_evid_sup_lo_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_lo
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-DE-001-882';
    END IF;

    -- §4j  BlueStar Logistics: World-Check (clear)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_lo, v_bp_sup_lo,
        'refinitiv_wcc', 'RWC-2025-10-DE-000312', 'finding',
        '2025-10-03'::date, '2025-10-03'::date, '2026-01-03'::date,
        'Refinitiv World-Check Screening — BlueStar Logistics Group GmbH',
        'No matches. All directors and shareholders clear across all major sanction lists.',
        jsonb_build_object('entity_hits', 0, 'ubo_hits', 0, 'ofac_clear', true),
        99.00, 'active', ARRAY['sanctions','clear'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_lo_wcc;

    IF v_evid_sup_lo_wcc IS NULL THEN
        SELECT id INTO v_evid_sup_lo_wcc FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_lo
          AND source_code = 'refinitiv_wcc' AND source_reference = 'RWC-2025-10-DE-000312';
    END IF;

    -- §4k  BlueStar Logistics: EcoVadis Platinum
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_sup_lo, v_bp_sup_lo,
        'ecovadis', 'ECV-2025-DE-00228', 'score',
        '2025-08-01'::date, '2025-08-01'::date, '2026-08-01'::date,
        'EcoVadis CSR Assessment — BlueStar Logistics Group GmbH',
        'Overall score 79/100 — Platinum medal. Top 5% of logistics companies assessed. Environment 82, Labour 78, Ethics 80, Sustainable Procurement 76.',
        jsonb_build_object(
            'overall_score', 79, 'environment_score', 82, 'labour_score', 78,
            'ethics_score', 80, 'procurement_score', 76,
            'medal', 'platinum', 'percentile', 95
        ),
        97.00, 'active', ARRAY['esg','ecovadis','platinum','low_risk'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_sup_lo_eco;

    IF v_evid_sup_lo_eco IS NULL THEN
        SELECT id INTO v_evid_sup_lo_eco FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_sup_lo
          AND source_code = 'ecovadis' AND source_reference = 'ECV-2025-DE-00228';
    END IF;

    -- §4l  Al-Rashid Trading: D&B (poor credit)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_cus_hi, v_bp_cus_hi,
        'dun_bradstreet', 'DNB-2025-AE-055-019', 'score',
        '2025-11-01'::date, '2025-11-01'::date, '2026-11-01'::date,
        'D&B PAYDEX Score Report — Al-Rashid Trading Co.',
        'PAYDEX 42 (pays 28 days beyond terms). Financial Stress Score 1066 (very high risk). 1 public record filing (unpaid judgment). Severe Payment Index: 44.',
        jsonb_build_object(
            'paydex', 42, 'financial_stress', 1066, 'cri', 5,
            'public_records', 1, 'severe_payment_index', 44,
            'days_beyond_terms', 28
        ),
        92.00, 'active', ARRAY['credit','paydex','high_risk','judgment'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_cus_hi_dnb;

    IF v_evid_cus_hi_dnb IS NULL THEN
        SELECT id INTO v_evid_cus_hi_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_hi
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-AE-055-019';
    END IF;

    -- §4m  Al-Rashid Trading: World-Check (clear)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_cus_hi, v_bp_cus_hi,
        'refinitiv_wcc', 'RWC-2025-11-AE-020017', 'finding',
        '2025-11-02'::date, '2025-11-02'::date, '2026-02-02'::date,
        'Refinitiv World-Check Screening — Al-Rashid Trading Co.',
        'Entity and directors clear. No sanctions matches found.',
        jsonb_build_object('entity_hits', 0, 'ubo_hits', 0, 'ofac_clear', true),
        95.00, 'active', ARRAY['sanctions','clear'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_cus_hi_wcc;

    IF v_evid_cus_hi_wcc IS NULL THEN
        SELECT id INTO v_evid_cus_hi_wcc FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_hi
          AND source_code = 'refinitiv_wcc' AND source_reference = 'RWC-2025-11-AE-020017';
    END IF;

    -- §4n  Falcon Retail: D&B (medium credit)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_cus_me, v_bp_cus_me,
        'dun_bradstreet', 'DNB-2025-AE-022-551', 'score',
        '2025-10-01'::date, '2025-10-01'::date, '2026-10-01'::date,
        'D&B PAYDEX Score Report — Falcon Retail Chains LLC',
        'PAYDEX 58 (pays 15 days beyond terms). Moderate payment delays observed in H2 2025.',
        jsonb_build_object('paydex', 58, 'financial_stress', 1280, 'cri', 3, 'days_beyond_terms', 15),
        88.00, 'active', ARRAY['credit','paydex','medium_risk'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_cus_me_dnb;

    IF v_evid_cus_me_dnb IS NULL THEN
        SELECT id INTO v_evid_cus_me_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_me
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-AE-022-551';
    END IF;

    -- §4o  Emirates Global Finance: D&B (excellent)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_cus_lo, v_bp_cus_lo,
        'dun_bradstreet', 'DNB-2025-AE-099-003', 'score',
        '2025-10-01'::date, '2025-10-01'::date, '2026-10-01'::date,
        'D&B PAYDEX Score Report — Emirates Global Finance Ltd',
        'PAYDEX 92 (pays 7 days early). Financial Stress Score 1488 (minimal risk). Maximum credit recommendation USD 10M.',
        jsonb_build_object('paydex', 92, 'financial_stress', 1488, 'cri', 1, 'days_early', 7),
        97.00, 'active', ARRAY['credit','paydex','low_risk','excellent'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_cus_lo_dnb;

    IF v_evid_cus_lo_dnb IS NULL THEN
        SELECT id INTO v_evid_cus_lo_dnb FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_lo
          AND source_code = 'dun_bradstreet' AND source_reference = 'DNB-2025-AE-099-003';
    END IF;

    -- §4p  Emirates Global Finance: World-Check (clear)
    INSERT INTO master.party_risk_evidence
        (tenant_id, subject_type, subject_id, business_partner_id,
         source_code, source_reference, evidence_type, evidence_date,
         valid_from, valid_until, title, summary,
         normalized_payload, confidence_score, status, tags, created_by)
    VALUES (
        v_tid, 'business_partner', v_bp_cus_lo, v_bp_cus_lo,
        'refinitiv_wcc', 'RWC-2025-10-AE-000019', 'finding',
        '2025-10-04'::date, '2025-10-04'::date, '2026-01-04'::date,
        'Refinitiv World-Check Screening — Emirates Global Finance Ltd',
        'DFSA-regulated entity. All directors and shareholders clear.',
        jsonb_build_object('entity_hits', 0, 'ubo_hits', 0, 'ofac_clear', true, 'regulatory_clear', true),
        99.00, 'active', ARRAY['sanctions','clear','regulated'], v_su
    )
    ON CONFLICT (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded'
    DO NOTHING
    RETURNING id INTO v_evid_cus_lo_wcc;

    IF v_evid_cus_lo_wcc IS NULL THEN
        SELECT id INTO v_evid_cus_lo_wcc FROM master.party_risk_evidence
        WHERE tenant_id = v_tid AND business_partner_id = v_bp_cus_lo
          AND source_code = 'refinitiv_wcc' AND source_reference = 'RWC-2025-10-AE-000019';
    END IF;

    RAISE NOTICE '[%] §4 party_risk_evidence: 16 evidence records resolved', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §5  party_risk_assessment — scored assessments (approved)
    -- ══════════════════════════════════════════════════════════════════════════

    -- §5a  Apex Industrial: supplier-role assessment (HIGH risk, score 28)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'supplier', v_sup_hi, v_bp_sup_hi,
        'supplier_role', 'standard_supplier', '1.0',
        28.00, 'high', false,
        'approved',
        '2025-11-10 09:00:00+04'::timestamptz, v_su,
        '2025-11-12 14:00:00+04'::timestamptz, v_su,
        '2026-05-12'::date, 'quarterly', 1,
        'High-risk supplier. PEP-linked UBO, poor ESG score, labour violation finding, poor credit, single-source dependency. Escalated to Head of Procurement and Risk for approval. Enhanced monitoring schedule.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_sup_hi;

    IF v_asmnt_sup_hi IS NULL THEN
        SELECT id INTO v_asmnt_sup_hi FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'supplier'
          AND subject_id = v_sup_hi AND assessment_context = 'supplier_role'
          AND status = 'approved';
    END IF;

    -- §5b  Meridian Tech: supplier-role assessment (MEDIUM risk, score 52)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'supplier', v_sup_me, v_bp_sup_me,
        'supplier_role', 'standard_supplier', '1.0',
        52.00, 'medium', false,
        'approved',
        '2025-10-25 10:00:00+04'::timestamptz, v_su,
        '2025-10-27 11:00:00+04'::timestamptz, v_su,
        '2026-10-27'::date, 'annually', 1,
        'Medium-risk. Delivery SLA marginally below threshold. No bank details on file. ESG certificate absent. Standard monitoring.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_sup_me;

    IF v_asmnt_sup_me IS NULL THEN
        SELECT id INTO v_asmnt_sup_me FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'supplier'
          AND subject_id = v_sup_me AND assessment_context = 'supplier_role'
          AND status = 'approved';
    END IF;

    -- §5c  BlueStar Logistics: supplier-role assessment (LOW risk, score 82)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'supplier', v_sup_lo, v_bp_sup_lo,
        'supplier_role', 'standard_supplier', '1.0',
        82.00, 'low', false,
        'approved',
        '2025-10-20 09:30:00+04'::timestamptz, v_su,
        '2025-10-21 10:00:00+04'::timestamptz, v_su,
        '2027-10-21'::date, 'annually', 1,
        'Preferred / low-risk supplier. Platinum EcoVadis, PAYDEX 89, all screens clear. Extended review cycle approved.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_sup_lo;

    IF v_asmnt_sup_lo IS NULL THEN
        SELECT id INTO v_asmnt_sup_lo FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'supplier'
          AND subject_id = v_sup_lo AND assessment_context = 'supplier_role'
          AND status = 'approved';
    END IF;

    -- §5d  Al-Rashid Trading: customer-role assessment (HIGH risk, score 32)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'customer', v_cus_hi, v_bp_cus_hi,
        'customer_role', 'standard_customer', '1.0',
        32.00, 'high', false,
        'approved',
        '2025-11-08 11:00:00+04'::timestamptz, v_su,
        '2025-11-10 09:00:00+04'::timestamptz, v_su,
        '2026-02-10'::date, 'quarterly', 1,
        'High-risk customer. Critical credit score, 28-day average payment delay, 1 unpaid judgment. Credit limit reduced to AED 50k pending improvement.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_cus_hi;

    IF v_asmnt_cus_hi IS NULL THEN
        SELECT id INTO v_asmnt_cus_hi FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'customer'
          AND subject_id = v_cus_hi AND assessment_context = 'customer_role'
          AND status = 'approved';
    END IF;

    -- §5e  Falcon Retail: customer-role assessment (MEDIUM risk, score 58)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'customer', v_cus_me, v_bp_cus_me,
        'customer_role', 'standard_customer', '1.0',
        58.00, 'medium', false,
        'approved',
        '2025-10-22 14:00:00+04'::timestamptz, v_su,
        '2025-10-24 10:00:00+04'::timestamptz, v_su,
        '2026-04-24'::date, 'quarterly', 1,
        'Medium-risk customer. Payment delays improving. Credit limit maintained at AED 500k with monitoring.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_cus_me;

    IF v_asmnt_cus_me IS NULL THEN
        SELECT id INTO v_asmnt_cus_me FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'customer'
          AND subject_id = v_cus_me AND assessment_context = 'customer_role'
          AND status = 'approved';
    END IF;

    -- §5f  Emirates Global Finance: customer-role assessment (LOW risk, score 85)
    INSERT INTO master.party_risk_assessment
        (tenant_id, subject_type, subject_id, business_partner_id,
         assessment_context, model_code, model_version,
         overall_score, risk_band, is_override,
         status, assessed_at, assessed_by, approved_at, approved_by,
         next_review_at, review_frequency, version, notes, created_by)
    VALUES (
        v_tid, 'customer', v_cus_lo, v_bp_cus_lo,
        'customer_role', 'standard_customer', '1.0',
        85.00, 'low', false,
        'approved',
        '2025-10-18 09:00:00+04'::timestamptz, v_su,
        '2025-10-19 11:00:00+04'::timestamptz, v_su,
        '2027-10-19'::date, 'annually', 1,
        'Preferred / low-risk customer. DFSA-regulated. Credit limit approved at AED 5M.',
        v_su
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_asmnt_cus_lo;

    IF v_asmnt_cus_lo IS NULL THEN
        SELECT id INTO v_asmnt_cus_lo FROM master.party_risk_assessment
        WHERE tenant_id = v_tid AND subject_type = 'customer'
          AND subject_id = v_cus_lo AND assessment_context = 'customer_role'
          AND status = 'approved';
    END IF;

    RAISE NOTICE '[%] §5 party_risk_assessment: 6 assessments resolved', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §6  party_risk_dimension_score — per-dimension scores
    --     Weights from standard_supplier v1.0 and standard_customer v1.0.
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── Apex Industrial (supplier_hi) ─────────────────────────────────────────
    -- Supplier model weights: sanctions=0.20, compliance=0.18, credit=0.15,
    --   operational=0.20, esg=0.15, reputational=0.07, data_quality=0.05
    -- Weighted total ≈ 28

    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_sup_hi, 'sanctions',    20.00,  4.00, 0.2000, 'critical',  false, 2, 100.00, false,
     'Possible EU Enhanced-EDD entity match (61% confidence) + PEP-linked UBO. No active OFAC/UN/UK sanction. Enhanced screening ordered.'),
    (v_tid, v_asmnt_sup_hi, 'compliance',   32.00,  5.76, 0.1800, 'high',      false, 2, 90.00,  false,
     'Expired trade licence on record. AML/KYC evidence incomplete for 2 governance members.'),
    (v_tid, v_asmnt_sup_hi, 'credit',       35.00,  5.25, 0.1500, 'high',      false, 2, 100.00, false,
     'D&B PAYDEX 38. 3 derogatory filings. Financial stress score 1132 — high risk tier.'),
    (v_tid, v_asmnt_sup_hi, 'operational',  52.00, 10.40, 0.2000, 'medium',    false, 2, 80.00,  false,
     'Delivery SLA 71% (threshold 85%). Single warehouse, 94% capacity utilisation.'),
    (v_tid, v_asmnt_sup_hi, 'esg',          18.00,  2.70, 0.1500, 'critical',  false, 2, 100.00, false,
     'EcoVadis score 31/100. Critical labour finding. No ISO 14001. Well below Bronze threshold.'),
    (v_tid, v_asmnt_sup_hi, 'reputational', 38.00,  2.66, 0.0700, 'high',      false, 1, 70.00,  false,
     'Adverse media: one published article citing labour violations (Oct 2025).'),
    (v_tid, v_asmnt_sup_hi, 'data_quality', 55.00,  2.75, 0.0500, 'medium',    false, 2, 100.00, false,
     'Missing bank account. Trade licence expiry not on file. 2/4 governance KYC incomplete.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_shi_san FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='sanctions';
    SELECT id INTO v_ds_shi_cmp FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='compliance';
    SELECT id INTO v_ds_shi_crd FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='credit';
    SELECT id INTO v_ds_shi_ops FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='operational';
    SELECT id INTO v_ds_shi_esg FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='esg';
    SELECT id INTO v_ds_shi_rep FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='reputational';
    SELECT id INTO v_ds_shi_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND dimension_code='data_quality';

    -- ── Meridian Tech (supplier_me) ───────────────────────────────────────────
    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_sup_me, 'sanctions',    88.00, 17.60, 0.2000, 'low',    false, 0, 100.00, false, 'All screens clear.'),
    (v_tid, v_asmnt_sup_me, 'compliance',   62.00, 11.16, 0.1800, 'medium', false, 1, 80.00,  false, 'ISO 27001 valid until Mar 2026. No EcoVadis certificate.'),
    (v_tid, v_asmnt_sup_me, 'credit',       58.00,  8.70, 0.1500, 'medium', false, 1, 100.00, false, 'PAYDEX 65, 8 days beyond terms. Acceptable range.'),
    (v_tid, v_asmnt_sup_me, 'operational',  40.00,  8.00, 0.2000, 'high',   false, 1, 90.00,  false, 'SLA compliance 82% vs 85% threshold. Trend improving.'),
    (v_tid, v_asmnt_sup_me, 'esg',          45.00,  6.75, 0.1500, 'medium', false, 1, 70.00,  false, 'No ESG certificate. Environmental policy document on file.'),
    (v_tid, v_asmnt_sup_me, 'reputational', 80.00,  5.60, 0.0700, 'low',    false, 0, 60.00,  false, 'No adverse media. Limited public profile.'),
    (v_tid, v_asmnt_sup_me, 'data_quality', 45.00,  2.25, 0.0500, 'high',   false, 1, 100.00, false, 'Bank account details not on file — blocks payment processing.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_sme_san FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='sanctions';
    SELECT id INTO v_ds_sme_cmp FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='compliance';
    SELECT id INTO v_ds_sme_crd FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='credit';
    SELECT id INTO v_ds_sme_ops FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='operational';
    SELECT id INTO v_ds_sme_esg FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='esg';
    SELECT id INTO v_ds_sme_rep FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='reputational';
    SELECT id INTO v_ds_sme_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND dimension_code='data_quality';

    -- ── BlueStar Logistics (supplier_lo) ──────────────────────────────────────
    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_sup_lo, 'sanctions',    95.00, 19.00, 0.2000, 'low', false, 0, 100.00, false, 'All screens clear.'),
    (v_tid, v_asmnt_sup_lo, 'compliance',   88.00, 15.84, 0.1800, 'low', false, 0, 100.00, false, 'Full regulatory compliance. ISO 9001, 14001, 45001 all current.'),
    (v_tid, v_asmnt_sup_lo, 'credit',       88.00, 13.20, 0.1500, 'low', false, 0, 100.00, false, 'PAYDEX 89, pays early. EUR 2.5M credit recommendation.'),
    (v_tid, v_asmnt_sup_lo, 'operational',  85.00, 17.00, 0.2000, 'low', false, 0, 100.00, false, 'SLA compliance 97%. Multi-site, redundant capacity.'),
    (v_tid, v_asmnt_sup_lo, 'esg',          85.00, 12.75, 0.1500, 'low', false, 0, 100.00, false, 'EcoVadis Platinum (79/100). Top 5%.'),
    (v_tid, v_asmnt_sup_lo, 'reputational', 90.00,  6.30, 0.0700, 'low', false, 0, 100.00, false, 'No adverse findings. Reputable industry standing.'),
    (v_tid, v_asmnt_sup_lo, 'data_quality', 90.00,  4.50, 0.0500, 'low', false, 0, 100.00, false, 'All master data complete and verified.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_slo_san FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_lo AND dimension_code='sanctions';
    SELECT id INTO v_ds_slo_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_lo AND dimension_code='data_quality';

    -- ── Al-Rashid Trading (customer_hi) ───────────────────────────────────────
    -- Customer model weights: sanctions=0.25, credit=0.35, compliance=0.20,
    --   reputational=0.10, data_quality=0.10
    -- Weighted total ≈ 32

    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_cus_hi, 'sanctions',    82.00, 20.50, 0.2500, 'low',      false, 0, 100.00, false, 'Clear on all sanction lists.'),
    (v_tid, v_asmnt_cus_hi, 'credit',       18.00,  6.30, 0.3500, 'critical', false, 2, 100.00, false, 'PAYDEX 42, 28 days beyond terms. Public judgment filing. FSS 1066.'),
    (v_tid, v_asmnt_cus_hi, 'compliance',   42.00,  8.40, 0.2000, 'high',     false, 1, 80.00,  false, 'Missing tax ID. KYC partially complete.'),
    (v_tid, v_asmnt_cus_hi, 'reputational', 60.00,  6.00, 0.1000, 'medium',   false, 0, 50.00,  false, 'Limited adverse media. Small trading company.'),
    (v_tid, v_asmnt_cus_hi, 'data_quality', 40.00,  4.00, 0.1000, 'high',     false, 1, 100.00, false, 'Missing tax registration number required for invoicing.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_chi_san FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND dimension_code='sanctions';
    SELECT id INTO v_ds_chi_crd FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND dimension_code='credit';
    SELECT id INTO v_ds_chi_cmp FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND dimension_code='compliance';
    SELECT id INTO v_ds_chi_rep FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND dimension_code='reputational';
    SELECT id INTO v_ds_chi_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND dimension_code='data_quality';

    -- ── Falcon Retail (customer_me) ───────────────────────────────────────────
    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_cus_me, 'sanctions',    90.00, 22.50, 0.2500, 'low',    false, 0, 100.00, false, 'Clear.'),
    (v_tid, v_asmnt_cus_me, 'credit',       55.00, 19.25, 0.3500, 'medium', false, 1, 100.00, false, 'PAYDEX 58. 15-day delay. Improving trend.'),
    (v_tid, v_asmnt_cus_me, 'compliance',   65.00, 13.00, 0.2000, 'medium', false, 0, 80.00,  false, 'Trade licence current. KYC complete.'),
    (v_tid, v_asmnt_cus_me, 'reputational', 70.00,  7.00, 0.1000, 'low',    false, 0, 60.00,  false, 'No adverse media.'),
    (v_tid, v_asmnt_cus_me, 'data_quality', 68.00,  6.80, 0.1000, 'medium', false, 1, 100.00, false, 'One bank account on file. Secondary account missing.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_cme_crd FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_me AND dimension_code='credit';
    SELECT id INTO v_ds_cme_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_me AND dimension_code='data_quality';

    -- ── Emirates Global Finance (customer_lo) ─────────────────────────────────
    INSERT INTO master.party_risk_dimension_score
        (tenant_id, assessment_id, dimension_code,
         raw_score, weighted_score, weight_applied, risk_band,
         knockout_hit, driver_count, coverage_pct, is_incomplete, notes)
    VALUES
    (v_tid, v_asmnt_cus_lo, 'sanctions',    98.00, 24.50, 0.2500, 'low', false, 0, 100.00, false, 'DFSA regulated. All screens clear.'),
    (v_tid, v_asmnt_cus_lo, 'credit',       92.00, 32.20, 0.3500, 'low', false, 0, 100.00, false, 'PAYDEX 92, pays 7 days early. Minimal financial stress.'),
    (v_tid, v_asmnt_cus_lo, 'compliance',   88.00, 17.60, 0.2000, 'low', false, 0, 100.00, false, 'DFSA license current. Full KYC/AML on file.'),
    (v_tid, v_asmnt_cus_lo, 'reputational', 90.00,  9.00, 0.1000, 'low', false, 0, 100.00, false, 'No adverse findings.'),
    (v_tid, v_asmnt_cus_lo, 'data_quality', 95.00,  9.50, 0.1000, 'low', false, 0, 100.00, false, 'All fields complete and verified.')
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING;

    SELECT id INTO v_ds_clo_san FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND dimension_code='sanctions';
    SELECT id INTO v_ds_clo_crd FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND dimension_code='credit';
    SELECT id INTO v_ds_clo_cmp FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND dimension_code='compliance';
    SELECT id INTO v_ds_clo_rep FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND dimension_code='reputational';
    SELECT id INTO v_ds_clo_dq  FROM master.party_risk_dimension_score
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND dimension_code='data_quality';

    RAISE NOTICE '[%] §6 party_risk_dimension_score: all dimension scores inserted', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §7  party_risk_driver — individual risk signals
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── Apex Industrial drivers ───────────────────────────────────────────────

    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, created_by)
    VALUES
    -- sanctions: PEP-linked UBO
    (v_tid, v_asmnt_sup_hi, v_ds_shi_san, v_evid_sup_hi_wcc,
     'sanctions', 'sanctions_hit_pep', 'high', 35.00, false,
     'PEP-Linked Ultimate Beneficial Owner',
     'UBO Ahmad Al-Mansoori identified as PEP Class B (former UAE regulatory advisor 2018-2021). Enhanced due diligence completed and cleared, but ongoing quarterly re-screening required per AML policy.',
     'party_risk_evidence', v_su),
    -- sanctions: EU EDD possible match
    (v_tid, v_asmnt_sup_hi, v_ds_shi_san, v_evid_sup_hi_wcc,
     'sanctions', 'sanctions_hit_pep', 'medium', 25.00, false,
     'Possible EU Enhanced-EDD Entity Match',
     'Refinitiv World-Check returns 61% confidence match on EU Enhanced Due Diligence list for entity name. Investigated: different tax jurisdiction. Risk residual treated as medium pending next refresh.',
     'party_risk_evidence', v_su),
    -- compliance: AML/KYC incomplete
    (v_tid, v_asmnt_sup_hi, v_ds_shi_cmp, v_evid_sup_hi_wcc,
     'compliance', 'aml_kyc_failed', 'high', 40.00, false,
     'Incomplete AML/KYC Evidence for Governance Members',
     'KYC evidence missing for 2 of 4 governance members (Gulf Horizon Holdings and MENA Capital Partners). AML risk classification cannot be finalized until evidence is received.',
     'party_risk_evidence', v_su),
    -- compliance: licence concern
    (v_tid, v_asmnt_sup_hi, v_ds_shi_cmp, v_evid_sup_hi_int,
     'compliance', 'licence_expired', 'high', 40.00, false,
     'Trade Licence Expiry Not Recorded',
     'Trade licence expiry date absent from master record. Cannot confirm current validity. Supplier to provide copy within 14 days.',
     'party_risk_evidence', v_su),
    -- credit: poor PAYDEX
    (v_tid, v_asmnt_sup_hi, v_ds_shi_crd, v_evid_sup_hi_dnb,
     'credit', 'payment_history_poor', 'high', 45.00, false,
     'Poor Payment History — D&B PAYDEX 38',
     'PAYDEX score 38 indicates consistent payment 33 days beyond terms. 3 derogatory public filings in last 24 months. Financial Stress Score 1132 (high risk band).',
     'party_risk_evidence', v_su),
    -- esg: labour violation
    (v_tid, v_asmnt_sup_hi, v_ds_shi_esg, v_evid_sup_hi_eco,
     'esg', 'esg_labour_violation', 'critical', 70.00, false,
     'Critical Labour Rights Finding — EcoVadis Score 24/100',
     'EcoVadis identified undocumented overtime practices and inadequate grievance mechanism as critical findings under the Labour & Human Rights theme. Overall score 31/100 — well below Bronze threshold. Corrective action plan required.',
     'party_risk_evidence', v_su),
    -- esg: low overall score
    (v_tid, v_asmnt_sup_hi, v_ds_shi_esg, v_evid_sup_hi_eco,
     'esg', 'esg_score_low', 'high', 55.00, false,
     'Low EcoVadis Score — 31/100',
     'EcoVadis total score of 31 is below the Bronze threshold of 45. No medal awarded. All four EcoVadis themes score below 45.',
     'party_risk_evidence', v_su),
    -- operational: single-source
    (v_tid, v_asmnt_sup_hi, v_ds_shi_ops, v_evid_sup_hi_qst,
     'operational', 'single_source_risk', 'high', 50.00, false,
     'Single-Source Dependency — No Approved Alternate',
     'Apex Industrial is the sole approved supplier for Category B industrial consumables. No qualified alternate has been evaluated. Single facility at 94% capacity leaves minimal buffer.',
     'party_risk_evidence', v_su),
    -- operational: delivery SLA
    (v_tid, v_asmnt_sup_hi, v_ds_shi_ops, v_evid_sup_hi_qst,
     'operational', 'delivery_score_low', 'medium', 38.00, false,
     'Delivery SLA Compliance 71% — Below 85% Threshold',
     'Self-reported SLA compliance 71% for last review period. Root cause: capacity constraints at Sharjah warehouse and no business continuity plan for disruptions.',
     'party_risk_evidence', v_su),
    -- data_quality: missing bank details
    (v_tid, v_asmnt_sup_hi, v_ds_shi_dq, v_evid_sup_hi_int,
     'data_quality', 'missing_bank_details', 'medium', 30.00, false,
     'Missing Bank / Payment Details',
     'No verified bank account on file. Supplier quoted verbally but bank confirmation letter not received. Blocks payment processing.',
     'party_risk_evidence', v_su),
    -- data_quality: incomplete governance
    (v_tid, v_asmnt_sup_hi, v_ds_shi_dq, v_evid_sup_hi_int,
     'data_quality', 'incomplete_governance', 'medium', 28.00, false,
     'Incomplete Ownership / UBO Documentation',
     '2 of 4 governance members lack complete KYC evidence (missing ID documents and source-of-wealth declarations).',
     'party_risk_evidence', v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_shi_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='PEP-Linked Ultimate Beneficial Owner';
    SELECT id INTO v_drv_shi_2 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='Incomplete AML/KYC Evidence for Governance Members';
    SELECT id INTO v_drv_shi_3 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='Poor Payment History — D&B PAYDEX 38';
    SELECT id INTO v_drv_shi_4 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='Critical Labour Rights Finding — EcoVadis Score 24/100';
    SELECT id INTO v_drv_shi_5 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='Single-Source Dependency — No Approved Alternate';
    SELECT id INTO v_drv_shi_6 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_hi AND title='Missing Bank / Payment Details';

    -- ── Meridian Tech drivers ─────────────────────────────────────────────────
    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, created_by)
    VALUES
    (v_tid, v_asmnt_sup_me, v_ds_sme_ops, v_evid_sup_me_qst,
     'operational', 'delivery_score_low', 'medium', 30.00, false,
     'Delivery SLA Compliance 82% — Marginally Below Threshold',
     'Reported SLA compliance of 82% falls 3 points below the 85% target. Trend shows gradual improvement over 6 months. Mitigation: monthly SLA review checkpoint.',
     'party_risk_evidence', v_su),
    (v_tid, v_asmnt_sup_me, v_ds_sme_esg, v_evid_sup_me_qst,
     'esg', 'esg_no_certificate', 'medium', 25.00, false,
     'No ESG Certificate on File',
     'EcoVadis registration not yet completed. Environmental policy document exists but no third-party certification. Supplier committed to enrol in EcoVadis by Q2 2026.',
     'party_risk_evidence', v_su),
    (v_tid, v_asmnt_sup_me, v_ds_sme_dq, v_evid_sup_me_qst,
     'data_quality', 'missing_bank_details', 'medium', 35.00, false,
     'Bank Account Details Not Registered',
     'No bank account on file. Payment cannot be processed until confirmed bank details are received and verified.',
     'party_risk_evidence', v_su),
    (v_tid, v_asmnt_sup_me, v_ds_sme_crd, v_evid_sup_me_dnb,
     'credit', 'credit_score_low', 'low', 15.00, false,
     'Moderate D&B PAYDEX 65 — Monitoring Only',
     'PAYDEX 65 — acceptable range but 8 days beyond terms. Below preferred threshold of 70. Watchlist for monitoring.',
     'party_risk_evidence', v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_sme_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND title='Delivery SLA Compliance 82% — Marginally Below Threshold';
    SELECT id INTO v_drv_sme_2 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND title='No ESG Certificate on File';
    SELECT id INTO v_drv_sme_3 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_me AND title='Bank Account Details Not Registered';

    -- ── BlueStar Logistics driver (minor monitoring item) ─────────────────────
    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, created_by)
    VALUES
    (v_tid, v_asmnt_sup_lo, v_ds_slo_san, v_evid_sup_lo_wcc,
     'sanctions', NULL, 'low', 5.00, false,
     'Routine Sanctions Screen — Scheduled Refresh',
     'Last screen October 2025. Next scheduled Q1 2026 per standard low-risk cadence. No issues found.',
     'party_risk_evidence', v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_slo_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_sup_lo AND title='Routine Sanctions Screen — Scheduled Refresh';

    -- ── Al-Rashid Trading drivers ─────────────────────────────────────────────
    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, source_record_id, created_by)
    VALUES
    (v_tid, v_asmnt_cus_hi, v_ds_chi_crd, v_evid_cus_hi_dnb,
     'credit', 'payment_history_poor', 'critical', 65.00, false,
     'Critical Credit Risk — PAYDEX 42, Public Judgment',
     'D&B PAYDEX 42 indicates average payment 28 days beyond terms. 1 public unpaid judgment on record. FSS 1066 places customer in very high financial stress tier. Credit committee recommends AED 50k hard limit.',
     'party_risk_evidence', NULL, v_su),
    (v_tid, v_asmnt_cus_hi, v_ds_chi_crd, v_evid_cus_hi_dnb,
     'credit', 'credit_score_low', 'high', 50.00, false,
     'Sub-Threshold Credit Score',
     'Composite Risk Indicator score 5 (highest risk tier). Severe Payment Index 44. Potential for insolvency within 12 months not negligible.',
     'party_risk_evidence', NULL, v_su),
    (v_tid, v_asmnt_cus_hi, v_ds_chi_dq, NULL,
     'data_quality', 'missing_tax_id', 'high', 40.00, false,
     'Missing Tax Identification Number',
     'No TRN (Tax Registration Number) on file. Required for VAT-compliant invoicing under UAE FTA rules. Customer to provide within 30 days.',
     'master.business_partner', v_bp_cus_hi, v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_chi_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND title='Critical Credit Risk — PAYDEX 42, Public Judgment';
    SELECT id INTO v_drv_chi_2 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND title='Sub-Threshold Credit Score';
    SELECT id INTO v_drv_chi_3 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_hi AND title='Missing Tax Identification Number';

    -- ── Falcon Retail drivers ─────────────────────────────────────────────────
    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, source_record_id, created_by)
    VALUES
    (v_tid, v_asmnt_cus_me, v_ds_cme_crd, v_evid_cus_me_dnb,
     'credit', 'payment_history_poor', 'medium', 30.00, false,
     'Payment Delays 15 Days Beyond Terms',
     'PAYDEX 58 reflects consistent 15-day payment delays. Trend improving — PAYDEX was 52 in Q1 2025. Standard 30-day net terms maintained. Quarterly credit review in place.',
     'party_risk_evidence', NULL, v_su),
    (v_tid, v_asmnt_cus_me, v_ds_cme_dq, NULL,
     'data_quality', 'missing_bank_details', 'low', 10.00, false,
     'Secondary Bank Account Not on File',
     'Primary bank details complete. Backup bank account for large settlements not yet provided. Low impact but noted for completeness.',
     'master.business_partner', v_bp_cus_me, v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_cme_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_me AND title='Payment Delays 15 Days Beyond Terms';

    -- ── Emirates Global Finance driver (monitoring only) ─────────────────────
    INSERT INTO master.party_risk_driver
        (tenant_id, assessment_id, dimension_score_id, evidence_id,
         dimension_code, driver_code, severity, impact_score,
         is_knockout, title, description, source_entity, created_by)
    VALUES
    (v_tid, v_asmnt_cus_lo, v_ds_clo_san, v_evid_cus_lo_wcc,
     'sanctions', NULL, 'low', 3.00, false,
     'Routine Sanctions Screen — Scheduled Refresh',
     'Annual screen scheduled Q4 2026. DFSA licensee — continuous regulatory oversight provides additional assurance.',
     'party_risk_evidence', v_su)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_drv_clo_1 FROM master.party_risk_driver
    WHERE tenant_id=v_tid AND assessment_id=v_asmnt_cus_lo AND title='Routine Sanctions Screen — Scheduled Refresh';

    RAISE NOTICE '[%] §7 party_risk_driver: drivers inserted', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §8  party_risk_mitigation — remediation actions
    -- ══════════════════════════════════════════════════════════════════════════

    -- §8a  Apex Industrial: obtain KYC evidence for incomplete governance members
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_hi, v_asmnt_sup_hi, v_drv_shi_2,
        'corrective_action',
        'Obtain Complete KYC/AML Evidence — Gulf Horizon Holdings & MENA Capital Partners',
        'Collect certified ID documents, source-of-funds declarations, and ownership chain documentation for Gulf Horizon Holdings Ltd (Cayman) and MENA Capital Partners PJSC. Escalate to legal counsel if not received within 21 days. Outcome: complete governance KYC or suspend supplier engagement.',
        'in_progress', '2026-01-15'::date,
        'Initial evidence request sent 2025-11-20. Awaiting notarised documents from both parties.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8b  Apex Industrial: PEP — quarterly enhanced due diligence
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_hi, v_asmnt_sup_hi, v_drv_shi_1,
        'monitoring',
        'Quarterly Enhanced Due Diligence — PEP-Linked UBO',
        'Conduct quarterly re-screening of Ahmad Al-Mansoori against OFAC, UN, EU, UK, and FATF lists. Maintain EDD case file with analyst sign-off. Any escalation of PEP classification or negative finding triggers immediate procurement suspension.',
        'approved', '2026-02-12'::date,
        'First quarterly refresh scheduled Feb 2026. Calendar entry created. Prior full EDD cleared Nov 2025.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8c  Apex Industrial: corrective action plan for EcoVadis labour finding
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_hi, v_asmnt_sup_hi, v_drv_shi_4,
        'corrective_action',
        'EcoVadis Labour CAP — Documented Overtime Policy and Grievance Mechanism',
        'Supplier required to submit Corrective Action Plan (CAP) within 30 days covering: (1) document and publish overtime policy compliant with UAE Labour Law, (2) implement formal grievance mechanism with named responsible person, (3) re-submit EcoVadis assessment targeting Bronze (45+) by Q3 2026. Failure to submit CAP triggers procurement freeze.',
        'in_progress', '2026-03-31'::date,
        'CAP template sent to supplier contact 2025-11-25. Acknowledgment received. Detailed plan expected by 2025-12-20.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8d  Apex Industrial: alternate supplier qualification
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_hi, v_asmnt_sup_hi, v_drv_shi_5,
        'corrective_action',
        'Qualify Alternate Supplier for Category B Industrial Consumables',
        'Initiate pre-qualification for at least one alternate supplier in same spend category to eliminate single-source dependency. Target: alternate qualified and approved before next contract renewal (Q2 2026). Procurement team to identify 2 candidates for RFQ.',
        'approved', '2026-06-30'::date,
        'Procurement team briefed. 2 alternate supplier candidates under initial evaluation.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8e  Apex Industrial: obtain bank details
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_hi, v_asmnt_sup_hi, v_drv_shi_6,
        'corrective_action',
        'Collect and Verify Bank Account Details',
        'Request official bank confirmation letter on bank letterhead with account number and SWIFT/IBAN. Verify against supplier legal name. Payment runs blocked until bank details confirmed.',
        'in_progress', '2025-12-31'::date,
        'Request sent to supplier finance contact. Bank letter expected within 10 business days.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8f  Meridian Tech: bank details collection
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_me, v_asmnt_sup_me, v_drv_sme_3,
        'corrective_action',
        'Collect Bank Account Details — Meridian Tech Solutions',
        'Request bank confirmation letter with account number and SWIFT/IBAN. Required before any payment run.',
        'in_progress', '2025-12-15'::date,
        'Request sent. Follow-up scheduled for week of 2025-12-08.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8g  Meridian Tech: EcoVadis enrolment
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_sup_me, v_asmnt_sup_me, v_drv_sme_2,
        'corrective_action',
        'EcoVadis Enrolment Commitment — Q2 2026',
        'Supplier has committed to enrol in EcoVadis by 30 April 2026. Procurement to confirm enrolment confirmation email. Target minimum Bronze (45+) on first assessment.',
        'approved', '2026-04-30'::date,
        'Commitment confirmed in writing by supplier CEO 2025-10-28.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8h  Al-Rashid Trading: credit limit reduction + payment plan
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_cus_hi, v_asmnt_cus_hi, v_drv_chi_1,
        'conditional_approval',
        'Reduce Credit Limit to AED 50k and Require Advance Payment for Orders > AED 10k',
        'Credit committee decision: reduce approved credit limit from AED 200k to AED 50k. Any order exceeding AED 10k requires 50% advance payment. Review in 90 days contingent on 3 consecutive on-time payments.',
        'approved', '2026-02-10'::date,
        'Credit committee minute CM-2025-11-10-004. Customer notified via formal letter.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- §8i  Al-Rashid Trading: collect TRN
    INSERT INTO master.party_risk_mitigation
        (tenant_id, business_partner_id, assessment_id, driver_id,
         mitigation_type, title, description,
         status, due_date, evidence_note, created_by)
    VALUES (
        v_tid, v_bp_cus_hi, v_asmnt_cus_hi, v_drv_chi_3,
        'corrective_action',
        'Obtain UAE Tax Registration Number (TRN)',
        'Customer must provide copy of FTA TRN certificate. VAT-compliant invoicing blocked until TRN is verified and stored in system.',
        'in_progress', '2025-12-31'::date,
        'Request sent. Reminder issued 2025-11-25.',
        v_su
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[%] §8 party_risk_mitigation: mitigation actions inserted', v_pack;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §9  party_risk_review_event — audit trail
    -- ══════════════════════════════════════════════════════════════════════════

    -- §9a  Apex Industrial assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_sup_hi, 'created',
     v_su, 'user',
     NULL, 'draft', NULL, NULL,
     'Assessment initiated by risk team following annual supplier review cycle.',
     jsonb_build_object('trigger', 'annual_review_cycle'), '2025-11-05 08:00:00+04'),
    (v_tid, v_asmnt_sup_hi, 'submitted',
     v_su, 'user',
     'draft', 'pending_review', NULL, 'high',
     'Assessment submitted for approval. High risk band determined from scoring. Escalated to Head of Procurement.',
     jsonb_build_object('submitted_score', 28, 'submitted_band', 'high'), '2025-11-10 09:00:00+04'),
    (v_tid, v_asmnt_sup_hi, 'approved',
     v_su, 'user',
     'pending_review', 'approved', 'high', 'high',
     'Assessment approved. Risk band confirmed as HIGH. Enhanced monitoring programme activated. Next review set for May 2026.',
     jsonb_build_object('approver_role', 'head_of_procurement', 'review_frequency', 'semi_annual'), '2025-11-12 14:00:00+04'),
    (v_tid, v_asmnt_sup_hi, 'scheduled_review',
     v_su, 'system',
     'approved', 'approved', 'high', 'high',
     'Next periodic review auto-scheduled for 2026-05-12 per semi-annual cadence.',
     jsonb_build_object('next_review', '2026-05-12'), '2025-11-12 14:01:00+04')
    ON CONFLICT DO NOTHING;

    -- §9b  Meridian Tech assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_sup_me, 'created',
     v_su, 'user', NULL, 'draft', NULL, NULL,
     'Annual review initiated.', '{}', '2025-10-20 09:00:00+04'),
    (v_tid, v_asmnt_sup_me, 'submitted',
     v_su, 'user', 'draft', 'pending_review', NULL, 'medium',
     'Submitted. Medium risk. Standard approval track.',
     jsonb_build_object('submitted_score', 52), '2025-10-25 10:00:00+04'),
    (v_tid, v_asmnt_sup_me, 'approved',
     v_su, 'user', 'pending_review', 'approved', 'medium', 'medium',
     'Approved. Annual review cadence. Mitigations noted.',
     '{}', '2025-10-27 11:00:00+04')
    ON CONFLICT DO NOTHING;

    -- §9c  BlueStar Logistics assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_sup_lo, 'created',
     v_su, 'user', NULL, 'draft', NULL, NULL,
     'Periodic review.', '{}', '2025-10-15 09:00:00+04'),
    (v_tid, v_asmnt_sup_lo, 'approved',
     v_su, 'user', 'draft', 'approved', NULL, 'low',
     'Fast-tracked to approved. Low risk, Platinum EcoVadis. Biennial review approved.',
     jsonb_build_object('fast_track', true, 'review_frequency', 'biennial'), '2025-10-21 10:00:00+04')
    ON CONFLICT DO NOTHING;

    -- §9d  Al-Rashid Trading assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_cus_hi, 'created',
     v_su, 'user', NULL, 'draft', NULL, NULL,
     'Credit review triggered by 3 consecutive late payments.', '{}', '2025-11-03 10:00:00+04'),
    (v_tid, v_asmnt_cus_hi, 'submitted',
     v_su, 'user', 'draft', 'pending_review', NULL, 'high',
     'High credit risk confirmed. Submitted to credit committee.',
     jsonb_build_object('submitted_score', 32), '2025-11-08 11:00:00+04'),
    (v_tid, v_asmnt_cus_hi, 'approved',
     v_su, 'user', 'pending_review', 'approved', 'high', 'high',
     'Credit committee approved assessment. AED 50k credit limit set. Quarterly review cadence.',
     jsonb_build_object('credit_limit_aed', 50000, 'review_frequency', 'quarterly'), '2025-11-10 09:00:00+04'),
    (v_tid, v_asmnt_cus_hi, 'scheduled_review',
     v_su, 'system', 'approved', 'approved', 'high', 'high',
     'Quarterly review auto-scheduled 2026-02-10.', '{}', '2025-11-10 09:01:00+04')
    ON CONFLICT DO NOTHING;

    -- §9e  Falcon Retail assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_cus_me, 'created',
     v_su, 'user', NULL, 'draft', NULL, NULL, 'Semi-annual review.', '{}', '2025-10-15 14:00:00+04'),
    (v_tid, v_asmnt_cus_me, 'approved',
     v_su, 'user', 'draft', 'approved', NULL, 'medium',
     'Medium risk confirmed. AED 500k limit maintained.', '{}', '2025-10-24 10:00:00+04')
    ON CONFLICT DO NOTHING;

    -- §9f  Emirates Global Finance assessment lifecycle
    INSERT INTO master.party_risk_review_event
        (tenant_id, assessment_id, event_type, actor_id, actor_type,
         prior_status, new_status, prior_risk_band, new_risk_band,
         comment, metadata, created_at)
    VALUES
    (v_tid, v_asmnt_cus_lo, 'created',
     v_su, 'user', NULL, 'draft', NULL, NULL, 'Standard periodic review.', '{}', '2025-10-10 09:00:00+04'),
    (v_tid, v_asmnt_cus_lo, 'approved',
     v_su, 'user', 'draft', 'approved', NULL, 'low',
     'Preferred customer. AED 5M limit approved. Biennial cadence.',
     jsonb_build_object('credit_limit_aed', 5000000, 'review_frequency', 'biennial'), '2025-10-19 11:00:00+04')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[%] §9 party_risk_review_event: audit trail inserted', v_pack;
    RAISE NOTICE '[%] Completed successfully for tenant=%', v_pack, v_tid;

END $seed$;
