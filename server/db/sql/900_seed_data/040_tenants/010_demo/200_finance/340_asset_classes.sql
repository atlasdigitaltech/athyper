-- ============================================================================
-- 340_asset_classes.sql  Asset class + book policy seed (v3)
-- ============================================================================
-- Seeds 16 asset class templates per company code (4 L1 headers + 12 L2 leaves)
-- and 2 book policies per leaf class (statutory + management) = 24 policies/company.
--
-- Prerequisites: 311_ledger_books.sql (company books + BOOK-MGMT-GROUP)
-- Depends on:    master.asset_class, control.asset_class_book_policy
--
-- Fixes from review:
--   FIX-1: book_code = real ledger_book.code ('{CC}-BOOK-STAT', 'BOOK-MGMT-GROUP')
--   FIX-2: ON CONFLICT uses (..., effective_from) for true versioning
--   REC-1: asset_class.code = bare codes ('PLANT' not 'ATHQ-AC-PLANT')
--   REC-3: TOOLS uses straight_line (units_of_production deferred)
-- ============================================================================

DO $seed$
DECLARE
    v_tid       uuid;
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_pack      text := '340_asset';
    v_version   text := '3.0.0';
    v_meta      jsonb;
    v_cc        record;
    v_class_id  uuid;
    v_stat_book text;
    v_mgmt_book text := 'BOOK-MGMT-GROUP';
    v_count     int;
    v_unmapped_count int;
    v_mapped_count   int;
    v_total_roles    int;
    v_sample_cc_id   uuid;
    v_sample_book    text;
    v_role_code      text;
    v_resolved_gl    uuid;
    v_unmapped_list  text[];
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    -- Verify prerequisites
    IF (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active') < 17 THEN
        RAISE EXCEPTION '[340] Expected >=17 active company codes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.ledger_book
        WHERE tenant_id = v_tid AND code = v_mgmt_book) THEN
        RAISE EXCEPTION '[340] Management book % not found -- run 311 first', v_mgmt_book;
    END IF;

    -- ================================================================
    -- STAGE A: Asset class templates (identity only)
    -- ================================================================

    CREATE TEMP TABLE tmp_ac (
        code            text NOT NULL PRIMARY KEY,
        name            text NOT NULL,
        description     text,
        parent_code     text,
        level_no        smallint NOT NULL,
        is_leaf         boolean NOT NULL,
        asset_nature    text NOT NULL,
        is_depreciable  boolean NOT NULL DEFAULT true,
        is_componentization_required boolean NOT NULL DEFAULT false,
        revaluation_allowed boolean NOT NULL DEFAULT false,
        useful_life_override_policy text NOT NULL DEFAULT 'allow',
        threshold_mult  numeric(5,2) NOT NULL DEFAULT 1.0,
        sort_order      smallint NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_ac VALUES
    -- L1 Headers (is_leaf=false)
    ('TANGIBLE',   'Tangible Fixed Assets',    'IAS 16 PPE',                     NULL,       1, false, 'tangible',   true,  false, false, 'allow',  0,    100),
    ('INTANGIBLE', 'Intangible Assets',        'IAS 38 intangibles',             NULL,       1, false, 'intangible', true,  false, false, 'allow',  0,    200),
    ('ROU',        'Right-of-Use Assets',      'IFRS 16 leased assets',          NULL,       1, false, 'rou',        true,  false, false, 'forbid', 0,    300),
    ('CWIP',       'Capital Work in Progress', 'Under construction',             NULL,       1, false, 'cwip',       false, false, false, 'forbid', 0,    400),
    -- L2 Tangible
    ('LAND',       'Land',                     'Non-depreciable (IAS 16)',        'TANGIBLE', 2, true,  'land',       false, false, true,  'forbid', 10.0, 110),
    ('BUILDINGS',  'Buildings',                'Office, warehouse, plant',        'TANGIBLE', 2, true,  'tangible',   true,  true,  true,  'allow',  5.0,  120),
    ('PLANT',      'Plant & Machinery',        'Production equipment',            'TANGIBLE', 2, true,  'tangible',   true,  true,  false, 'allow',  2.0,  130),
    ('VEHICLES',   'Vehicles',                 'Fleet, cars, forklifts',          'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  1.0,  140),
    ('IT-EQUIP',   'IT Equipment',             'Servers, network, desktops',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  150),
    ('FURNITURE',  'Furniture & Fixtures',     'Office furniture, fittings',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  160),
    ('LHI',        'Leasehold Improvements',   'Tenant improvements',             'TANGIBLE', 2, true,  'leasehold_improvement', true, false, false, 'allow', 1.0, 170),
    ('TOOLS',      'Tools & Dies',             'Specialised tooling',             'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  180),
    -- L2 Intangible
    ('SOFTWARE',   'Software & Licences',      'Purchased/developed software',    'INTANGIBLE',2,true,  'intangible', true,  false, false, 'allow',  0.5,  210),
    -- L2 ROU
    ('ROU-PROP',   'ROU - Property',           'IFRS 16 leased buildings',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 1.0,  310),
    ('ROU-EQUIP',  'ROU - Equipment',          'IFRS 16 leased equipment',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 0.5,  320),
    -- L2 CWIP
    ('CWIP-GEN',   'General CWIP',             'Reclassified on capitalization',  'CWIP',     2, true,  'cwip',       false, false, false, 'forbid', 0,    410);

    -- ================================================================
    -- STAGE B: Book policy templates
    -- ================================================================

    CREATE TEMP TABLE tmp_policy (
        class_code      text NOT NULL,
        book_key        text NOT NULL,  -- 'STAT' or 'MGMT' (resolved per company)
        is_depreciable  boolean NOT NULL DEFAULT true,
        depr_method     text,
        life_months     integer,
        residual_mode   text NOT NULL DEFAULT 'zero',
        residual_pct    numeric(9,4),
        convention      text,
        prorate_basis   text NOT NULL DEFAULT 'monthly',
        start_rule      text NOT NULL DEFAULT 'in_service_date',
        acq_role        text,
        accum_role      text,
        expense_role    text,
        gainloss_role   text,
        cwip_role       text,
        impair_exp_role text,
        impair_rsv_role text,
        reval_surp_role text,
        reval_loss_role text,
        PRIMARY KEY (class_code, book_key)
    ) ON COMMIT DROP;

    -- Statutory book policies
    INSERT INTO tmp_policy VALUES
    ('LAND',      'STAT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',       'fa_acq_land',NULL,NULL,'fa_gainloss_disposal','fa_cwip',NULL,NULL,'fa_reval_surplus_land','fa_reval_loss_land'),
    ('BUILDINGS', 'STAT', true, 'straight_line',  480, 'percent',5.0,'full_month','monthly','in_service_date', 'fa_acq_bldg','fa_accum_bldg','fa_depr_bldg','fa_gainloss_disposal','fa_cwip','fa_impair_exp','fa_impair_rsv','fa_reval_surplus_bldg','fa_reval_loss_bldg'),
    ('PLANT',     'STAT', true, 'straight_line',  120, 'percent',5.0,'half_year','monthly','in_service_date',  'fa_acq_plant','fa_accum_plant','fa_depr_plant','fa_gainloss_disposal','fa_cwip','fa_impair_exp','fa_impair_rsv',NULL,NULL),
    ('VEHICLES',  'STAT', true, 'straight_line',   60, 'percent',10.0,'half_month','monthly','in_service_date', 'fa_acq_veh','fa_accum_veh','fa_depr_veh','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('IT-EQUIP',  'STAT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_it','fa_accum_it','fa_depr_it','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('FURNITURE', 'STAT', true, 'straight_line',   84, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_furn','fa_accum_furn','fa_depr_furn','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('LHI',       'STAT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_lhi','fa_accum_lhi','fa_depr_lhi','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('TOOLS',     'STAT', true, 'straight_line',   48, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_tools','fa_accum_tools','fa_depr_tools','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('SOFTWARE',  'STAT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','capitalization_date','fa_acq_sw','fa_amort_sw','fa_depr_amort','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('ROU-PROP',  'STAT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_prop','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('ROU-EQUIP', 'STAT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_equip','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('CWIP-GEN',  'STAT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',           'fa_cwip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

    -- Management book policies (shorter lives, vehicles use declining_balance)
    INSERT INTO tmp_policy VALUES
    ('LAND',      'MGMT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',       'fa_acq_land',NULL,NULL,'fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('BUILDINGS', 'MGMT', true, 'straight_line',  360, 'percent',5.0,'full_month','monthly','in_service_date', 'fa_acq_bldg','fa_accum_bldg','fa_depr_bldg','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('PLANT',     'MGMT', true, 'straight_line',   96, 'percent',5.0,'half_year','monthly','in_service_date',  'fa_acq_plant','fa_accum_plant','fa_depr_plant','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('VEHICLES',  'MGMT', true, 'declining_balance',48,'percent',10.0,'half_month','monthly','in_service_date', 'fa_acq_veh','fa_accum_veh','fa_depr_veh','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('IT-EQUIP',  'MGMT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_it','fa_accum_it','fa_depr_it','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('FURNITURE', 'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_furn','fa_accum_furn','fa_depr_furn','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('LHI',       'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_lhi','fa_accum_lhi','fa_depr_lhi','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('TOOLS',     'MGMT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_tools','fa_accum_tools','fa_depr_tools','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('SOFTWARE',  'MGMT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','capitalization_date','fa_acq_sw','fa_amort_sw','fa_depr_amort','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('ROU-PROP',  'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_prop','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('ROU-EQUIP', 'MGMT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_equip','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('CWIP-GEN',  'MGMT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',           'fa_cwip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

    -- ================================================================
    -- STAGE C: Currency thresholds
    -- ================================================================

    CREATE TEMP TABLE tmp_threshold (
        currency_code character(3) PRIMARY KEY,
        base_threshold numeric(18,4) NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_threshold VALUES
    ('MYR',5000),('QAR',5000),('SAR',5000),('AED',5000),('USD',1000),('SGD',1500),
    ('INR',50000),('CAD',1000),('EUR',1000),('TWD',30000),('ZAR',10000),('GBP',1000),
    ('JPY',100000),('PHP',50000);

    -- ================================================================
    -- STAGE D: Per-company insert
    -- ================================================================

    FOR v_cc IN
        SELECT id, code, name, functional_currency
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        v_stat_book := v_cc.code || '-BOOK-STAT';

        -- Verify statutory book exists
        IF NOT EXISTS (SELECT 1 FROM master.ledger_book
            WHERE tenant_id = v_tid AND code = v_stat_book) THEN
            RAISE EXCEPTION '[340] Statutory book % not found for company %',
                v_stat_book, v_cc.code;
        END IF;

        -- D1: L1 headers
        INSERT INTO master.asset_class (
            tenant_id, company_code_id,
            code, name, description,
            parent_id, level_no, path, is_leaf,
            asset_nature, is_depreciable,
            capitalization_threshold, capitalization_currency,
            is_componentization_required, revaluation_allowed,
            useful_life_override_policy,
            sort_order, metadata, status, created_by
        )
        SELECT v_tid, v_cc.id,
            t.code, t.name, t.description,
            NULL, t.level_no, t.code, t.is_leaf,
            t.asset_nature, t.is_depreciable,
            0, v_cc.functional_currency,
            t.is_componentization_required, t.revaluation_allowed,
            t.useful_life_override_policy,
            t.sort_order, v_meta, 'active', v_su
        FROM tmp_ac t WHERE t.parent_code IS NULL
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, asset_nature = EXCLUDED.asset_nature,
            is_depreciable = EXCLUDED.is_depreciable, is_leaf = EXCLUDED.is_leaf,
            updated_at = now(), updated_by = v_su
        WHERE (master.asset_class.name, master.asset_class.asset_nature,
               master.asset_class.is_depreciable, master.asset_class.is_leaf)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.asset_nature,
               EXCLUDED.is_depreciable, EXCLUDED.is_leaf);

        -- D2: L2 leaves
        INSERT INTO master.asset_class (
            tenant_id, company_code_id,
            code, name, description,
            parent_id, level_no, path, is_leaf,
            asset_nature, is_depreciable,
            capitalization_threshold, capitalization_currency,
            is_componentization_required, revaluation_allowed,
            useful_life_override_policy,
            sort_order, metadata, status, created_by
        )
        SELECT v_tid, v_cc.id,
            t.code, t.name, t.description,
            p.id, t.level_no, p.path || '/' || t.code, t.is_leaf,
            t.asset_nature, t.is_depreciable,
            COALESCE(ct.base_threshold, 1000) * t.threshold_mult,
            v_cc.functional_currency,
            t.is_componentization_required, t.revaluation_allowed,
            t.useful_life_override_policy,
            t.sort_order, v_meta, 'active', v_su
        FROM tmp_ac t
        JOIN master.asset_class p
          ON p.tenant_id = v_tid AND p.company_code_id = v_cc.id
         AND p.code = t.parent_code
        LEFT JOIN tmp_threshold ct ON ct.currency_code = v_cc.functional_currency
        WHERE t.parent_code IS NOT NULL
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            asset_nature = EXCLUDED.asset_nature, is_depreciable = EXCLUDED.is_depreciable,
            is_leaf = EXCLUDED.is_leaf,
            capitalization_threshold = EXCLUDED.capitalization_threshold,
            capitalization_currency = EXCLUDED.capitalization_currency,
            updated_at = now(), updated_by = v_su
        WHERE (master.asset_class.name, master.asset_class.parent_id,
               master.asset_class.asset_nature, master.asset_class.is_depreciable,
               master.asset_class.is_leaf,
               master.asset_class.capitalization_threshold,
               master.asset_class.capitalization_currency)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id,
               EXCLUDED.asset_nature, EXCLUDED.is_depreciable,
               EXCLUDED.is_leaf,
               EXCLUDED.capitalization_threshold,
               EXCLUDED.capitalization_currency);

        -- D3: Book policies
        INSERT INTO control.asset_class_book_policy (
            tenant_id, company_code_id, asset_class_id,
            book_code,
            priority, effective_from,
            is_depreciable, depreciation_method, useful_life_months,
            residual_value_mode, residual_value_pct,
            convention, prorate_basis, depreciation_start_rule,
            acquisition_posting_role_code, accum_depr_posting_role_code,
            depr_expense_posting_role_code, gain_loss_posting_role_code,
            cwip_posting_role_code,
            impairment_expense_posting_role_code, impairment_reserve_posting_role_code,
            revaluation_surplus_posting_role_code, revaluation_loss_posting_role_code,
            metadata, status, created_by
        )
        SELECT
            v_tid, v_cc.id, ac.id,
            CASE pol.book_key
                WHEN 'STAT' THEN v_stat_book
                WHEN 'MGMT' THEN v_mgmt_book
            END,
            50, '2025-01-01',
            pol.is_depreciable, pol.depr_method, pol.life_months,
            pol.residual_mode, pol.residual_pct,
            pol.convention, pol.prorate_basis, pol.start_rule,
            pol.acq_role, pol.accum_role, pol.expense_role, pol.gainloss_role,
            pol.cwip_role, pol.impair_exp_role, pol.impair_rsv_role,
            pol.reval_surp_role, pol.reval_loss_role,
            v_meta, 'active', v_su
        FROM tmp_policy pol
        JOIN master.asset_class ac
          ON ac.tenant_id = v_tid AND ac.company_code_id = v_cc.id
         AND ac.code = pol.class_code
        ON CONFLICT (tenant_id, company_code_id, asset_class_id, book_code, effective_from)
        DO UPDATE SET
            is_depreciable = EXCLUDED.is_depreciable,
            depreciation_method = EXCLUDED.depreciation_method,
            useful_life_months = EXCLUDED.useful_life_months,
            residual_value_mode = EXCLUDED.residual_value_mode,
            residual_value_pct = EXCLUDED.residual_value_pct,
            convention = EXCLUDED.convention,
            acquisition_posting_role_code = EXCLUDED.acquisition_posting_role_code,
            accum_depr_posting_role_code = EXCLUDED.accum_depr_posting_role_code,
            depr_expense_posting_role_code = EXCLUDED.depr_expense_posting_role_code,
            gain_loss_posting_role_code = EXCLUDED.gain_loss_posting_role_code,
            cwip_posting_role_code = EXCLUDED.cwip_posting_role_code,
            updated_at = now(), updated_by = v_su
        WHERE (control.asset_class_book_policy.is_depreciable,
               control.asset_class_book_policy.depreciation_method,
               control.asset_class_book_policy.useful_life_months,
               control.asset_class_book_policy.residual_value_mode,
               control.asset_class_book_policy.residual_value_pct,
               control.asset_class_book_policy.convention,
               control.asset_class_book_policy.acquisition_posting_role_code,
               control.asset_class_book_policy.accum_depr_posting_role_code,
               control.asset_class_book_policy.depr_expense_posting_role_code,
               control.asset_class_book_policy.gain_loss_posting_role_code,
               control.asset_class_book_policy.cwip_posting_role_code)
           IS DISTINCT FROM
              (EXCLUDED.is_depreciable,
               EXCLUDED.depreciation_method,
               EXCLUDED.useful_life_months,
               EXCLUDED.residual_value_mode,
               EXCLUDED.residual_value_pct,
               EXCLUDED.convention,
               EXCLUDED.acquisition_posting_role_code,
               EXCLUDED.accum_depr_posting_role_code,
               EXCLUDED.depr_expense_posting_role_code,
               EXCLUDED.gain_loss_posting_role_code,
               EXCLUDED.cwip_posting_role_code);
    END LOOP;

    -- ================================================================
    -- STAGE E: Assertions
    -- ================================================================

    -- A1: Asset class count = 272 (17 companies x 16 classes)
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 272 THEN
        RAISE EXCEPTION '[340] Expected 272 asset classes, got %', v_count;
    END IF;

    -- A2: 4 L1 headers per company
    IF EXISTS (
        SELECT company_code_id FROM master.asset_class
        WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack
        GROUP BY company_code_id HAVING count(*) != 4
    ) THEN RAISE EXCEPTION '[340] Company with != 4 L1 headers'; END IF;

    -- A3: 12 L2 leaves per company
    IF EXISTS (
        SELECT company_code_id FROM master.asset_class
        WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack
        GROUP BY company_code_id HAVING count(*) != 12
    ) THEN RAISE EXCEPTION '[340] Company with != 12 L2 leaves'; END IF;

    -- A4: Land/CWIP not depreciable
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND asset_nature IN ('land','cwip') AND is_depreciable = true
    ) THEN RAISE EXCEPTION '[340] Land/CWIP marked as depreciable'; END IF;

    -- A5: Policy count = 408 (17 x 12 x 2)
    SELECT count(*) INTO v_count FROM control.asset_class_book_policy
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 408 THEN
        RAISE EXCEPTION '[340] Expected 408 book policies, got %', v_count;
    END IF;

    -- A6: Every policy book_code exists in master.ledger_book
    IF EXISTS (
        SELECT p.id, p.book_code
        FROM control.asset_class_book_policy p
        WHERE p.tenant_id = v_tid
          AND NOT EXISTS (
              SELECT 1 FROM master.ledger_book lb
              WHERE lb.tenant_id = p.tenant_id AND lb.code = p.book_code
          )
    ) THEN RAISE EXCEPTION '[340] Policy references non-existent ledger book code'; END IF;

    -- A7: No depreciable policy missing core posting roles
    IF EXISTS (
        SELECT id FROM control.asset_class_book_policy
        WHERE tenant_id = v_tid AND is_depreciable = true
          AND depreciation_method != 'no_depreciation'
          AND (acquisition_posting_role_code IS NULL
               OR accum_depr_posting_role_code IS NULL
               OR depr_expense_posting_role_code IS NULL)
    ) THEN RAISE EXCEPTION '[340] Depreciable policy missing core posting roles'; END IF;

    -- A8: No units_of_production in seed (REC-3)
    IF EXISTS (
        SELECT id FROM control.asset_class_book_policy
        WHERE tenant_id = v_tid AND depreciation_method = 'units_of_production'
          AND metadata->'_seed'->>'pack' = v_pack
    ) THEN RAISE EXCEPTION '[340] units_of_production found -- deferred until method_params ready'; END IF;

    -- A9: Bare class codes (no company prefix)
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND code LIKE '%-%-%'
          AND code NOT IN ('IT-EQUIP','ROU-PROP','ROU-EQUIP','CWIP-GEN')
    ) THEN RAISE EXCEPTION '[340] Asset class code contains company prefix -- should be bare'; END IF;

    -- A10: Every policy book_code is assigned to its company
    IF EXISTS (
        SELECT p.id, p.book_code, p.company_code_id
        FROM control.asset_class_book_policy p
        WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = v_pack
          AND NOT EXISTS (
              SELECT 1
              FROM master.company_code_book_assignment ba
              JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
              WHERE ba.tenant_id = p.tenant_id
                AND ba.company_code_id = p.company_code_id
                AND lb.code = p.book_code
                AND ba.status = 'active'
          )
    ) THEN RAISE EXCEPTION '[340] Policy book_code not assigned to its company via book_assignment'; END IF;

    -- A11: Posting role spot-check
    SELECT id, code || '-BOOK-STAT'
    INTO v_sample_cc_id, v_sample_book
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active'
    ORDER BY code LIMIT 1;

    v_mapped_count   := 0;
    v_unmapped_count := 0;
    v_total_roles    := 0;
    v_unmapped_list  := '{}';

    FOR v_role_code IN
        SELECT DISTINCT role FROM (
            SELECT acquisition_posting_role_code AS role FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND acquisition_posting_role_code IS NOT NULL
            UNION SELECT accum_depr_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND accum_depr_posting_role_code IS NOT NULL
            UNION SELECT depr_expense_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND depr_expense_posting_role_code IS NOT NULL
            UNION SELECT gain_loss_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND gain_loss_posting_role_code IS NOT NULL
            UNION SELECT cwip_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND cwip_posting_role_code IS NOT NULL
            UNION SELECT impairment_expense_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND impairment_expense_posting_role_code IS NOT NULL
            UNION SELECT impairment_reserve_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND impairment_reserve_posting_role_code IS NOT NULL
            UNION SELECT revaluation_surplus_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND revaluation_surplus_posting_role_code IS NOT NULL
            UNION SELECT revaluation_loss_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND revaluation_loss_posting_role_code IS NOT NULL
        ) sub ORDER BY role
    LOOP
        v_total_roles := v_total_roles + 1;

        BEGIN
            v_resolved_gl := control.resolve_posting_role_account(
                v_tid, v_role_code, v_sample_cc_id, v_sample_book, '2025-01-01'::date
            );
        EXCEPTION WHEN OTHERS THEN
            v_resolved_gl := NULL;
        END;

        IF v_resolved_gl IS NOT NULL THEN
            v_mapped_count := v_mapped_count + 1;
        ELSE
            v_unmapped_count := v_unmapped_count + 1;
            v_unmapped_list := v_unmapped_list || v_role_code;
        END IF;
    END LOOP;

    RAISE NOTICE '[340] Posting role spot-check (sample: %, book: %): % total, % mapped, % unmapped',
        v_sample_cc_id, v_sample_book, v_total_roles, v_mapped_count, v_unmapped_count;

    IF v_unmapped_count > 0 THEN
        RAISE NOTICE '[340] ACTION REQUIRED: % unmapped role codes need 341_asset_posting_role_map.sql: %',
            v_unmapped_count, array_to_string(v_unmapped_list, ', ');
    END IF;

    -- Summary
    RAISE NOTICE '[340] Asset classes: % (% L1 + % L2) across % companies',
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(DISTINCT company_code_id) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

    RAISE NOTICE '[340] Book policies: % (stat: %, mgmt: %). All book_codes validated against ledger_book.',
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND book_code LIKE '%-BOOK-STAT' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND book_code = 'BOOK-MGMT-GROUP' AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
