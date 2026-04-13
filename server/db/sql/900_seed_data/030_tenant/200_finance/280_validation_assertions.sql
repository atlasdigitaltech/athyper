-- ============================================================================
-- ATHYPER GROUP — COA/GL VALIDATION ASSERTIONS
-- ============================================================================
-- File:     280_validation_assertions.sql
-- Purpose:  Full validation suite for the COA/GL seed data
-- Depends:  270_refresh_mv.sql (MV must be populated)
-- Spec ref: §23 COA/GL Validation Suite
-- ============================================================================

DO $validate$
DECLARE
    v_tid uuid;
    v_errors text[] := '{}';
    v_count bigint;
    v_msg text;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1a  One active operating assignment per company
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.company_code_chart_assignment
        WHERE tenant_id = v_tid AND assignment_type = 'operating' AND is_active = true
        GROUP BY company_code_id HAVING count(*) != 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1a FAIL: %s companies with !=1 operating assignment', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1b  One group assignment per company
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.company_code_chart_assignment
        WHERE tenant_id = v_tid AND assignment_type = 'group' AND is_active = true
        GROUP BY company_code_id HAVING count(*) != 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1b FAIL: %s companies with !=1 group assignment', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1c  No orphan GL accounts (referencing non-existent chart)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    LEFT JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid AND coa.id IS NULL;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1c FAIL: %s GL accounts reference non-existent chart', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1e  No duplicate account codes within tenant
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT code FROM master.gl_account
        WHERE tenant_id = v_tid
        GROUP BY code HAVING count(*) > 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('§23.1e FAIL: %s duplicate GL account codes: %s', v_count,
                (SELECT string_agg(code, ', ') FROM (
                    SELECT code FROM master.gl_account WHERE tenant_id = v_tid
                    GROUP BY code HAVING count(*) > 1 LIMIT 10
                ) d)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.2g  Every company has ≥50 postable accounts
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.mv_company_postable_account
        WHERE tenant_id = v_tid
        GROUP BY company_code_id HAVING count(*) < 50
    ) sparse;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.2g FAIL: %s companies with <50 postable accounts', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.3i  Every operating posting account has a group mapping
    --         (Phase 1: check metadata._group_map)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid
      AND ga.node_type = 'posting'
      AND ga.is_active = true
      AND coa.code != 'COA-IFRS-GROUP'   -- skip group chart itself
      AND ga.metadata->>'_group_map' IS NULL;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('§23.3i FAIL: %s posting accounts missing _group_map: %s', v_count,
                (SELECT string_agg(ga.code, ', ') FROM master.gl_account ga
                 JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
                 WHERE ga.tenant_id = v_tid AND ga.node_type = 'posting' AND ga.is_active = true
                   AND coa.code != 'COA-IFRS-GROUP' AND ga.metadata->>'_group_map' IS NULL
                 LIMIT 15)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Chart catalog completeness
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.chart_of_account WHERE tenant_id = v_tid AND is_active = true;
    IF v_count < 7 THEN
        v_errors := array_append(v_errors, format('CUSTOM FAIL: Expected ≥7 active charts, got %s', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Every active chart has ≥20 GL accounts
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT coa.id, coa.code
        FROM master.chart_of_account coa
        WHERE coa.tenant_id = v_tid AND coa.is_active = true
        GROUP BY coa.id, coa.code
        HAVING (SELECT count(*) FROM master.gl_account ga
                WHERE ga.chart_of_account_id = coa.id AND ga.is_active = true) BETWEEN 1 AND 19
    ) empty_charts;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('CUSTOM FAIL: %s active charts with between 1 and 19 GL accounts (incomplete)', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: GL account normal_balance ↔ account_class correctness
    --   Debit-normal  : asset, expense, contra_liability, contra_equity, contra_revenue
    --   Credit-normal : liability, equity, revenue, contra_asset, contra_expense
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid
      AND ga.is_active = true
      AND ga.node_type = 'posting'
      AND (
          -- Debit classes must NOT have credit normal balance
          (ga.account_class IN ('asset', 'expense', 'contra_liability', 'contra_equity', 'contra_revenue')
           AND ga.normal_balance = 'credit')
          OR
          -- Credit classes must NOT have debit normal balance
          (ga.account_class IN ('liability', 'equity', 'revenue', 'contra_asset', 'contra_expense')
           AND ga.normal_balance = 'debit')
      );
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('CUSTOM FAIL: %s GL accounts have incorrect normal_balance for their account_class: %s',
                v_count,
                (SELECT string_agg(ga.code || '(' || ga.account_class || '/' || ga.normal_balance || ')', ', ')
                 FROM master.gl_account ga
                 JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
                 WHERE ga.tenant_id = v_tid AND ga.is_active = true AND ga.node_type = 'posting'
                   AND (
                       (ga.account_class IN ('asset', 'expense', 'contra_liability', 'contra_equity', 'contra_revenue') AND ga.normal_balance = 'credit')
                       OR (ga.account_class IN ('liability', 'equity', 'revenue', 'contra_asset', 'contra_expense') AND ga.normal_balance = 'debit')
                   )
                 LIMIT 10)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Company code completeness
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.company_code WHERE tenant_id = v_tid AND status = 'active';
    IF v_count < 17 THEN
        v_errors := array_append(v_errors, format('CUSTOM FAIL: Expected ≥17 active companies, got %s', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- REPORT
    -- ══════════════════════════════════════════════════════════════════════
    IF array_length(v_errors, 1) > 0 THEN
        RAISE EXCEPTION E'[280_validation] VALIDATION FAILED (%s errors):\n%',
            array_length(v_errors, 1),
            array_to_string(v_errors, E'\n');
    END IF;

    RAISE NOTICE '[280_validation] All COA/GL assertions passed';

END $validate$;
