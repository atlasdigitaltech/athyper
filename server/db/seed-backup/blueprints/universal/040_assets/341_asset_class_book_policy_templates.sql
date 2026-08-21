-- seed-contract-version: 1
-- seed-pack: neon.blueprint.asset-policies
-- seed-pack-version: 2.0.0
-- seed-dataset: control.asset-class-book-policy
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 5 IFRS asset-policy rewrite","publisher":"Athyper","source_version":"IFRS_DEFAULT-v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-natural-key: control.asset_class_book_policy(tenant_id,company_code_id,asset_class_id,ledger_book_id,effective_from)
-- seed-id-strategy: deterministic-uuid:athyper-wave5-asset-policy-v2
-- seed-expected-row-count: 12-per-active-assigned-statutory-or-management-book
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence
-- seed-demo-data: false

DO $seed$
DECLARE
  v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
  v_actor uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
  v_expected integer;
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' OR v_tid IS NULL
     OR NOT EXISTS (SELECT 1 FROM master.tenant WHERE id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.asset-policy] active Neon tenant scope required';
  END IF;
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM master.principal
    WHERE tenant_id = v_tid AND id = v_actor AND status = 'active'
  ) THEN
    RAISE EXCEPTION '[wave5.asset-policy] active tenant-local app.current_principal_id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM master.company_code_book_assignment WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.asset-policy] at least one active company/book assignment required';
  END IF;

  WITH policy_template(asset_class_code, book_category, is_depreciable, depreciation_method, useful_life_months, useful_life_min_months, useful_life_max_months, residual_value_mode, residual_value_pct, convention, depreciation_start_rule, threshold_multiplier, acquisition_role, accum_depr_role, depr_expense_role, gain_loss_role, cwip_role, impairment_expense_role, impairment_reserve_role, revaluation_surplus_role, revaluation_loss_role, method_params, source_note) AS (VALUES
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
  ), currency_threshold(currency_code,base_threshold) AS (VALUES
    ('MYR'::character(3),5000::numeric),('SAR',5000),('AED',5000),('USD',1000),
    ('SGD',1500),('INR',50000),('CAD',1000),('EUR',1000),('TWD',30000),
    ('ZAR',10000),('GBP',1000),('JPY',100000),('PHP',50000)
  ), resolved AS (
    SELECT cc.id company_id, ac.id class_id, lb.id book_id,
      COALESCE(ba.override_currency_code,lb.base_currency_code) currency_code,
      COALESCE(ct.base_threshold,1000)*p.threshold_multiplier threshold,
      p.*
    FROM policy_template p
    JOIN master.asset_class ac ON ac.tenant_id=v_tid AND ac.code=p.asset_class_code AND ac.status='active'
    JOIN master.ledger_book lb ON lb.tenant_id=v_tid AND lb.category=p.book_category AND lb.status='active'
    JOIN master.company_code_book_assignment ba ON ba.tenant_id=v_tid AND ba.book_id=lb.id AND ba.status='active'
      AND ba.effective_from<=DATE '2025-01-01' AND (ba.effective_to IS NULL OR ba.effective_to>=DATE '2025-01-01')
    JOIN master.company_code cc ON cc.tenant_id=v_tid AND cc.id=ba.company_code_id AND cc.status='active'
    LEFT JOIN currency_threshold ct ON ct.currency_code=COALESCE(ba.override_currency_code,lb.base_currency_code)
  )
  INSERT INTO control.asset_class_book_policy(
    id,tenant_id,company_code_id,asset_class_id,ledger_book_id,capitalization_threshold,
    capitalization_currency,effective_from,depreciation_method,useful_life_months,
    residual_value_mode,residual_value_pct,convention,prorate_basis,depreciation_start_rule,
    method_params,allow_manual_life_override,allow_manual_residual_override,allow_manual_method_override,
    acquisition_posting_role_code,accum_depr_posting_role_code,depr_expense_posting_role_code,
    gain_loss_posting_role_code,impairment_expense_posting_role_code,impairment_reserve_posting_role_code,
    revaluation_surplus_posting_role_code,revaluation_loss_posting_role_code,cwip_posting_role_code,
    metadata,status,created_by)
  SELECT md5('wave5:asset-policy:'||v_tid||':'||company_id||':'||class_id||':'||book_id||':2025-01-01')::uuid,
    v_tid,company_id,class_id,book_id,threshold,CASE WHEN threshold=0 THEN NULL ELSE currency_code END,DATE '2025-01-01',
    depreciation_method,COALESCE(useful_life_months,0),residual_value_mode,residual_value_pct,convention,
    'monthly',depreciation_start_rule,method_params,is_depreciable,is_depreciable,false,
    acquisition_role,accum_depr_role,depr_expense_role,gain_loss_role,impairment_expense_role,
    impairment_reserve_role,revaluation_surplus_role,revaluation_loss_role,cwip_role,
    jsonb_build_object('_seed',jsonb_build_object('pack','asset-policies','version','2.0.0'),
      'framework','ifrs','source_note',source_note,'useful_life_min_months',useful_life_min_months,
      'useful_life_max_months',useful_life_max_months),'active',v_actor
  FROM resolved
  ON CONFLICT(tenant_id,company_code_id,asset_class_id,ledger_book_id,effective_from) DO UPDATE SET
    capitalization_threshold=excluded.capitalization_threshold,capitalization_currency=excluded.capitalization_currency,
    depreciation_method=excluded.depreciation_method,useful_life_months=excluded.useful_life_months,
    residual_value_mode=excluded.residual_value_mode,residual_value_pct=excluded.residual_value_pct,
    convention=excluded.convention,prorate_basis=excluded.prorate_basis,
    depreciation_start_rule=excluded.depreciation_start_rule,method_params=excluded.method_params,
    allow_manual_life_override=excluded.allow_manual_life_override,
    allow_manual_residual_override=excluded.allow_manual_residual_override,
    allow_manual_method_override=excluded.allow_manual_method_override,
    acquisition_posting_role_code=excluded.acquisition_posting_role_code,
    accum_depr_posting_role_code=excluded.accum_depr_posting_role_code,
    depr_expense_posting_role_code=excluded.depr_expense_posting_role_code,
    gain_loss_posting_role_code=excluded.gain_loss_posting_role_code,
    impairment_expense_posting_role_code=excluded.impairment_expense_posting_role_code,
    impairment_reserve_posting_role_code=excluded.impairment_reserve_posting_role_code,
    revaluation_surplus_posting_role_code=excluded.revaluation_surplus_posting_role_code,
    revaluation_loss_posting_role_code=excluded.revaluation_loss_posting_role_code,
    cwip_posting_role_code=excluded.cwip_posting_role_code,metadata=excluded.metadata,status='active',
    updated_at=now(),updated_by=v_actor
  WHERE (control.asset_class_book_policy.capitalization_threshold,
         control.asset_class_book_policy.capitalization_currency,
         control.asset_class_book_policy.depreciation_method,
         control.asset_class_book_policy.useful_life_months,
         control.asset_class_book_policy.residual_value_mode,
         control.asset_class_book_policy.residual_value_pct,
         control.asset_class_book_policy.convention,
         control.asset_class_book_policy.method_params,
         control.asset_class_book_policy.metadata,
         control.asset_class_book_policy.status)
    IS DISTINCT FROM
        (excluded.capitalization_threshold,excluded.capitalization_currency,
         excluded.depreciation_method,excluded.useful_life_months,
         excluded.residual_value_mode,excluded.residual_value_pct,excluded.convention,
         excluded.method_params,excluded.metadata,'active'::shared.active_inactive_d);

  SELECT count(*)*12 INTO v_expected FROM master.company_code_book_assignment ba
  JOIN master.ledger_book lb ON lb.tenant_id=ba.tenant_id AND lb.id=ba.book_id AND lb.status='active'
  WHERE ba.tenant_id=v_tid AND ba.status='active' AND lb.category IN ('statutory','management')
    AND ba.effective_from<=DATE '2025-01-01' AND (ba.effective_to IS NULL OR ba.effective_to>=DATE '2025-01-01');
  IF (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id=v_tid
      AND metadata->'_seed'->>'pack'='asset-policies') <> v_expected THEN
    RAISE EXCEPTION '[wave5.asset-policy] expected % effective policies',v_expected;
  END IF;
END $seed$;
