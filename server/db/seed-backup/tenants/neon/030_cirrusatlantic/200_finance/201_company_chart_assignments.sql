-- seed-pack-version: 4.0.0
-- ============================================================================
-- CIRRUSATLANTIC - COMPANY CODE CHART ASSIGNMENTS
-- ============================================================================
-- File:     201_company_chart_assignments.sql
-- Schema:   master.company_code_chart_assignment
-- Purpose:  One primary operating COA assignment per active company code.
--           Framework rule is common across tenants:
--             US company codes -> COA-GAAP
--             all others       -> COA-IFRS
-- Depends:  tenant company codes, universal COA catalog/accounts
-- Idempotent: Yes - ON CONFLICT DO UPDATE
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_pack     text := '201_company_assignments';
    v_version  text := '4.0.0';
    v_expected int;
    v_oper     int;
    v_stale    int;
    v_missing  text;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        SELECT id INTO v_tid
        FROM master.tenant
        WHERE realm_key = 'athyper'
          AND code = 'cirrusatlantic';
    END IF;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[201_company_assignments] cirrusatlantic tenant not found';
    END IF;

    IF v_su IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id = v_su
          AND p.tenant_id = v_tid
          AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION '[201_company_assignments] app.current_principal_id must identify an active tenant-local principal';
    END IF;

    -- The universal COA pack should have created both operating charts and
    -- their posting accounts for this tenant. Fail here instead of cloning from
    -- another tenant, so provisioning gaps stay visible.
    SELECT string_agg(coa_code, ', ' ORDER BY coa_code)
    INTO v_missing
    FROM (VALUES ('COA-IFRS'), ('COA-GAAP')) AS required(coa_code)
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.chart_of_account coa
        JOIN master.gl_account ga
          ON ga.tenant_id = coa.tenant_id
         AND ga.chart_of_account_id = coa.id
         AND ga.node_type = 'posting'
         AND ga.is_active = true
        WHERE coa.tenant_id = v_tid
          AND coa.code = required.coa_code
          AND coa.status = 'active'
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[201_company_assignments] Missing universal COA posting accounts for: %', v_missing;
    END IF;

    CREATE TEMP TABLE tmp_cc_map ON COMMIT DROP AS
        SELECT code, id, country_code
        FROM master.company_code
        WHERE tenant_id = v_tid
          AND status = 'active';

    CREATE TEMP TABLE tmp_coa_map ON COMMIT DROP AS
        SELECT code, id
        FROM master.chart_of_account
        WHERE tenant_id = v_tid
          AND code IN ('COA-IFRS', 'COA-GAAP')
          AND status = 'active';

    CREATE TEMP TABLE tmp_assign (
        cc_code     text NOT NULL,
        coa_code    text NOT NULL,
        assign_type text NOT NULL,
        is_primary  boolean NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary)
    SELECT
        cc.code,
        CASE WHEN cc.country_code = 'US' THEN 'COA-GAAP' ELSE 'COA-IFRS' END,
        'operating',
        true
    FROM tmp_cc_map cc;

    SELECT count(*) INTO v_expected FROM tmp_assign;

    UPDATE master.company_code_chart_assignment cca
       SET status = 'inactive',
           effective_to = COALESCE(cca.effective_to, GREATEST(cca.effective_from, DATE '2025-01-01')),
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
     WHERE cca.tenant_id = v_tid
       AND cca.assignment_type IN ('group', 'local')
       AND cca.status = 'active';

    UPDATE master.company_code_chart_assignment cca
       SET status = 'inactive',
           effective_to = COALESCE(cca.effective_to, GREATEST(cca.effective_from, DATE '2025-01-01')),
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
      FROM master.company_code cc,
           master.chart_of_account coa,
           tmp_assign a
     WHERE cca.tenant_id = v_tid
       AND cc.tenant_id = v_tid
       AND coa.tenant_id = v_tid
       AND cc.id = cca.company_code_id
       AND coa.id = cca.chart_of_account_id
       AND a.cc_code = cc.code
       AND cca.assignment_type = 'operating'
       AND cca.status = 'active'
       AND coa.code <> a.coa_code;

    INSERT INTO master.company_code_chart_assignment (
        id, tenant_id, company_code_id, chart_of_account_id,
        assignment_type, is_primary, effective_from,
        metadata, status, created_by
    )
    SELECT
        md5(format('neon:cirrusatlantic:company-chart:%s:%s:%s:%s',
                   v_tid, cc.id, coa.id, a.assign_type))::uuid,
        v_tid,
        cc.id,
        coa.id,
        a.assign_type,
        a.is_primary,
        DATE '2025-01-01',
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
    ON CONFLICT ON CONSTRAINT company_code_chart_assignment_identity_uq
    DO UPDATE SET
        is_primary     = EXCLUDED.is_primary,
        effective_from = EXCLUDED.effective_from,
        effective_to   = NULL,
        metadata       = master.company_code_chart_assignment.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            )),
        status     = 'active',
        updated_at = now(),
        updated_by = v_su
    WHERE (master.company_code_chart_assignment.is_primary,
           master.company_code_chart_assignment.effective_from,
           master.company_code_chart_assignment.effective_to,
           master.company_code_chart_assignment.status)
       IS DISTINCT FROM
          (EXCLUDED.is_primary, EXCLUDED.effective_from, NULL::date, EXCLUDED.status);

    SELECT count(*) INTO v_oper
    FROM master.company_code_chart_assignment cca
    JOIN master.company_code cc
      ON cc.id = cca.company_code_id
     AND cc.tenant_id = v_tid
     AND cc.status = 'active'
    WHERE cca.tenant_id = v_tid
      AND cca.assignment_type = 'operating'
      AND cca.is_active = true;

    SELECT count(*) INTO v_stale
    FROM master.company_code_chart_assignment cca
    JOIN master.company_code cc
      ON cc.id = cca.company_code_id
     AND cc.tenant_id = v_tid
     AND cc.status = 'active'
    WHERE cca.tenant_id = v_tid
      AND cca.assignment_type IN ('group', 'local')
      AND cca.is_active = true;

    IF v_oper <> v_expected THEN
        RAISE EXCEPTION '[201_company_assignments] Expected % active operating assignments, got %', v_expected, v_oper;
    END IF;

    IF v_stale <> 0 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected no active group/local COA assignments, got %', v_stale;
    END IF;

    RAISE NOTICE '[201_company_assignments] cirrusatlantic: % primary operating COA assignments', v_oper;

END $seed$;
