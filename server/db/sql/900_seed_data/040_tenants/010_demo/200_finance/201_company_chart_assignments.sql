-- ============================================================================
-- ATHYPER GROUP — COMPANY CODE CHART ASSIGNMENTS
-- ============================================================================
-- File:     201_company_chart_assignments.sql
-- Schema:   master.company_code_chart_assignment
-- Purpose:  35 assignment rows linking company codes to charts of account
--           (17 operating, 17 group, 1 local) per §18.2
-- Depends:  199_gl_preseed.sql (company codes), 200_chart_catalog.sql (charts)
-- Idempotent: Yes — ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type) DO UPDATE
-- Spec ref: §18.2 Company Code Chart Assignments
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '201_company_assignments';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_total    int;
    v_oper     int;
    v_grp      int;
    v_loc      int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Build resolver maps
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_cc_map AS
    SELECT code, id FROM master.company_code WHERE tenant_id = v_tid;

    CREATE TEMP TABLE tmp_coa_map AS
    SELECT code, id FROM master.chart_of_account WHERE tenant_id = v_tid;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: Stage assignment data
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_assign (
        cc_code     text NOT NULL,
        coa_code    text NOT NULL,
        assign_type text NOT NULL,
        is_primary  boolean NOT NULL
    ) ON COMMIT DROP;

    -- C1: Operating assignments (17) — is_primary = true
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ATHQ', 'COA-IFRS',   'operating', true),
    ('AMRE', 'COA-IFRS',   'operating', true),
    ('AQTU', 'COA-IFRS',   'operating', true),
    ('ASAC', 'COA-SOCPA',  'operating', true),
    ('AQTS', 'COA-IFRS',   'operating', true),
    ('AUET', 'COA-IFRS',   'operating', true),
    ('ASAH', 'COA-SOCPA',  'operating', true),
    ('AUIC', 'COA-USGAAP', 'operating', true),
    ('ASGF', 'COA-IFRS',   'operating', true),
    ('AITM', 'COA-INDAS',  'operating', true),
    ('ACFB', 'COA-IFRS',   'operating', true),
    ('ADPM', 'COA-HGB',    'operating', true),
    ('ATEM', 'COA-IFRS',   'operating', true),
    ('ASPE', 'COA-IFRS',   'operating', true),
    ('AUKA', 'COA-IFRS',   'operating', true),
    ('AJED', 'COA-JGAAP',  'operating', true),
    ('APHS', 'COA-IFRS',   'operating', true);

    -- C2: Group assignments (17) — all companies → COA-IFRS-GROUP, is_primary = false
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ATHQ', 'COA-IFRS-GROUP', 'group', false),
    ('AMRE', 'COA-IFRS-GROUP', 'group', false),
    ('AQTU', 'COA-IFRS-GROUP', 'group', false),
    ('ASAC', 'COA-IFRS-GROUP', 'group', false),
    ('AQTS', 'COA-IFRS-GROUP', 'group', false),
    ('AUET', 'COA-IFRS-GROUP', 'group', false),
    ('ASAH', 'COA-IFRS-GROUP', 'group', false),
    ('AUIC', 'COA-IFRS-GROUP', 'group', false),
    ('ASGF', 'COA-IFRS-GROUP', 'group', false),
    ('AITM', 'COA-IFRS-GROUP', 'group', false),
    ('ACFB', 'COA-IFRS-GROUP', 'group', false),
    ('ADPM', 'COA-IFRS-GROUP', 'group', false),
    ('ATEM', 'COA-IFRS-GROUP', 'group', false),
    ('ASPE', 'COA-IFRS-GROUP', 'group', false),
    ('AUKA', 'COA-IFRS-GROUP', 'group', false),
    ('AJED', 'COA-IFRS-GROUP', 'group', false),
    ('APHS', 'COA-IFRS-GROUP', 'group', false);

    -- C3: Local assignment (1) — ADPM dual-reporting, is_primary = false
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ADPM', 'COA-IFRS', 'local', false);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT into master.company_code_chart_assignment
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.company_code_chart_assignment (
        tenant_id, company_code_id, chart_of_account_id,
        assignment_type, is_primary, effective_from,
        metadata, status, created_by
    )
    SELECT
        v_tid, cc.id, coa.id,
        a.assign_type, a.is_primary, CURRENT_DATE,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_assign a
    JOIN tmp_cc_map cc  ON cc.code  = a.cc_code
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
        updated_at = now(),
        updated_by = v_su
    WHERE (master.company_code_chart_assignment.is_primary,
           master.company_code_chart_assignment.effective_from)
       IS DISTINCT FROM
          (EXCLUDED.is_primary, EXCLUDED.effective_from);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_oper
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'operating';

    SELECT count(*) INTO v_grp
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'group';

    SELECT count(*) INTO v_loc
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'local';

    IF v_total <> 35 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 35 total assignments, got %', v_total;
    END IF;

    IF v_oper <> 17 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 17 operating assignments, got %', v_oper;
    END IF;

    IF v_grp <> 17 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 17 group assignments, got %', v_grp;
    END IF;

    IF v_loc <> 1 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 1 local assignment, got %', v_loc;
    END IF;

    RAISE NOTICE '[201_company_assignments] Chart assignments seeded: % total (% operating, % group, % local)',
        v_total, v_oper, v_grp, v_loc;

END $seed$;
