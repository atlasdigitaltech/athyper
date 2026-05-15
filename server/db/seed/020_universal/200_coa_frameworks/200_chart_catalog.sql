-- ============================================================================
-- UNIVERSAL — CHART OF ACCOUNTS CATALOG
-- ============================================================================
-- File:     200_chart_catalog.sql
-- Schema:   master.chart_of_account
-- Purpose:  Two selectable operating charts of accounts:
--           COA-IFRS and COA-GAAP.
--           The shared group reporting taxonomy is internal and is seeded by
--           210_group_chart_accounts.sql as COA-GROUP.
-- Depends:  010_platform/099_tenant_bootstrap (tenant must exist)
-- Idempotent: Yes - ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: COA Framework Catalog
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '200_chart_catalog';
    v_version  text := '2.0.0';
    v_meta     jsonb;
    v_count    int;
BEGIN
    -- Stage A: Resolve tenant.
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    v_meta := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        ),
        '_chart_role',   'operating',
        '_selectable',   true,
        '_operating_coa', true
    );

    -- Stage B: Stage the two operating COAs.
    CREATE TEMP TABLE tmp_coa (
        seed_id        uuid DEFAULT shared.uuidv7(),
        code           text NOT NULL,
        name           text NOT NULL,
        description    text,
        framework      text NOT NULL,
        country_code   char(2),
        account_range  text NOT NULL DEFAULT '1000-9999',
        version        int  NOT NULL DEFAULT 1,
        is_locked      boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_coa (code, name, description, framework, country_code) VALUES
    ('COA-IFRS', 'IFRS Operating Chart',    'Standard IFRS operating chart',    'ifrs',    NULL),
    ('COA-GAAP', 'US GAAP Operating Chart', 'Standard US GAAP operating chart', 'us_gaap', 'US');

    -- Stage C: Upsert into master.chart_of_account.
    INSERT INTO master.chart_of_account (
        id, tenant_id, code, name, description,
        framework, country_code, account_range,
        version, is_locked,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, t.code, t.name, t.description,
        t.framework, t.country_code, t.account_range,
        t.version, t.is_locked,
        v_meta, 'active', v_su
    FROM tmp_coa t
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        description    = EXCLUDED.description,
        framework      = EXCLUDED.framework,
        country_code   = EXCLUDED.country_code,
        account_range  = EXCLUDED.account_range,
        version        = EXCLUDED.version,
        is_locked      = EXCLUDED.is_locked,
        metadata       = master.chart_of_account.metadata || v_meta,
        status         = 'active',
        updated_at     = now(),
        updated_by     = v_su;

    -- Stage D: Assertions.
    SELECT count(*) INTO v_count
    FROM master.chart_of_account
    WHERE tenant_id = v_tid
      AND code IN ('COA-IFRS', 'COA-GAAP')
      AND status = 'active'
      AND metadata->>'_chart_role' = 'operating'
      AND (metadata->>'_selectable')::boolean = true;

    IF v_count <> 2 THEN
        RAISE EXCEPTION '[200_chart_catalog] Expected 2 active selectable operating COAs, got %', v_count;
    END IF;

    RAISE NOTICE '[200_chart_catalog] Operating COA catalog seeded: COA-IFRS, COA-GAAP';

END $seed$;
