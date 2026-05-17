-- 035_version_fields/023_fields_medium_confidence_enum_patches.sql
-- Assigns enum_domain_code to all MEDIUM-confidence enum fields across all
-- platform entities — fields that required new lookup domains to be created
-- first (see 000_lookups/LookupDomain/master/ for the new value files).
--
-- Domains created in this batch (000_lookup_domains.sql extension):
--   IAM/Identity: principal_source, idp_provider_type, contact_phone_line_type,
--                 access_effect, visibility_scope, assignment_scope_type,
--                 feature_access_type, team_type, owner_type_category, acl_access_level
--   Org:          business_unit_type
--   Tax/FX:       tax_jurisdiction_type, tax_filing_frequency, tax_category,
--                 fx_rate_type, fx_rate_source
--   Budget:       budget_fund_type, budget_fund_source, budget_multi_year_strategy,
--                 budget_overspend_policy, planning_model_type,
--                 planning_model_horizon, planning_granularity
--   Payment Terms: payment_term_applicable_to, payment_due_rule_type,
--                  payment_date_flexibility, business_day_convention,
--                  payment_term_clause_type, payment_term_calc_mode,
--                  payment_term_flexibility_mode, payment_term_application_scope,
--                  payment_term_basis_amount_mode, payment_term_discount_basis_mode,
--                  payment_rounding_method
--   Holiday Cal:  holiday_weekend_pattern, holiday_day_type, holiday_observance_type
--
-- Constraint notes:
--   ef_enum_xor_chk: NOT (enum_config IS NOT NULL AND enum_domain_code IS NOT NULL)
--   → always NULL-out enum_config when assigning enum_domain_code.
--
-- Idempotent: IS DISTINCT FROM guard skips already-patched rows.

DO $$
DECLARE
    v_su   uuid    := '00000000-0000-0000-0000-000000000000';
    v_main integer := 0;
    v_pay  integer := 0;
    v_hol  integer := 0;
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 1 — IAM / Identity / Org / Tax / FX / Budget / Planning fields
    --          All already data_type = 'enum': assign enum_domain_code only.
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        enum_domain_code = mapping.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        -- ── IAM / Identity (001_fields_identity.sql) ──────────────────────────
        ('principal',                  'principal_source',       'master.principal_source'),
        ('contact_phone',              'line_type',              'master.contact_phone_line_type'),
        ('principal_identity_binding', 'provider_code',          'master.idp_provider_type'),
        ('access_grant',               'effect',                 'master.access_effect'),
        ('access_grant',               'visibility_scope',       'master.visibility_scope'),
        ('access_grant',               'assignment_scope_type',  'master.assignment_scope_type'),
        ('auth_group_role',            'visibility_scope',       'master.visibility_scope'),
        ('auth_group_role',            'assignment_scope_type',  'master.assignment_scope_type'),
        ('group_feature_grant',        'access_type',            'master.feature_access_type'),
        ('principal_feature_grant',    'access_type',            'master.feature_access_type'),
        ('team',                       'team_type',              'master.team_type'),
        ('owner_type',                 'category',               'master.owner_type_category'),
        -- ── Content (003_fields_content.sql) ─────────────────────────────────
        ('attachment_acl',             'access_level',           'master.acl_access_level'),
        -- ── Finance Org (005_fields_finance_org.sql) ──────────────────────────
        ('business_unit',              'bu_type',                'master.business_unit_type'),
        -- ── Tax / FX (011_fields_tax_fx.sql) ─────────────────────────────────
        ('tax_jurisdiction',           'jurisdiction_type',      'master.tax_jurisdiction_type'),
        ('tax_jurisdiction',           'filing_frequency',       'master.tax_filing_frequency'),
        ('tax_type',                   'category',               'master.tax_category'),
        ('fx_rate',                    'rate_type',              'master.fx_rate_type'),
        ('fx_rate',                    'source',                 'master.fx_rate_source'),
        -- ── Budget / Planning (012_fields_budget.sql) ─────────────────────────
        ('budget_profile',             'fund_type',              'master.budget_fund_type'),
        ('budget_profile',             'fund_source',            'master.budget_fund_source'),
        ('budget_profile',             'multi_year_strategy',    'master.budget_multi_year_strategy'),
        ('budget_profile',             'overspend_policy',       'master.budget_overspend_policy'),
        ('budget_allocation',          'overspend_policy',       'master.budget_overspend_policy'),
        ('planning_model',             'model_type',             'master.planning_model_type'),
        ('planning_model',             'planning_horizon',       'master.planning_model_horizon'),
        ('planning_model',             'granularity',            'master.planning_granularity')
    ) AS mapping(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = mapping.ename
      AND ef.column_name       = mapping.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM mapping.domain;

    GET DIAGNOSTICS v_main = ROW_COUNT;
    RAISE NOTICE 'Pass 1 (IAM/Org/Tax/FX/Budget): % rows updated', v_main;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 2 — Payment Terms extension fields (014_fields_payment_terms.sql)
    --          payment_term: applicable_to, due_rule_type, due_date_flexibility,
    --                        business_day_convention
    --          payment_term_clause: clause_type, calc_mode, flexibility_mode,
    --                               application_scope, basis_amount_mode,
    --                               rounding_method
    --          payment_term_discount_tier: discount_basis_mode
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        enum_domain_code = mapping.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        ('payment_term',              'applicable_to',          'master.payment_term_applicable_to'),
        ('payment_term',              'due_rule_type',          'master.payment_due_rule_type'),
        ('payment_term',              'due_date_flexibility',   'master.payment_date_flexibility'),
        ('payment_term',              'business_day_convention','master.business_day_convention'),
        ('payment_term_clause',       'clause_type',            'master.payment_term_clause_type'),
        ('payment_term_clause',       'calc_mode',              'master.payment_term_calc_mode'),
        ('payment_term_clause',       'flexibility_mode',       'master.payment_term_flexibility_mode'),
        ('payment_term_clause',       'application_scope',      'master.payment_term_application_scope'),
        ('payment_term_clause',       'basis_amount_mode',      'master.payment_term_basis_amount_mode'),
        ('payment_term_clause',       'rounding_method',        'master.payment_rounding_method'),
        ('payment_term_discount_tier','discount_basis_mode',    'master.payment_term_discount_basis_mode')
    ) AS mapping(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = mapping.ename
      AND ef.column_name       = mapping.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM mapping.domain;

    GET DIAGNOSTICS v_pay = ROW_COUNT;
    RAISE NOTICE 'Pass 2 (Payment Terms extension): % rows updated', v_pay;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 3 — Holiday Calendar fields (014_fields_payment_terms.sql)
    --          holiday_calendar: weekend_pattern
    --          holiday_calendar_day: day_type, observance_type
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        enum_domain_code = mapping.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        ('holiday_calendar',     'weekend_pattern',  'master.holiday_weekend_pattern'),
        ('holiday_calendar_day', 'day_type',         'master.holiday_day_type'),
        ('holiday_calendar_day', 'observance_type',  'master.holiday_observance_type')
    ) AS mapping(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = mapping.ename
      AND ef.column_name       = mapping.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM mapping.domain;

    GET DIAGNOSTICS v_hol = ROW_COUNT;
    RAISE NOTICE 'Pass 3 (Holiday Calendar): % rows updated', v_hol;

    RAISE NOTICE 'Medium-confidence enum patch complete: % + % + % = % total field updates',
        v_main, v_pay, v_hol, v_main + v_pay + v_hol;

END $$;
