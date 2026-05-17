-- 030_tenant/entity_engine/010_entity_policies.sql
-- Seeds control.entity_policy rows for the Athyper blueprint tenant.
-- entity_policy is globally unique per entity (UNIQUE on entity_id, entity_version_id)
-- so this file seeds system-level policies owned by the Athyper tenant.
-- Idempotent: ON CONFLICT (entity_id, entity_version_id) DO NOTHING
-- Run AFTER: 010_system/entity_engine/020_entities/*.sql + 030_tenant/000_tenant/000_athyper_tenant.sql

DO $$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    cnt         int  := 0;
    r           record;
BEGIN
    v_tenant_id := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── Seed one entity_policy per master.* entity using defaults ────────────
    -- access_mode    : 'default_deny'   — safe default; tenants override per entity
    -- audit_mode     : 'enabled'        — full audit trail for all entities
    -- company_scope  : 'none'           — no company-code scoping by default
    -- Highly sensitive entities get audit_mode='enabled'; LOG/RELATION entities get 'disabled'
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
              WHERE  ep.entity_id = e.id AND ep.entity_version_id IS NULL
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
            NULL,  -- applies to all versions
            'default_deny',
            CASE r.entity_class
                WHEN 'DOCUMENT' THEN 'single'  -- documents are company-code scoped
                WHEN 'LOG'      THEN 'single'
                ELSE 'none'
            END,
            CASE r.entity_class
                WHEN 'LOG'      THEN 'sampling'  -- logs use sampling to reduce noise
                WHEN 'RELATION' THEN 'disabled'  -- pure join tables skip audit
                ELSE 'enabled'
            END,
            '{}',  -- retention_policy: no expiry by default
            '{}',  -- default_filters:  no static filters
            '{}',  -- cache_flags:      no caching hints
            v_su
        );
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
           'default_deny', 'none', 'enabled',
           '{}', '{}', '{}', v_su
    FROM   control.entity e
    WHERE  e.entity_code = 'bank_account_house_config'
    ON CONFLICT ON CONSTRAINT ep_tenant_entity_version_uq DO NOTHING;

    RAISE NOTICE 'control.entity_policy: % rows inserted for tenant %', cnt, v_tenant_id;
END $$;
