-- ============================================================================
-- ATHYPER GROUP - COMPANY CODE CHART ASSIGNMENTS
-- ============================================================================
-- File:     201_company_chart_assignments.sql
-- Schema:   master.company_code_chart_assignment
-- Purpose:  One primary operating COA assignment per company code.
--           The internal COA-GROUP reporting taxonomy is not assigned to
--           company codes; operating GL accounts point to it through
--           metadata._group_map.
-- Depends:  199_gl_preseed.sql (company codes), 200_chart_catalog.sql (charts)
-- Idempotent: Yes - ON CONFLICT DO UPDATE
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '201_company_assignments';
    v_version  text := '3.0.0';
    v_expected int;
    v_oper     int;
    v_stale    int;
BEGIN
    -- Resolve tenant.
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        SELECT id INTO v_tid
        FROM master.tenant
        WHERE realm_key = 'athyper'
          AND code = 'athyper';
    END IF;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[201_company_assignments] athyper tenant not found';
    END IF;

    CREATE TEMP TABLE tmp_cc_map ON COMMIT DROP AS
        SELECT code, id, regulatory_framework
        FROM master.company_code
        WHERE tenant_id = v_tid
          AND status = 'active';

    CREATE TEMP TABLE tmp_coa_map ON COMMIT DROP AS
        SELECT code, id
        FROM master.chart_of_account
        WHERE tenant_id = v_tid
          AND code IN ('COA-IFRS', 'COA-GAAP');

    CREATE TEMP TABLE tmp_assign (
        cc_code     text NOT NULL,
        coa_code    text NOT NULL,
        assign_type text NOT NULL,
        is_primary  boolean NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary)
    SELECT
        cc.code,
        CASE
            WHEN cc.regulatory_framework = 'us_gaap'
             AND EXISTS (
                 SELECT 1
                 FROM tmp_coa_map coa
                 JOIN master.gl_account ga
                   ON ga.tenant_id = v_tid
                  AND ga.chart_of_account_id = coa.id
                  AND ga.node_type = 'posting'
                  AND ga.is_active = true
                 WHERE coa.code = 'COA-GAAP'
                 LIMIT 1
             )
            THEN 'COA-GAAP'
            WHEN EXISTS (
                 SELECT 1
                 FROM tmp_coa_map coa
                 JOIN master.gl_account ga
                   ON ga.tenant_id = v_tid
                  AND ga.chart_of_account_id = coa.id
                  AND ga.node_type = 'posting'
                  AND ga.is_active = true
                 WHERE coa.code = 'COA-IFRS'
                 LIMIT 1
             )
            THEN 'COA-IFRS'
            WHEN EXISTS (
                 SELECT 1
                 FROM tmp_coa_map coa
                 JOIN master.gl_account ga
                   ON ga.tenant_id = v_tid
                  AND ga.chart_of_account_id = coa.id
                  AND ga.node_type = 'posting'
                  AND ga.is_active = true
                 WHERE coa.code = 'COA-GAAP'
                 LIMIT 1
             )
            THEN 'COA-GAAP'
            ELSE 'COA-IFRS'
        END,
        'operating',
        true
    FROM tmp_cc_map cc;

    SELECT count(*) INTO v_expected FROM tmp_assign;

    -- Remove obsolete group/local assignments and old operating assignments
    -- that point to a different COA than the current framework choice.
    DELETE FROM master.company_code_chart_assignment cca
    USING master.chart_of_account coa
    WHERE cca.tenant_id = v_tid
      AND coa.id = cca.chart_of_account_id
      AND cca.assignment_type IN ('group', 'local');

    DELETE FROM master.company_code_chart_assignment cca
    USING master.company_code cc,
          master.chart_of_account coa,
          tmp_assign a
    WHERE cca.tenant_id = v_tid
      AND cc.tenant_id = v_tid
      AND coa.tenant_id = v_tid
      AND cc.id = cca.company_code_id
      AND coa.id = cca.chart_of_account_id
      AND a.cc_code = cc.code
      AND cca.assignment_type = 'operating'
      AND coa.code <> a.coa_code;

    INSERT INTO master.company_code_chart_assignment (
        tenant_id, company_code_id, chart_of_account_id,
        assignment_type, is_primary, effective_from,
        metadata, status, created_by
    )
    SELECT
        v_tid,
        cc.id,
        coa.id,
        a.assign_type,
        a.is_primary,
        CURRENT_DATE,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_assign a
    JOIN tmp_cc_map  cc  ON cc.code  = a.cc_code
    JOIN tmp_coa_map coa ON coa.code = a.coa_code
    ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type)
    DO UPDATE SET
        is_primary     = EXCLUDED.is_primary,
        effective_from = EXCLUDED.effective_from,
        metadata       = master.company_code_chart_assignment.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            )),
        status     = 'active',
        updated_at = now(),
        updated_by = v_su;

    SELECT count(*) INTO v_oper
    FROM master.company_code_chart_assignment cca
    WHERE cca.tenant_id = v_tid
      AND cca.metadata->'_seed'->>'pack' = v_pack
      AND cca.assignment_type = 'operating'
      AND cca.is_active = true;

    SELECT count(*) INTO v_stale
    FROM master.company_code_chart_assignment cca
    WHERE cca.tenant_id = v_tid
      AND cca.assignment_type IN ('group', 'local')
      AND cca.is_active = true;

    IF v_oper <> v_expected THEN
        RAISE EXCEPTION '[201_company_assignments] Expected % operating assignments, got %', v_expected, v_oper;
    END IF;

    IF v_stale <> 0 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected no active group/local COA assignments, got %', v_stale;
    END IF;

    RAISE NOTICE '[201_company_assignments] athyper: % primary operating COA assignments', v_oper;

END $seed$;
