-- ============================================================================
-- master/03_people_constraints.sql
-- Cross-schema People constraints that must wait until control tables exist.
-- ============================================================================

ALTER TABLE master.external_reference DROP CONSTRAINT IF EXISTS external_reference_owner_uq;

ALTER TABLE master.pay_grade DROP CONSTRAINT IF EXISTS pay_grade_amount_chk;
ALTER TABLE master.pay_grade ADD CONSTRAINT pay_grade_amount_chk CHECK (
    (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount)
    AND (midpoint_amount IS NULL OR min_amount IS NULL OR midpoint_amount >= min_amount)
    AND (midpoint_amount IS NULL OR max_amount IS NULL OR midpoint_amount <= max_amount)
);

DO $$
BEGIN
    ALTER TABLE master.org_unit
        ADD CONSTRAINT org_unit_parent_fk
        FOREIGN KEY (tenant_id, parent_id) REFERENCES master.org_unit (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.employment
        ADD CONSTRAINT employment_status_date_chk CHECK (
            (status = 'terminated' AND termination_date IS NOT NULL)
            OR (status <> 'terminated')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.employment
        ADD CONSTRAINT employment_type_chk CHECK (
            employment_type IN ('full_time','part_time','contract','casual','intern','volunteer')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE master.employment DROP CONSTRAINT IF EXISTS employment_status_consistency_chk;
DO $$
BEGIN
    ALTER TABLE master.employment
        ADD CONSTRAINT employment_status_consistency_chk CHECK (employment_status = status);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.position
        ADD CONSTRAINT position_type_chk CHECK (
            position_type IN ('regular','contract','temporary','internship','vacant','other')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.work_pattern
        ADD CONSTRAINT work_pattern_type_chk CHECK (
            pattern_type IN ('weekly','bi_weekly','monthly','rotating','fixed','flexible')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.leave_type
        ADD CONSTRAINT leave_type_category_chk CHECK (
            leave_category IN ('annual','sick','maternity','paternity','bereavement','unpaid','compensatory','study','other')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.work_pattern_day
        ADD CONSTRAINT work_pattern_day_planned_chk CHECK (
            start_time IS NULL OR end_time IS NULL
            OR planned_minutes = ((EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int - break_minutes)
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.shift_type
        ADD CONSTRAINT shift_type_time_order_chk CHECK (is_overnight OR end_time > start_time);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.leave_plan
        ADD CONSTRAINT leave_plan_frequency_chk CHECK (
            accrual_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'on_hire', 'manual')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.pay_group
        ADD CONSTRAINT pay_group_frequency_chk CHECK (
            pay_frequency IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.statutory_scheme
        ADD CONSTRAINT statutory_scheme_type_chk CHECK (
            scheme_type IN ('pension', 'social_security', 'income_tax', 'healthcare', 'workers_comp', 'other')
        );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE master.pay_structure
    DROP CONSTRAINT IF EXISTS pay_structure_no_overlap_excl;
DROP INDEX IF EXISTS master.pay_structure_no_overlap_excl;
ALTER TABLE master.pay_structure
    ADD CONSTRAINT pay_structure_no_overlap_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        pay_group_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    )
    WHERE (status = 'active' AND pay_group_id IS NOT NULL);

DO $$
BEGIN
    ALTER TABLE master.leave_plan_rule
        ADD CONSTRAINT leave_plan_rule_formula_fk
        FOREIGN KEY (tenant_id, accrual_formula_version_id)
        REFERENCES control.formula_expression_version (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.pay_component
        ADD CONSTRAINT pay_component_formula_fk
        FOREIGN KEY (tenant_id, formula_expression_id)
        REFERENCES control.formula_expression (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.pay_structure_line
        ADD CONSTRAINT pay_structure_line_formula_fk
        FOREIGN KEY (tenant_id, formula_expression_id)
        REFERENCES control.formula_expression (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.statutory_scheme
        ADD CONSTRAINT statutory_scheme_rate_table_fk
        FOREIGN KEY (tenant_id, rate_table_id)
        REFERENCES control.rate_table (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.statutory_scheme
        ADD CONSTRAINT statutory_scheme_formula_fk
        FOREIGN KEY (tenant_id, formula_expression_id)
        REFERENCES control.formula_expression (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
