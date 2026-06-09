-- ============================================================================
-- TECHNOSTAT — ENTITY POLICIES
-- ============================================================================
-- File:     001_entity_policies.sql
-- Schema:   control.entity_policy
-- Purpose:  Seed one entity_policy per system-owned master.* entity for
--           Technostat. Uses safe defaults (default_deny / audit enabled).
-- Depends:  003_technostat_production_seed.sql, seed/platform/004_entity_engine/
-- Idempotent: Yes — ON CONFLICT (tenant_id, entity_id, entity_version_id) DO NOTHING
-- ============================================================================

DO $$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    cnt         int  := 0;
    r           record;
BEGIN
    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[001_entity_policies] Technostat tenant not found';
    END IF;

    -- Seed one entity_policy per master.* system-owned entity using defaults.
    -- NOTE: bank_account_house_config is excluded here — seeded explicitly below
    --       as a demo-only entity (Athyper/Technostat/CirrusAtlantic only).
    FOR r IN
        SELECT e.id AS entity_id, e.entity_class
        FROM   control.entity e
        WHERE  e.table_schema = 'master'
          AND  e.ownership_model = 'system'
          AND  e.entity_code != 'bank_account_house_config'
          AND  NOT EXISTS (
              SELECT 1 FROM control.entity_policy ep
              WHERE  ep.entity_id = e.id
                AND  ep.entity_version_id IS NULL
                AND  ep.tenant_id = v_tenant_id
          )
        ORDER BY e.name
    LOOP
        INSERT INTO control.entity_policy (
            tenant_id, entity_id, entity_version_id,
            access_mode, company_scope_mode, audit_mode,
            retention_policy, default_filters, cache_flags,
            created_by
        ) VALUES (
            v_tenant_id,
            r.entity_id,
            NULL,
            'default_allow',
            CASE r.entity_class
                WHEN 'DOCUMENT' THEN 'single'
                WHEN 'LOG'      THEN 'single'
                ELSE 'none'
            END,
            CASE r.entity_class
                WHEN 'LOG'      THEN 'sampling'
                WHEN 'RELATION' THEN 'disabled'
                ELSE 'enabled'
            END,
            '{}',
            '{}',
            '{}',
            v_su
        )
        ON CONFLICT ON CONSTRAINT ep_tenant_entity_version_uq DO NOTHING;
        cnt := cnt + 1;
    END LOOP;

    -- ── bank_account_house_config: demo tenants only (Athyper · Technostat · CirrusAtlantic) ──
    INSERT INTO control.entity_policy (
        tenant_id, entity_id, entity_version_id,
        access_mode, company_scope_mode, audit_mode,
        retention_policy, default_filters, cache_flags,
        created_by
    )
    SELECT v_tenant_id, e.id, NULL,
           'default_allow', 'none', 'enabled',
           '{}', '{}', '{}', v_su
    FROM   control.entity e
    WHERE  e.entity_code = 'bank_account_house_config'
    ON CONFLICT ON CONSTRAINT ep_tenant_entity_version_uq DO NOTHING;

    UPDATE control.entity_policy ep
       SET access_mode = 'default_allow',
           updated_at = now(),
           updated_by = v_su
      FROM control.entity e
     WHERE ep.tenant_id = v_tenant_id
       AND ep.entity_id = e.id
       AND e.table_schema = 'master'
       AND e.ownership_model = 'system'
       AND ep.access_mode = 'default_deny';

    RAISE NOTICE '[001_entity_policies] % entity policies seeded for Technostat', cnt;
END;
$$;
