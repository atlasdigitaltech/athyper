-- leave_type + leave_plan + leave_plan_rule. 17 leave types, 14 generic plans
-- (no legal_entity/company binding), ~28 rules.
-- employee_leave_enrollment is intentionally NOT seeded â€” needs live employee_id
-- + leave_plan_id and is therefore handled by onboarding scripts/UI.
--
-- eligibility_condition JSONB shape:
--   { after_probation: bool, min_tenure_days: int, employment_types: [string],
--     gender: string|null, requires_approval: bool, requires_documentation: bool,
--     tenure_condition: {operator, min_years, max_years}|null, max_per_year: int|null }
--
-- carry_forward_policy JSONB shape:
--   { max_carry_days: int, carry_expiry_months: int,
--     payout_on_exit: bool,
--     payout_capped_days: int|null  -- null when payout_on_exit=false; int = day cap when true
--   }
--
-- eligibility_condition rule-type-specific extras:
--   sick: cert_required_after_consecutive_days, cert_type
--   bereavement: relationship_tier
--   parental: is_primary_caregiver
--   TOIL: accrual_ratio (e.g. "1:1")
--   study: doc_type
--   LOA: approvers[], min_duration_days

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := 'universal_hr_leave_management';
    v_ver  text := '1.0.0';
    v_n    int;
