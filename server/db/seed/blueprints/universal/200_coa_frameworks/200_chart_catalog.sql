-- Two selectable operating charts of accounts: COA-IFRS and COA-GAAP.
-- The internal shared group-reporting taxonomy (COA-GROUP) is seeded
-- separately by 210_group_chart_accounts.sql.

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_pack     text := '200_chart_catalog';
    v_version  text := '2.0.0';
    v_meta     jsonb;
    v_count    int;
BEGIN
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
        updated_by     = v_su
    WHERE (master.chart_of_account.name,master.chart_of_account.description,
           master.chart_of_account.framework,master.chart_of_account.country_code,
           master.chart_of_account.account_range,master.chart_of_account.version,
           master.chart_of_account.is_locked,master.chart_of_account.status)
      IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.framework,
           EXCLUDED.country_code,EXCLUDED.account_range,EXCLUDED.version,
           EXCLUDED.is_locked,'active'::master.finance_setup_status_d)
       OR master.chart_of_account.metadata->>'_chart_role' IS DISTINCT FROM 'operating'
       OR master.chart_of_account.metadata->>'_selectable' IS DISTINCT FROM 'true'
       OR master.chart_of_account.metadata->>'_operating_coa' IS DISTINCT FROM 'true';

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

    DROP TABLE IF EXISTS tmp_candidate_chart_assignments;
    CREATE TEMP TABLE tmp_candidate_chart_assignments AS
    SELECT
        md5('wave5:operating-chart:'||v_tid||':'||company.id)::uuid AS assignment_id,
        company.id AS company_code_id,
        chart.id AS chart_of_account_id,
        v_su AS created_by
    FROM master.company_code company
    JOIN master.chart_of_account chart ON chart.tenant_id=v_tid
      AND chart.code = CASE WHEN company.country_code='US' THEN 'COA-GAAP' ELSE 'COA-IFRS' END
    WHERE company.tenant_id=v_tid AND company.status='active';

    UPDATE master.company_code_chart_assignment AS t
       SET is_primary = false,
           status = 'retired',
           updated_at = now(),
           updated_by = v_su
    WHERE t.tenant_id = v_tid
      AND t.assignment_type = 'operating'
      AND t.status = 'active'
      AND t.is_primary = true
      AND EXISTS (
          SELECT 1
          FROM tmp_candidate_chart_assignments c
          WHERE c.company_code_id = t.company_code_id
      );

    INSERT INTO master.company_code_chart_assignment(
        id,tenant_id,company_code_id,chart_of_account_id,assignment_type,
        is_primary,effective_from,metadata,status,created_by
    )
    SELECT
           c.assignment_id,
           v_tid,
           c.company_code_id,
           c.chart_of_account_id,
           'operating',
           true,
           DATE '2020-01-01',
           '{"_seed":{"pack":"200_chart_catalog","version":"2.0.0"}}'::jsonb,
           'active',
           c.created_by
    FROM tmp_candidate_chart_assignments c
    ON CONFLICT(tenant_id,company_code_id,chart_of_account_id,assignment_type) DO UPDATE SET
      is_primary=excluded.is_primary,effective_from=excluded.effective_from,
      metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_su
    WHERE (master.company_code_chart_assignment.is_primary,
           master.company_code_chart_assignment.effective_from,
           master.company_code_chart_assignment.metadata,
           master.company_code_chart_assignment.status)
      IS DISTINCT FROM (excluded.is_primary,excluded.effective_from,excluded.metadata,
                        'active'::master.finance_setup_status_d);

    RAISE NOTICE '[200_chart_catalog] Operating COA catalog seeded: COA-IFRS, COA-GAAP';

END $seed$;
