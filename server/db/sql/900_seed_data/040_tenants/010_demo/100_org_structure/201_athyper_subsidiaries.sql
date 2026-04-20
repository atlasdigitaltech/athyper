-- ============================================================================
-- ATHYPER GROUP — SUBSIDIARY LEGAL ENTITIES & COMPANY CODES
-- ============================================================================
-- File:     201_athyper_subsidiaries.sql
-- Schemas:  master.legal_entity, master.company_code
-- Purpose:  Seed the 16 subsidiary entities of the Athyper Group under the
--           'athyper' master tenant.  Each KC org alias athyper--{code}
--           (e.g. athyper--amre) resolves to tenant code 'athyper' and must
--           find a matching company_code row in that tenant.
--
-- KC org alias format: {tenant_code}--{entity_code_lowercase}
--   e.g. athyper--amre  → tenant='athyper', entity_code='AMRE'
-- The session service normalises entity_code to UPPER before lookup.
--
-- Depends:  000_athyper_tenant.sql, 200_demo_legal_entities.sql (ATHQ parent)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO NOTHING throughout
--
-- Stable UUID series:
--   Legal entities : dd000015-… dd000030-0000-0000-0000-000000000001
--   Company codes  : ee000015-… ee000030-0000-0000-0000-000000000001
--   Parent ATHQ LE : dd000014-0000-0000-0000-000000000001
-- ============================================================================