BEGIN
    CREATE TEMP SEQUENCE IF NOT EXISTS wave5_people_leave_seq START WITH 1 INCREMENT BY 1;
    ALTER SEQUENCE pg_temp.wave5_people_leave_seq RESTART WITH 1;
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set â€” run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    RAISE NOTICE '[%] Starting leave management seed for tenant %', v_pack, v_tid;

    -- leave_category CHECK: annual / sick / maternity / paternity /
    -- bereavement / unpaid / compensatory / study / other.  unit CHECK: day / hour.
    INSERT INTO master.leave_type (
        id, tenant_id, code, name,
        leave_category, unit, is_paid, requires_attachment,
        status, created_by
    )
    VALUES
        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'annual_leave',          'Annual Leave',
         'annual',       'day',  true,  false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'sick_leave',            'Sick Leave',
         'sick',         'day',  true,  false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'maternity_leave',       'Maternity Leave',
         'maternity',    'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'paternity_leave',       'Paternity Leave',
         'paternity',    'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'parental_leave',        'Shared Parental Leave',
         'other',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'adoption_leave',        'Adoption Leave',
         'other',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'bereavement_leave',     'Bereavement Leave',
         'bereavement',  'day',  true,  false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'study_leave',           'Study / Education Leave',
         'study',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'unpaid_leave',          'Unpaid Leave of Absence',
         'unpaid',       'day',  false, false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'compensatory_leave',    'Compensatory / TOIL Leave',
         'compensatory', 'day',  true,  false, 'active', v_su),

        -- â”€â”€ Special / civic leave (maps to "other" category) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'marriage_leave',        'Marriage / Civil Partnership Leave',
         'other',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'jury_duty_leave',       'Jury Duty / Civic Duty Leave',
         'other',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'military_leave',        'Military / Reserve Duty Leave',
         'other',        'day',  true,  true,  'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'emergency_leave',       'Emergency Family Leave',
         'other',        'day',  true,  false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'sabbatical_leave',      'Sabbatical Leave',
         'other',        'day',  false, false, 'active', v_su),

        -- â”€â”€ Hourly leave types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'medical_appt_leave',   'Medical Appointment Leave',
         'sick',         'hour', true,  false, 'active', v_su),

        (md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, 'blood_donation_leave', 'Blood Donation Leave',
         'other',        'hour', true,  false, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name                = EXCLUDED.name,
            leave_category      = EXCLUDED.leave_category,
            unit                = EXCLUDED.unit,
            is_paid             = EXCLUDED.is_paid,
            requires_attachment = EXCLUDED.requires_attachment,
            updated_at          = now(),
            updated_by          = v_su
        WHERE (master.leave_type.name, master.leave_type.leave_category,
               master.leave_type.unit, master.leave_type.is_paid,
               master.leave_type.requires_attachment)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.leave_category,
                                EXCLUDED.unit, EXCLUDED.is_paid,
                                EXCLUDED.requires_attachment);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] leave_type: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- LEAVE PLANS  (14 generic templates)
    -- legal_entity_id / company_code_id left NULL â†’ applicable everywhere.
    -- country_code left NULL â†’ country-neutral templates; create localised
    -- variants (e.g., code='std_annual_20d_gb') in a separate country pack.
    -- accrual_frequency CHECK: daily Â· weekly Â· monthly Â· quarterly Â·
    --   annual Â· on_hire Â· manual
    -- ========================================================================
    INSERT INTO master.leave_plan (
        id, tenant_id, code, name,
        leave_type_id, country_code,
        legal_entity_id, company_code_id,
        accrual_frequency, carry_forward_policy,
        status, created_by
    )
    SELECT md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid, x.code, x.name,
           (SELECT id FROM master.leave_type WHERE tenant_id = v_tid AND code = x.lt_code),
           NULL, NULL, NULL,
           x.freq,
           x.cfp::jsonb,
           'active', v_su
    FROM (VALUES

        -- Annual leave â€” 20 days flat (most common international standard)
        ('std_annual_20d', 'Standard Annual Leave (20 Days)',
         'annual_leave', 'monthly',
         '{"max_carry_days":5,"carry_expiry_months":3,"payout_on_exit":true,"payout_capped_days":null}'),

        -- Annual leave â€” 15 days (lower-tier or probationary entitlement)
        ('std_annual_15d', 'Base Annual Leave (15 Days)',
         'annual_leave', 'monthly',
         '{"max_carry_days":3,"carry_expiry_months":3,"payout_on_exit":true,"payout_capped_days":15}'),

        -- Tenure-graduated annual leave (15 â†’ 18 â†’ 21 days)
        ('tenure_annual', 'Tenure-Based Annual Leave (15â†’18â†’21 Days)',
         'annual_leave', 'monthly',
         '{"max_carry_days":5,"carry_expiry_months":3,"payout_on_exit":true,"payout_capped_days":null}'),

        -- Sick leave â€” 10 days fixed per year
        ('std_sick_10d', 'Standard Sick Leave (10 Days)',
         'sick_leave', 'annual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Unlimited sick leave â€” subject to manager approval
        ('unlimited_sick', 'Unlimited Sick Leave (Manager Approved)',
         'sick_leave', 'manual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Maternity leave â€” 16 weeks (112 days), ILO minimum = 14 weeks
        ('maternity_16w', 'Maternity Leave (16 Weeks)',
         'maternity_leave', 'on_hire',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Paternity leave â€” 2 weeks (14 days)
        ('paternity_2w', 'Paternity Leave (2 Weeks)',
         'paternity_leave', 'on_hire',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Shared parental leave â€” up to 52 weeks shared between parents
        ('shared_parental', 'Shared Parental Leave (Up to 52 Weeks)',
         'parental_leave', 'on_hire',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Adoption leave â€” mirrors maternity, 16 weeks
        ('adoption_16w', 'Adoption Leave (16 Weeks)',
         'adoption_leave', 'on_hire',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Bereavement leave â€” standard plan, rules split by relationship tier
        ('std_bereavement', 'Standard Bereavement Leave',
         'bereavement_leave', 'manual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Study leave â€” 5 days per year with proof of enrolment
        ('std_study_5d', 'Study / Education Leave (5 Days)',
         'study_leave', 'annual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Compensatory / TOIL â€” accrues from approved overtime, 1:1 ratio
        ('compensatory_toil', 'Compensatory Leave / TOIL',
         'compensatory_leave', 'manual',
         '{"max_carry_days":30,"carry_expiry_months":6,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Emergency leave â€” 3 days per year; no carry, no payout
        ('emergency_3d', 'Emergency Family Leave (3 Days)',
         'emergency_leave', 'annual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}'),

        -- Unpaid leave of absence â€” manager + HR approval, no fixed limit
        ('unpaid_loa', 'Unpaid Leave of Absence',
         'unpaid_leave', 'manual',
         '{"max_carry_days":0,"carry_expiry_months":0,"payout_on_exit":false,"payout_capped_days":null}')

    ) AS x(code, name, lt_code, freq, cfp)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name                 = EXCLUDED.name,
            leave_type_id        = EXCLUDED.leave_type_id,
            accrual_frequency    = EXCLUDED.accrual_frequency,
            carry_forward_policy = EXCLUDED.carry_forward_policy,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.leave_plan.name, master.leave_plan.leave_type_id,
               master.leave_plan.accrual_frequency, master.leave_plan.carry_forward_policy)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.leave_type_id,
                                EXCLUDED.accrual_frequency, EXCLUDED.carry_forward_policy);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] leave_plan: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- LEAVE PLAN RULES  (~28 rules)
    --
    -- Ordering: lower priority number = evaluated first.
    -- entitlement_quantity: NULL means formula/unlimited; numeric = fixed days.
    -- eligibility_condition: structured JSONB; NULL = universal eligibility.
    -- accrual_formula_version_id: NULL = no formula (engine uses quantity).
    -- ========================================================================
    INSERT INTO master.leave_plan_rule (
        id, tenant_id, leave_plan_id, rule_code, priority,
        eligibility_condition, entitlement_quantity,
        accrual_formula_version_id, status, created_by
    )
    SELECT md5('wave5:people-payroll:leave-management:' || v_tid || ':' || nextval('pg_temp.wave5_people_leave_seq'))::uuid, v_tid,
           (SELECT id FROM master.leave_plan WHERE tenant_id = v_tid AND code = x.plan_code),
           x.rule_code, x.priority,
           x.elig::jsonb,
           x.qty,
           NULL, 'active', v_su
    FROM (VALUES

        -- â”€â”€ std_annual_20d â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Rule 1: permanent employees after 90-day probation â†’ 20 days/year
        ('std_annual_20d', 'perm_after_probation', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":null,"max_per_year":null}',
         20.0000::numeric),

        -- Rule 2: contract employees eligible on same terms (common globally)
        ('std_annual_20d', 'contract_employees', 20::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["contract"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":null,"max_per_year":null}',
         20.0000),

        -- â”€â”€ std_annual_15d â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('std_annual_15d', 'all_employees_15d', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time","contract"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":null,"max_per_year":null}',
         15.0000),

        -- â”€â”€ tenure_annual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Rule 1: 0â€“2 years â†’ 15 days
        ('tenure_annual', 'yr0_to_2', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time","contract"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":{"operator":"between","min_years":0,"max_years":2},"max_per_year":null}',
         15.0000),

        -- Rule 2: 3â€“5 years â†’ 18 days
        ('tenure_annual', 'yr3_to_5', 20::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time","contract"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":{"operator":"between","min_years":3,"max_years":5},"max_per_year":null}',
         18.0000),

        -- Rule 3: 6+ years â†’ 21 days
        ('tenure_annual', 'yr6_plus', 30::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time","contract"],"gender":null,"requires_approval":false,"requires_documentation":false,"tenure_condition":{"operator":"gte","min_years":6,"max_years":null},"max_per_year":null}',
         21.0000),

        -- â”€â”€ std_sick_10d â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Rule 1: 10 days fixed; medical certificate required after 3 consecutive days
        ('std_sick_10d', 'base_sick_10d', 10::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time","contract","casual"],"gender":null,"requires_approval":false,"requires_documentation":false,"cert_required_after_consecutive_days":3,"max_per_year":10}',
         10.0000),

        -- Rule 2: extended sick for chronic/long-term illness (additional 10 days with specialist cert)
        ('std_sick_10d', 'extended_chronic', 20::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":true,"cert_type":"specialist","max_per_year":10}',
         10.0000),

        -- â”€â”€ unlimited_sick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('unlimited_sick', 'unlimited_approved', 10::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":true,"cert_required_after_consecutive_days":1,"max_per_year":null}',
         NULL),

        -- â”€â”€ maternity_16w â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- 112 days = 16 weeks; eligible after 6 months service (180 days)
        ('maternity_16w', 'birth_mother', 10::smallint,
         '{"after_probation":true,"min_tenure_days":180,"employment_types":["full_time","part_time"],"gender":"female","requires_approval":false,"requires_documentation":true,"max_per_year":null}',
         112.0000),

        -- Reduced entitlement for < 6 months service (some jurisdictions)
        ('maternity_16w', 'birth_mother_short_tenure', 20::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time"],"gender":"female","requires_approval":false,"requires_documentation":true,"tenure_condition":{"operator":"between","min_years":0,"max_years":0.5},"max_per_year":null}',
         56.0000),

        -- â”€â”€ paternity_2w â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('paternity_2w', 'non_birth_parent', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time","contract"],"gender":null,"requires_approval":false,"requires_documentation":true,"max_per_year":null}',
         14.0000),

        -- â”€â”€ shared_parental â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Primary caregiver â€” up to 26 weeks (182 days)
        ('shared_parental', 'primary_caregiver', 10::smallint,
         '{"after_probation":true,"min_tenure_days":180,"employment_types":["full_time","part_time"],"gender":null,"is_primary_caregiver":true,"requires_approval":false,"requires_documentation":true,"max_per_year":null}',
         182.0000),

        -- Secondary caregiver â€” up to 13 weeks (91 days) of the primary entitlement
        ('shared_parental', 'secondary_caregiver', 20::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time"],"gender":null,"is_primary_caregiver":false,"requires_approval":false,"requires_documentation":true,"max_per_year":null}',
         91.0000),

        -- â”€â”€ adoption_16w â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('adoption_16w', 'primary_adopter', 10::smallint,
         '{"after_probation":true,"min_tenure_days":180,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":false,"requires_documentation":true,"max_per_year":null}',
         112.0000),

        -- â”€â”€ std_bereavement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Immediate family (spouse/partner, parent, child, sibling) â†’ 5 days
        ('std_bereavement', 'immediate_family', 10::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time","contract","casual"],"gender":null,"requires_approval":false,"requires_documentation":false,"relationship_tier":"immediate","max_per_year":null}',
         5.0000),

        -- Extended family (grandparent, parent-in-law, sibling-in-law) â†’ 3 days
        ('std_bereavement', 'extended_family', 20::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time","contract","casual"],"gender":null,"requires_approval":false,"requires_documentation":false,"relationship_tier":"extended","max_per_year":null}',
         3.0000),

        -- Close friend / colleague â€” discretionary 1 day
        ('std_bereavement', 'close_friend', 30::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":false,"relationship_tier":"close_friend","max_per_year":null}',
         1.0000),

        -- â”€â”€ std_study_5d â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Formal external course / professional exam with enrolment proof
        ('std_study_5d', 'formal_study_approved', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":true,"doc_type":"enrolment_letter_or_exam_notice","max_per_year":5}',
         5.0000),

        -- â”€â”€ compensatory_toil â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- 1:1 ratio; overtime must be pre-approved; expires in 6 months
        ('compensatory_toil', 'toil_1to1', 10::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":false,"accrual_ratio":"1:1","max_per_year":null}',
         NULL),

        -- â”€â”€ emergency_3d â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Immediate family emergency; no documentation required but HR notified
        ('emergency_3d', 'immediate_emergency', 10::smallint,
         '{"after_probation":false,"min_tenure_days":0,"employment_types":["full_time","part_time","contract","casual"],"gender":null,"requires_approval":false,"requires_documentation":false,"max_per_year":3}',
         3.0000),

        -- â”€â”€ unpaid_loa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        -- Both manager + HR must approve; no fixed duration cap
        ('unpaid_loa', 'manager_hr_approved', 10::smallint,
         '{"after_probation":true,"min_tenure_days":90,"employment_types":["full_time","part_time"],"gender":null,"requires_approval":true,"requires_documentation":false,"approvers":["manager","hr"],"max_per_year":null}',
         NULL),

        -- Long-term LOA (> 3 months): board / executive approval required
        ('unpaid_loa', 'long_term_board_approved', 20::smallint,
         '{"after_probation":true,"min_tenure_days":365,"employment_types":["full_time"],"gender":null,"requires_approval":true,"requires_documentation":false,"approvers":["manager","hr","board"],"min_duration_days":91,"max_per_year":null}',
         NULL)

        -- Note: marriage_leave, jury_duty_leave, military_leave, sabbatical_leave
        -- and blood_donation_leave have no plan rules here â€” add them in a
        -- country-specific pack (e.g., 070_people/331_leave_rules_sg.sql).

    ) AS x(plan_code, rule_code, priority, elig, qty)
    ON CONFLICT (tenant_id, leave_plan_id, rule_code) DO UPDATE
        SET priority               = EXCLUDED.priority,
            eligibility_condition  = EXCLUDED.eligibility_condition,
            entitlement_quantity   = EXCLUDED.entitlement_quantity,
            updated_at             = now(),
            updated_by             = v_su
        WHERE (master.leave_plan_rule.priority,
               master.leave_plan_rule.eligibility_condition,
               master.leave_plan_rule.entitlement_quantity)
              IS DISTINCT FROM (EXCLUDED.priority,
                                EXCLUDED.eligibility_condition,
                                EXCLUDED.entitlement_quantity);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] leave_plan_rule: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- NOTE: employee_leave_enrollment (LVENTR) intentionally skipped.
    --   Enrollment is personnel-specific and cannot be seeded universally.
    --   Enrol employees after onboarding using:
    --     POST /api/records/employee_leave_enrollment
    --   or the leave administration UI.
    -- ========================================================================
    RAISE NOTICE '[%] employee_leave_enrollment skipped â€” requires live employee data', v_pack;

    -- ========================================================================
    -- ASSERTIONS
    -- ========================================================================
    SELECT COUNT(*) INTO v_n FROM master.leave_type WHERE tenant_id = v_tid;
    IF v_n < 17 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 17 leave_type rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.leave_plan WHERE tenant_id = v_tid;
    IF v_n < 14 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 14 leave_plan rows, found %', v_pack, v_n;
    END IF;

    -- Every leave plan must have at least one rule
    SELECT COUNT(*) INTO v_n
    FROM master.leave_plan lp
    LEFT JOIN master.leave_plan_rule lpr
           ON lpr.tenant_id = lp.tenant_id AND lpr.leave_plan_id = lp.id
    WHERE lp.tenant_id = v_tid
      AND lpr.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % leave_plans have no rules', v_pack, v_n;
    END IF;

    -- No leave plan should have a broken leave_type_id FK
    SELECT COUNT(*) INTO v_n
    FROM master.leave_plan lp
    LEFT JOIN master.leave_type lt
           ON lt.tenant_id = lp.tenant_id AND lt.id = lp.leave_type_id
    WHERE lp.tenant_id = v_tid AND lt.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % leave_plans have a broken leave_type_id FK', v_pack, v_n;
    END IF;

    -- Rules with a non-null entitlement_quantity must have quantity >= 0
    SELECT COUNT(*) INTO v_n
    FROM master.leave_plan_rule lpr
    JOIN master.leave_plan lp ON lp.id = lpr.leave_plan_id AND lp.tenant_id = lpr.tenant_id
    WHERE lpr.tenant_id = v_tid
      AND lpr.entitlement_quantity IS NOT NULL
      AND lpr.entitlement_quantity < 0;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % rules have negative entitlement_quantity', v_pack, v_n;
    END IF;

    RAISE NOTICE '[%] All assertions passed', v_pack;
    RAISE NOTICE '[%] Summary â€” leave_types: %, plans: %, rules: %',
        v_pack,
        (SELECT COUNT(*) FROM master.leave_type     WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.leave_plan      WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.leave_plan_rule lpr
           JOIN master.leave_plan lp ON lp.id = lpr.leave_plan_id AND lp.tenant_id = lpr.tenant_id
          WHERE lpr.tenant_id = v_tid);

END $seed$;
