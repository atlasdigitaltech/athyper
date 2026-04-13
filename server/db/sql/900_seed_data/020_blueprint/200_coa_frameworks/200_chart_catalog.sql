-- ============================================================================
-- ATHYPER GROUP — CHART OF ACCOUNTS CATALOG
-- ============================================================================
-- File:     200_chart_catalog.sql
-- Schema:   master.chart_of_account
-- Purpose:  7 charts of accounts (1 group consolidation + 1 IFRS operating
--           + 5 local GAAP variants) per §18.1
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §18.1 Chart Catalog
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '200_chart_catalog';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_count    int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Stage chart rows
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_coa (
        seed_id        uuid DEFAULT shared.uuidv7(),
        code           text NOT NULL,
        name           text NOT NULL,
        description    text,
        framework      text NOT NULL,
        country_code   char(2),           -- NULL for framework-only charts
        account_range  text NOT NULL DEFAULT '1000-9999',
        version        int  NOT NULL DEFAULT 1,
        is_locked      boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_coa (code, name, description, framework, country_code) VALUES
    ('COA-IFRS-GROUP', 'IFRS Group Consolidation Chart',  'Group consolidation chart for ATHYPER holdings',          'ifrs',       NULL),
    ('COA-IFRS',       'IFRS Operating Chart',            'Standard IFRS-converged operating chart (12 companies)',  'ifrs',       NULL),
    ('COA-USGAAP',     'US GAAP Operating Chart',         'US GAAP operating chart for US subsidiary',               'us_gaap',    'US'),
    ('COA-HGB',        'HGB Operating Chart',             'German HGB operating chart',                              'local_gaap', 'DE'),
    ('COA-INDAS',      'Ind AS Operating Chart',           'Indian Ind AS operating chart',                           'local_gaap', 'IN'),
    ('COA-JGAAP',      'J-GAAP Operating Chart',          'Japanese J-GAAP operating chart',                         'local_gaap', 'JP'),
    ('COA-SOCPA',      'SOCPA Operating Chart',           'Saudi SOCPA operating chart',                             'local_gaap', 'SA');

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT into master.chart_of_account
    -- ══════════════════════════════════════════════════════════════════════

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
        metadata       = master.chart_of_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.chart_of_account.name, master.chart_of_account.description,
           master.chart_of_account.framework, master.chart_of_account.country_code,
           master.chart_of_account.account_range, master.chart_of_account.version,
           master.chart_of_account.is_locked)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.framework, EXCLUDED.country_code,
           EXCLUDED.account_range, EXCLUDED.version,
           EXCLUDED.is_locked);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_count
    FROM master.chart_of_account
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_count <> 7 THEN
        RAISE EXCEPTION '[200_chart_catalog] Expected 7 charts of account, got %', v_count;
    END IF;

    RAISE NOTICE '[200_chart_catalog] Chart catalog seeded: % charts of account', v_count;

END $seed$;
