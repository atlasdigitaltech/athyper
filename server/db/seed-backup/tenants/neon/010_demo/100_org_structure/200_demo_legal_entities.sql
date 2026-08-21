-- ============================================================================
-- ATHYPER MASTER TENANT — ATHQ LEGAL ENTITY & COMPANY CODE
-- ============================================================================
-- File:     200_demo_legal_entities.sql
-- Schemas:  master.legal_entity, master.company_code
-- Purpose:  Seed the ATHQ legal entity and company code for the athyper
--           master tenant. Required for KC org alias resolution:
--           KC org athyper--athq → tenant='athyper', entity_code='ATHQ'.
-- Depends:  000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO NOTHING
-- Stable IDs:
--   Legal entity : dd000014-0000-0000-0000-000000000001
--   Company code : ee000014-0000-0000-0000-000000000001
-- ============================================================================

DO $demo_le$
DECLARE
    v_su   uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '200_demo_le', 'version', '1.0.0', 'seeded_at', now()::text
    ));
BEGIN

    -- ── Legal Entity (1) ────────────────────────────────────────────────────
    -- KC org athyper--athq maps to tenant code 'athyper' with entity ATHQ.
    -- A matching legal entity + company_code row is required for session resolution.

    INSERT INTO master.legal_entity (
        id, tenant_id,
        code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct,
        regulatory_framework, metadata, status, created_by
    ) VALUES
    ('dd000014-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'ATHQ', 'Athyper Group Holdings',            'Athyper master holding entity',
     'AE', 'AED', 'USD', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ── Company Code (1) ────────────────────────────────────────────────────

    INSERT INTO master.company_code (
        id, tenant_id,
        code, name, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    ) VALUES
    ('ee000014-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'ATHQ', 'Athyper Group Holdings',
     'dd000014-0000-0000-0000-000000000001',
     'AED', 1, 'calendar', 'ifrs', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[200_demo_legal_entities] 1 legal entity + 1 company code seeded';

END $demo_le$;
