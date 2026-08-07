-- ============================================================================
-- CIRRUSATLANTIC — LEGAL ENTITY AND COMPANY CODE
-- ============================================================================
-- seed-pack-version: 2.1.0
-- Dataset:  cirrusatlantic.organization-root
-- Version:  2.1.0
-- Plane:    neon
-- Depends:  cirrusatlantic.tenant 2.0.0
-- Natural keys: (tenant_id, code)
-- Idempotent: convergent updates; identity and created_* are preserved
-- ============================================================================

DO $catl_organization_root$
DECLARE
    v_su constant uuid :=
        md5('neon:principal:athyper:cirrusatlantic:seed-service')::uuid;
    v_tid uuid;
    v_legal_entity_id uuid;
    v_metadata constant jsonb :=
        '{"_seed":{"pack":"cirrusatlantic.organization-root","version":"2.1.0"}}'::jsonb;
BEGIN
    SELECT id
      INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[200_legal_entities] CirrusAtlantic tenant not found';
    END IF;

    INSERT INTO master.legal_entity (
        id, tenant_id, canonical_party_id, code, name, display_name, legal_name, entity_type,
        registration_country_code, functional_currency, reporting_currency,
        metadata, status, created_by
    ) VALUES (
        'dd000030-0000-0000-0000-000000000001', v_tid, md5('athyper:canonical-party:cirrusatlantic')::uuid, 'catl',
        'CirrusAtlantic Ltd', 'CirrusAtlantic Limited', 'CirrusAtlantic Limited',
        'company', 'GB', 'GBP', 'GBP', v_metadata, 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                      = EXCLUDED.name,
        display_name              = EXCLUDED.display_name,
        legal_name                = EXCLUDED.legal_name,
        canonical_party_id        = EXCLUDED.canonical_party_id,
        entity_type               = EXCLUDED.entity_type,
        registration_country_code = EXCLUDED.registration_country_code,
        functional_currency       = EXCLUDED.functional_currency,
        reporting_currency        = EXCLUDED.reporting_currency,
        metadata                  = master.legal_entity.metadata || EXCLUDED.metadata,
        status                    = EXCLUDED.status,
        updated_at                = now(),
        updated_by                = v_su
    WHERE (
        master.legal_entity.name,
        master.legal_entity.display_name,
        master.legal_entity.legal_name,
        master.legal_entity.canonical_party_id,
        master.legal_entity.entity_type,
        master.legal_entity.registration_country_code,
        master.legal_entity.functional_currency,
        master.legal_entity.reporting_currency,
        master.legal_entity.metadata,
        master.legal_entity.status
    ) IS DISTINCT FROM (
        EXCLUDED.name,
        EXCLUDED.display_name,
        EXCLUDED.legal_name,
        EXCLUDED.canonical_party_id,
        EXCLUDED.entity_type,
        EXCLUDED.registration_country_code,
        EXCLUDED.functional_currency,
        EXCLUDED.reporting_currency,
        master.legal_entity.metadata || EXCLUDED.metadata,
        EXCLUDED.status
    );

    SELECT id
      INTO v_legal_entity_id
      FROM master.legal_entity
     WHERE tenant_id = v_tid
       AND code = 'catl';

    INSERT INTO master.company_code (
        id, tenant_id, legal_entity_id, code, name, display_name, description,
        functional_currency, country_code, fiscal_year_start_month,
        timezone_code, locale_code, metadata, status, created_by
    ) VALUES (
        'ee000030-0000-0000-0000-000000000001', v_tid, v_legal_entity_id, 'catl',
        'CirrusAtlantic Ltd', 'CirrusAtlantic Limited',
        'CirrusAtlantic UK accounting and balancing entity',
        'GBP', 'GB', 4, 'Europe/London', 'en-GB', v_metadata, 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        legal_entity_id        = EXCLUDED.legal_entity_id,
        name                   = EXCLUDED.name,
        display_name           = EXCLUDED.display_name,
        description            = EXCLUDED.description,
        functional_currency    = EXCLUDED.functional_currency,
        country_code           = EXCLUDED.country_code,
        fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
        timezone_code          = EXCLUDED.timezone_code,
        locale_code            = EXCLUDED.locale_code,
        metadata               = master.company_code.metadata || EXCLUDED.metadata,
        status                 = EXCLUDED.status,
        updated_at             = now(),
        updated_by             = v_su
    WHERE (
        master.company_code.legal_entity_id,
        master.company_code.name,
        master.company_code.display_name,
        master.company_code.description,
        master.company_code.functional_currency,
        master.company_code.country_code,
        master.company_code.fiscal_year_start_month,
        master.company_code.timezone_code,
        master.company_code.locale_code,
        master.company_code.metadata,
        master.company_code.status
    ) IS DISTINCT FROM (
        EXCLUDED.legal_entity_id,
        EXCLUDED.name,
        EXCLUDED.display_name,
        EXCLUDED.description,
        EXCLUDED.functional_currency,
        EXCLUDED.country_code,
        EXCLUDED.fiscal_year_start_month,
        EXCLUDED.timezone_code,
        EXCLUDED.locale_code,
        master.company_code.metadata || EXCLUDED.metadata,
        EXCLUDED.status
    );

    IF v_legal_entity_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.company_code
         WHERE tenant_id = v_tid
           AND legal_entity_id = v_legal_entity_id
           AND code = 'catl'
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[200_legal_entities] organization-root assertion failed';
    END IF;

    RAISE NOTICE '[200_legal_entities] legal entity catl and company code catl ready';
END
$catl_organization_root$;
