-- ============================================================================
-- CIRRUSATLANTIC — LEGAL ENTITY & COMPANY CODE
-- ============================================================================
-- File:     200_legal_entities.sql
-- Schemas:  master.legal_entity, master.company_code
-- Purpose:  One legal entity (LE-CATL) and one company code (CATL).
-- Depends:  000_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO NOTHING
-- Stable IDs:
--   Legal entity  : dd000030-0000-0000-0000-000000000001
--   Company code  : ee000030-0000-0000-0000-000000000001
-- ============================================================================

DO $catl_le$
DECLARE
    v_su   uuid  := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '200_catl_le', 'version', '1.0.0', 'seeded_at', now()::text
    ));
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[200_legal_entities] CirrusAtlantic tenant not found';
    END IF;

    -- ── Legal Entity ──────────────────────────────────────────────────────
    INSERT INTO master.legal_entity (
        id, tenant_id,
        code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct,
        regulatory_framework, metadata, status, created_by
    ) VALUES (
        'dd000030-0000-0000-0000-000000000001',
        v_tid,
        'CATL', 'CirrusAtlantic Ltd',        'CirrusAtlantic operating entity (UK)',
        'GB', 'GBP', 'GBP', 'standalone', NULL,
        'full', 100.00, 'ifrs',
        v_meta, 'active', v_su
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id             = EXCLUDED.tenant_id,
        code                  = EXCLUDED.code,
        name                  = EXCLUDED.name,
        country_code          = EXCLUDED.country_code,
        functional_currency   = EXCLUDED.functional_currency,
        reporting_currency    = EXCLUDED.reporting_currency,
        entity_type           = EXCLUDED.entity_type,
        parent_entity_id      = EXCLUDED.parent_entity_id,
        consolidation_method  = EXCLUDED.consolidation_method,
        regulatory_framework  = EXCLUDED.regulatory_framework,
        status                = EXCLUDED.status,
        updated_at            = now(),
        updated_by            = v_su;

    -- ── Company Code ─────────────────────────────────────────────────────
    INSERT INTO master.company_code (
        id, tenant_id,
        code, name, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    ) VALUES (
        'ee000030-0000-0000-0000-000000000001',
        v_tid,
        'CATL', 'CirrusAtlantic Ltd',
        'dd000030-0000-0000-0000-000000000001',
        'GBP', 4, 'custom',  -- April fiscal year start (non-calendar)
        'ifrs', false,
        v_meta, 'active', v_su
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id                  = EXCLUDED.tenant_id,
        code                       = EXCLUDED.code,
        name                       = EXCLUDED.name,
        legal_entity_id            = EXCLUDED.legal_entity_id,
        functional_currency        = EXCLUDED.functional_currency,
        fiscal_year_start_month    = EXCLUDED.fiscal_year_start_month,
        fiscal_year_variant        = EXCLUDED.fiscal_year_variant,
        regulatory_framework       = EXCLUDED.regulatory_framework,
        is_intercompany_enabled    = EXCLUDED.is_intercompany_enabled,
        status                     = EXCLUDED.status,
        updated_at                 = now(),
        updated_by                 = v_su;

    RAISE NOTICE '[200_legal_entities] 1 legal entity (CATL) + 1 company code (CATL) seeded';

END $catl_le$;
