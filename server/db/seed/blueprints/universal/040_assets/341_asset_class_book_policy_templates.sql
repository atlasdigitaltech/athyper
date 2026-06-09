-- ============================================================================
-- 341_asset_class_book_policy_templates.sql
-- Universal IFRS asset policy templates
-- ============================================================================
-- Schema: control.asset_class_book_policy_template
-- Scope:  Platform-global template rows (tenant_id IS NULL)
-- Purpose:
--   One simple source for default asset policy onboarding. Concrete company/book
--   rows are created later by control.provision_asset_policies().
-- ============================================================================

DO $seed$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '341_asset_policy_templates';
    v_version text := '1.0.0';
    v_meta    jsonb;
    v_count   int;
BEGIN
    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack,
        'version', v_version,
        'seeded_at', now()::text
    ));

    INSERT INTO control.asset_class_book_policy_template (
        tenant_id, template_code, framework,
        asset_class_code, book_category,
        capitalization_threshold_multiplier,
        priority, effective_from,
        is_depreciable, depreciation_method,
        useful_life_months, useful_life_min_months, useful_life_max_months,
        residual_value_mode, residual_value_pct,
        convention, prorate_basis, depreciation_start_rule, method_params,
        source_note,
        allow_manual_life_override,
        allow_manual_residual_override,
        allow_manual_method_override,
        acquisition_posting_role_code,
        accum_depr_posting_role_code,
        depr_expense_posting_role_code,
        gain_loss_posting_role_code,
        cwip_posting_role_code,
        impairment_expense_posting_role_code,
        impairment_reserve_posting_role_code,
        revaluation_surplus_posting_role_code,
        revaluation_loss_posting_role_code,
        metadata, status, created_by
    )
    SELECT
        NULL::uuid,
        'IFRS_DEFAULT',
        'ifrs',
        v.asset_class_code,
        v.book_category,
        v.threshold_multiplier,
        50,
        '2025-01-01'::date,
        v.is_depreciable,
        v.depreciation_method,
        v.useful_life_months,
        v.useful_life_min_months,
        v.useful_life_max_months,
        v.residual_value_mode,
        v.residual_value_pct,
        v.convention,
        'monthly',
        v.depreciation_start_rule,
        v.method_params,
        v.source_note,
        CASE WHEN v.is_depreciable THEN true ELSE false END,
        CASE WHEN v.is_depreciable THEN true ELSE false END,
        false,
        v.acquisition_role,
        v.accum_depr_role,
        v.depr_expense_role,
        v.gain_loss_role,
        v.cwip_role,
        v.impairment_expense_role,
        v.impairment_reserve_role,
        v.revaluation_surplus_role,
        v.revaluation_loss_role,
        v_meta,
        'active',
        v_su
    FROM (VALUES
        -- Statutory book policies
        ('LAND',      'statutory', false, 'no_depreciation', NULL::integer, NULL::integer, NULL::integer, 'zero',    NULL::numeric(9,4), NULL,         'in_service_date',       10.0000, 'fa_acq_land',      NULL,            NULL,            'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           'fa_reval_surplus_land', 'fa_reval_loss_land', '{}'::jsonb, 'IAS 16: land normally has an unlimited useful life and is not depreciated.'),
        ('BUILDINGS', 'statutory', true,  'straight_line',   480,           240,           600,           'percent', 5.0000,             'full_month', 'in_service_date',        5.0000, 'fa_acq_bldg',      'fa_accum_bldg', 'fa_depr_bldg', 'fa_gainloss_disposal', 'fa_cwip', 'fa_impair_exp','fa_impair_rsv','fa_reval_surplus_bldg', 'fa_reval_loss_bldg', '{}'::jsonb, 'IAS 16 best-practice range for buildings: commonly 20 to 50 years; default 40 years.'),
        ('PLANT',     'statutory', true,  'straight_line',   120,           60,            180,           'percent', 5.0000,             'half_year',  'in_service_date',        2.0000, 'fa_acq_plant',     'fa_accum_plant','fa_depr_plant','fa_gainloss_disposal', 'fa_cwip', 'fa_impair_exp','fa_impair_rsv',NULL,                   NULL,                  '{}'::jsonb, 'IAS 16 best-practice range for plant and machinery: commonly 5 to 15 years; default 10 years.'),
        ('VEHICLES',  'statutory', true,  'straight_line',   60,            36,            84,            'percent', 10.0000,            'half_month', 'in_service_date',        1.0000, 'fa_acq_veh',       'fa_accum_veh',  'fa_depr_veh',  'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IAS 16 best-practice range for vehicles: commonly 3 to 7 years; default 5 years.'),
        ('IT-EQUIP',  'statutory', true,  'straight_line',   36,            24,            60,            'zero',    NULL::numeric(9,4), 'half_month', 'in_service_date',        0.5000, 'fa_acq_it',        'fa_accum_it',   'fa_depr_it',   'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IAS 16 best-practice range for IT equipment: commonly 2 to 5 years; default 3 years.'),
        ('FURNITURE', 'statutory', true,  'straight_line',   84,            60,            120,           'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        0.5000, 'fa_acq_furn',      'fa_accum_furn', 'fa_depr_furn', 'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IAS 16 best-practice range for furniture and fixtures: commonly 5 to 10 years; default 7 years.'),
        ('LHI',       'statutory', true,  'straight_line',   60,            12,            120,           'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        1.0000, 'fa_acq_lhi',       'fa_accum_lhi',  'fa_depr_lhi',  'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Leasehold improvements: depreciate over the shorter of useful life and lease term; default 5 years.'),
        ('TOOLS',     'statutory', true,  'straight_line',   48,            36,            84,            'zero',    NULL::numeric(9,4), 'half_month', 'in_service_date',        0.5000, 'fa_acq_tools',     'fa_accum_tools','fa_depr_tools','fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IAS 16 best-practice range for tools and dies: commonly 3 to 7 years; default 4 years.'),
        ('SOFTWARE',  'statutory', true,  'straight_line',   36,            24,            60,            'zero',    NULL::numeric(9,4), 'full_month', 'capitalization_date',  0.5000, 'fa_acq_sw',        'fa_amort_sw',   'fa_depr_amort','fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IAS 38 best-practice range for finite-life software: commonly 2 to 5 years; default 3 years.'),
        ('ROU-PROP',  'statutory', true,  'straight_line',   60,            12,            120,           'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        1.0000, 'fa_acq_rou_prop',  'fa_accum_rou',  'fa_depr_rou',  'fa_gainloss_disposal', NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IFRS 16: depreciate right-of-use property over lease term unless ownership transfers; default 5 years.'),
        ('ROU-EQUIP', 'statutory', true,  'straight_line',   36,            12,            60,            'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        0.5000, 'fa_acq_rou_equip', 'fa_accum_rou',  'fa_depr_rou',  'fa_gainloss_disposal', NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'IFRS 16: depreciate right-of-use equipment over lease term unless ownership transfers; default 3 years.'),
        ('CWIP-GEN',  'statutory', false, 'no_depreciation', NULL::integer, NULL::integer, NULL::integer, 'zero',    NULL::numeric(9,4), NULL,         'in_service_date',        0.0000, 'fa_cwip',          NULL,            NULL,            NULL,                   NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Capital work in progress is not depreciated until ready for intended use and capitalized.'),

        -- Management book policies
        ('LAND',      'management', false, 'no_depreciation', NULL::integer, NULL::integer, NULL::integer, 'zero',    NULL::numeric(9,4), NULL,         'in_service_date',       10.0000, 'fa_acq_land',      NULL,            NULL,            'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: land normally has an unlimited useful life and is not depreciated.'),
        ('BUILDINGS', 'management', true,  'straight_line',   360,           240,           480,           'percent', 5.0000,             'full_month', 'in_service_date',        5.0000, 'fa_acq_bldg',      'fa_accum_bldg', 'fa_depr_bldg', 'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: buildings often use a shorter internal planning life; default 30 years.'),
        ('PLANT',     'management', true,  'straight_line',   96,            60,            144,           'percent', 5.0000,             'half_year',  'in_service_date',        2.0000, 'fa_acq_plant',     'fa_accum_plant','fa_depr_plant','fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: plant and machinery planning range commonly 5 to 12 years; default 8 years.'),
        ('VEHICLES',  'management', true,  'declining_balance',48,           36,            60,            'percent', 10.0000,            'half_month', 'in_service_date',        1.0000, 'fa_acq_veh',       'fa_accum_veh',  'fa_depr_veh',  'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{"rate_pct":25}'::jsonb, 'Management view: accelerated depreciation often reflects vehicle consumption pattern; default 4 years at 25%.'),
        ('IT-EQUIP',  'management', true,  'straight_line',   36,            24,            48,            'zero',    NULL::numeric(9,4), 'half_month', 'in_service_date',        0.5000, 'fa_acq_it',        'fa_accum_it',   'fa_depr_it',   'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: IT equipment planning range commonly 2 to 4 years; default 3 years.'),
        ('FURNITURE', 'management', true,  'straight_line',   60,            48,            96,            'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        0.5000, 'fa_acq_furn',      'fa_accum_furn', 'fa_depr_furn', 'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: furniture planning range commonly 4 to 8 years; default 5 years.'),
        ('LHI',       'management', true,  'straight_line',   60,            12,            96,            'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        1.0000, 'fa_acq_lhi',       'fa_accum_lhi',  'fa_depr_lhi',  'fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: leasehold improvements default to expected lease term; default 5 years.'),
        ('TOOLS',     'management', true,  'straight_line',   36,            24,            60,            'zero',    NULL::numeric(9,4), 'half_month', 'in_service_date',        0.5000, 'fa_acq_tools',     'fa_accum_tools','fa_depr_tools','fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: tools and dies planning range commonly 2 to 5 years; default 3 years.'),
        ('SOFTWARE',  'management', true,  'straight_line',   36,            24,            60,            'zero',    NULL::numeric(9,4), 'full_month', 'capitalization_date',  0.5000, 'fa_acq_sw',        'fa_amort_sw',   'fa_depr_amort','fa_gainloss_disposal', 'fa_cwip', NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: finite-life software planning range commonly 2 to 5 years; default 3 years.'),
        ('ROU-PROP',  'management', true,  'straight_line',   60,            12,            120,           'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        1.0000, 'fa_acq_rou_prop',  'fa_accum_rou',  'fa_depr_rou',  'fa_gainloss_disposal', NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: right-of-use property defaults to expected lease term; default 5 years.'),
        ('ROU-EQUIP', 'management', true,  'straight_line',   36,            12,            60,            'zero',    NULL::numeric(9,4), 'full_month', 'in_service_date',        0.5000, 'fa_acq_rou_equip', 'fa_accum_rou',  'fa_depr_rou',  'fa_gainloss_disposal', NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: right-of-use equipment defaults to expected lease term; default 3 years.'),
        ('CWIP-GEN',  'management', false, 'no_depreciation', NULL::integer, NULL::integer, NULL::integer, 'zero',    NULL::numeric(9,4), NULL,         'in_service_date',        0.0000, 'fa_cwip',          NULL,            NULL,            NULL,                   NULL,      NULL,           NULL,           NULL,                   NULL,                  '{}'::jsonb, 'Management view: CWIP is not depreciated until ready for intended use and capitalized.')
    ) AS v(
        asset_class_code, book_category, is_depreciable, depreciation_method,
        useful_life_months, useful_life_min_months, useful_life_max_months,
        residual_value_mode, residual_value_pct,
        convention, depreciation_start_rule, threshold_multiplier,
        acquisition_role, accum_depr_role, depr_expense_role, gain_loss_role,
        cwip_role, impairment_expense_role, impairment_reserve_role,
        revaluation_surplus_role, revaluation_loss_role, method_params, source_note
    )
    ON CONFLICT (tenant_id, template_code, asset_class_code, book_category, effective_from)
    DO UPDATE SET
        framework                              = EXCLUDED.framework,
        capitalization_threshold_multiplier    = EXCLUDED.capitalization_threshold_multiplier,
        priority                               = EXCLUDED.priority,
        is_depreciable                         = EXCLUDED.is_depreciable,
        depreciation_method                    = EXCLUDED.depreciation_method,
        useful_life_months                     = EXCLUDED.useful_life_months,
        useful_life_min_months                 = EXCLUDED.useful_life_min_months,
        useful_life_max_months                 = EXCLUDED.useful_life_max_months,
        residual_value_mode                    = EXCLUDED.residual_value_mode,
        residual_value_amount                  = EXCLUDED.residual_value_amount,
        residual_value_pct                     = EXCLUDED.residual_value_pct,
        convention                             = EXCLUDED.convention,
        prorate_basis                          = EXCLUDED.prorate_basis,
        depreciation_start_rule                = EXCLUDED.depreciation_start_rule,
        method_params                          = EXCLUDED.method_params,
        source_note                            = EXCLUDED.source_note,
        allow_manual_life_override             = EXCLUDED.allow_manual_life_override,
        allow_manual_residual_override         = EXCLUDED.allow_manual_residual_override,
        allow_manual_method_override           = EXCLUDED.allow_manual_method_override,
        acquisition_posting_role_code          = EXCLUDED.acquisition_posting_role_code,
        accum_depr_posting_role_code           = EXCLUDED.accum_depr_posting_role_code,
        depr_expense_posting_role_code         = EXCLUDED.depr_expense_posting_role_code,
        gain_loss_posting_role_code            = EXCLUDED.gain_loss_posting_role_code,
        cwip_posting_role_code                 = EXCLUDED.cwip_posting_role_code,
        impairment_expense_posting_role_code   = EXCLUDED.impairment_expense_posting_role_code,
        impairment_reserve_posting_role_code   = EXCLUDED.impairment_reserve_posting_role_code,
        revaluation_surplus_posting_role_code  = EXCLUDED.revaluation_surplus_posting_role_code,
        revaluation_loss_posting_role_code     = EXCLUDED.revaluation_loss_posting_role_code,
        capitalization_event_code              = EXCLUDED.capitalization_event_code,
        disposal_event_code                    = EXCLUDED.disposal_event_code,
        depreciation_event_code                = EXCLUDED.depreciation_event_code,
        impairment_event_code                  = EXCLUDED.impairment_event_code,
        revaluation_event_code                 = EXCLUDED.revaluation_event_code,
        metadata                               = EXCLUDED.metadata,
        status                                 = EXCLUDED.status,
        updated_at                             = now(),
        updated_by                             = v_su;

    SELECT count(*) INTO v_count
    FROM control.asset_class_book_policy_template
    WHERE tenant_id IS NULL
      AND template_code = 'IFRS_DEFAULT'
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_count != 24 THEN
        RAISE EXCEPTION '[341_asset_policy_templates] Expected 24 IFRS_DEFAULT template rows, got %', v_count;
    END IF;

    RAISE NOTICE '[341_asset_policy_templates] OK: % IFRS_DEFAULT asset policy template rows seeded', v_count;
END $seed$;