DO $athyper_subs$
DECLARE
    v_su        uuid  := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_parent_le uuid  := 'dd000014-0000-0000-0000-000000000001';  -- ATHQ holding LE
    v_meta      jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '201_athyper_subsidiaries', 'version', '1.0.0', 'seeded_at', now()::text
    ));
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[201_athyper_subsidiaries] athyper tenant not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ── Legal Entities (16 subsidiaries) ─────────────────────────────────────
    --
    -- Column order: id, tenant_id, code, name, description,
    --               country_code, functional_currency, reporting_currency,
    --               entity_type, parent_entity_id,
    --               consolidation_method, ownership_pct,
    --               regulatory_framework, metadata, status, created_by

    INSERT INTO master.legal_entity (
        id, tenant_id,
        code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct,
        regulatory_framework, metadata, status, created_by
    ) VALUES

    -- 1. AMRE — Athyper Malaysia Real Estate (MY, MYR)
    ('dd000015-0000-0000-0000-000000000001', v_tenant_id,
     'AMRE', 'Athyper Malaysia Real Estate', 'Athyper Group subsidiary — Malaysia Real Estate',
     'MY', 'MYR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 2. AQTU — Athyper Qatar Utilities (QA, QAR)
    ('dd000016-0000-0000-0000-000000000001', v_tenant_id,
     'AQTU', 'Athyper Qatar Utilities', 'Athyper Group subsidiary — Qatar Utilities',
     'QA', 'QAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 3. ASAC — Athyper Saudi Construction (SA, SAR)
    ('dd000017-0000-0000-0000-000000000001', v_tenant_id,
     'ASAC', 'Athyper Saudi Construction', 'Athyper Group subsidiary — Saudi Construction',
     'SA', 'SAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 4. AQTS — Athyper Qatar Transport (QA, QAR)
    ('dd000018-0000-0000-0000-000000000001', v_tenant_id,
     'AQTS', 'Athyper Qatar Transport', 'Athyper Group subsidiary — Qatar Transport',
     'QA', 'QAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 5. AUET — Athyper UAE Trading (AE, AED)
    ('dd000019-0000-0000-0000-000000000001', v_tenant_id,
     'AUET', 'Athyper UAE Trading', 'Athyper Group subsidiary — UAE Trading',
     'AE', 'AED', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 6. ASAH — Athyper Saudi Hospitality (SA, SAR)
    ('dd000020-0000-0000-0000-000000000001', v_tenant_id,
     'ASAH', 'Athyper Saudi Hospitality', 'Athyper Group subsidiary — Saudi Hospitality',
     'SA', 'SAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 7. AUIC — Athyper US InfoComm (US, USD)
    ('dd000021-0000-0000-0000-000000000001', v_tenant_id,
     'AUIC', 'Athyper US InfoComm', 'Athyper Group subsidiary — US Information & Communication',
     'US', 'USD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'us_gaap',
     v_meta, 'active', v_su),

    -- 8. ASGF — Athyper Singapore Financial (SG, SGD)
    ('dd000022-0000-0000-0000-000000000001', v_tenant_id,
     'ASGF', 'Athyper Singapore Financial', 'Athyper Group subsidiary — Singapore Financial Services',
     'SG', 'SGD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 9. AITM — Athyper India Textile Mfg (IN, INR, fiscal=April)
    ('dd000023-0000-0000-0000-000000000001', v_tenant_id,
     'AITM', 'Athyper India Textile Mfg', 'Athyper Group subsidiary — India Textile Manufacturing',
     'IN', 'INR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 10. ACFB — Athyper Canada Food & Bev (CA, CAD)
    ('dd000024-0000-0000-0000-000000000001', v_tenant_id,
     'ACFB', 'Athyper Canada Food & Bev', 'Athyper Group subsidiary — Canada Food & Beverage',
     'CA', 'CAD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 11. ADPM — Athyper Germany Pharma (DE, EUR)
    ('dd000025-0000-0000-0000-000000000001', v_tenant_id,
     'ADPM', 'Athyper Germany Pharma', 'Athyper Group subsidiary — Germany Pharmaceuticals',
     'DE', 'EUR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 12. ATEM — Athyper Taiwan Electronics (TW, TWD)
    ('dd000026-0000-0000-0000-000000000001', v_tenant_id,
     'ATEM', 'Athyper Taiwan Electronics', 'Athyper Group subsidiary — Taiwan Electronics Manufacturing',
     'TW', 'TWD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 13. ASPE — Athyper SA Petroleum (ZA, ZAR)
    ('dd000027-0000-0000-0000-000000000001', v_tenant_id,
     'ASPE', 'Athyper SA Petroleum', 'Athyper Group subsidiary — South Africa Petroleum',
     'ZA', 'ZAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 14. AUKA — Athyper UK Agriculture (GB, GBP)
    ('dd000028-0000-0000-0000-000000000001', v_tenant_id,
     'AUKA', 'Athyper UK Agriculture', 'Athyper Group subsidiary — UK Agriculture',
     'GB', 'GBP', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 15. AJED — Athyper Japan Education (JP, JPY)
    ('dd000029-0000-0000-0000-000000000001', v_tenant_id,
     'AJED', 'Athyper Japan Education', 'Athyper Group subsidiary — Japan Education',
     'JP', 'JPY', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 16. APHS — Athyper Philippines Hospital (PH, PHP)
    ('dd000030-0000-0000-0000-000000000001', v_tenant_id,
     'APHS', 'Athyper Philippines Hospital', 'Athyper Group subsidiary — Philippines Healthcare',
     'PH', 'PHP', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[201_athyper_subsidiaries] 16 legal entities inserted (or already present)';

    -- ── Company Codes (16 subsidiaries) ──────────────────────────────────────
    --
    -- One company_code per subsidiary.  The code must match KC org
    -- attribute entity_code (UPPERCASE).  fiscal_year_start_month = 4
    -- for India (AITM), 1 for all others.
    --
    -- Column order: id, tenant_id, code, name, legal_entity_id,
    --               functional_currency, fiscal_year_start_month,
    --               fiscal_year_variant, regulatory_framework,
    --               is_intercompany_enabled, metadata, status, created_by

    INSERT INTO master.company_code (
        id, tenant_id,
        code, name, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    ) VALUES

    ('ee000015-0000-0000-0000-000000000001', v_tenant_id,
     'AMRE', 'Athyper Malaysia Real Estate',
     'dd000015-0000-0000-0000-000000000001',
     'MYR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000016-0000-0000-0000-000000000001', v_tenant_id,
     'AQTU', 'Athyper Qatar Utilities',
     'dd000016-0000-0000-0000-000000000001',
     'QAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000017-0000-0000-0000-000000000001', v_tenant_id,
     'ASAC', 'Athyper Saudi Construction',
     'dd000017-0000-0000-0000-000000000001',
     'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000018-0000-0000-0000-000000000001', v_tenant_id,
     'AQTS', 'Athyper Qatar Transport',
     'dd000018-0000-0000-0000-000000000001',
     'QAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000019-0000-0000-0000-000000000001', v_tenant_id,
     'AUET', 'Athyper UAE Trading',
     'dd000019-0000-0000-0000-000000000001',
     'AED', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000020-0000-0000-0000-000000000001', v_tenant_id,
     'ASAH', 'Athyper Saudi Hospitality',
     'dd000020-0000-0000-0000-000000000001',
     'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000021-0000-0000-0000-000000000001', v_tenant_id,
     'AUIC', 'Athyper US InfoComm',
     'dd000021-0000-0000-0000-000000000001',
     'USD', 1, 'calendar', 'us_gaap',    true, v_meta, 'active', v_su),

    ('ee000022-0000-0000-0000-000000000001', v_tenant_id,
     'ASGF', 'Athyper Singapore Financial',
     'dd000022-0000-0000-0000-000000000001',
     'SGD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000023-0000-0000-0000-000000000001', v_tenant_id,
     'AITM', 'Athyper India Textile Mfg',
     'dd000023-0000-0000-0000-000000000001',
     'INR', 4, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000024-0000-0000-0000-000000000001', v_tenant_id,
     'ACFB', 'Athyper Canada Food & Bev',
     'dd000024-0000-0000-0000-000000000001',
     'CAD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000025-0000-0000-0000-000000000001', v_tenant_id,
     'ADPM', 'Athyper Germany Pharma',
     'dd000025-0000-0000-0000-000000000001',
     'EUR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000026-0000-0000-0000-000000000001', v_tenant_id,
     'ATEM', 'Athyper Taiwan Electronics',
     'dd000026-0000-0000-0000-000000000001',
     'TWD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000027-0000-0000-0000-000000000001', v_tenant_id,
     'ASPE', 'Athyper SA Petroleum',
     'dd000027-0000-0000-0000-000000000001',
     'ZAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000028-0000-0000-0000-000000000001', v_tenant_id,
     'AUKA', 'Athyper UK Agriculture',
     'dd000028-0000-0000-0000-000000000001',
     'GBP', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000029-0000-0000-0000-000000000001', v_tenant_id,
     'AJED', 'Athyper Japan Education',
     'dd000029-0000-0000-0000-000000000001',
     'JPY', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000030-0000-0000-0000-000000000001', v_tenant_id,
     'APHS', 'Athyper Philippines Hospital',
     'dd000030-0000-0000-0000-000000000001',
     'PHP', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[201_athyper_subsidiaries] 16 company codes inserted (or already present)';

END $athyper_subs$;
