-- ============================================================================
-- document/03_people_constraints.sql
-- People document hotfix constraints for existing databases.
-- ============================================================================

ALTER TABLE document.leave_request ADD COLUMN IF NOT EXISTS leave_plan_id uuid;
DO $$
BEGIN
    ALTER TABLE document.leave_request
        ADD CONSTRAINT leave_request_plan_fk
        FOREIGN KEY (tenant_id, leave_plan_id) REFERENCES master.leave_plan (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE document.employee_tax_declaration ADD COLUMN IF NOT EXISTS employment_id uuid;
ALTER TABLE document.employee_tax_declaration DROP CONSTRAINT IF EXISTS employee_tax_declaration_year_uq;
DO $$
BEGIN
    ALTER TABLE document.employee_tax_declaration
        ADD CONSTRAINT employee_tax_declaration_employment_fk
        FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE document.compensation_assignment ADD COLUMN IF NOT EXISTS employment_id uuid;
DO $$
BEGIN
    ALTER TABLE document.compensation_assignment
        ADD CONSTRAINT compensation_assignment_employment_fk
        FOREIGN KEY (tenant_id, employment_id) REFERENCES master.employment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.time_punch
        ADD CONSTRAINT time_punch_source_type_chk
        CHECK (source_type IN ('manual', 'biometric', 'mobile', 'rfid', 'kiosk', 'system'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.shift_assignment
        ADD CONSTRAINT shift_assignment_date_consistency_chk
        CHECK (planned_start_at::date = work_date);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.attendance_day
        ADD CONSTRAINT attendance_day_overtime_consistency_chk
        CHECK (worked_minutes <= scheduled_minutes + overtime_minutes);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_run_journal_uq
    ON document.payroll_run (tenant_id, posted_journal_entry_id);

DO $$
BEGIN
    ALTER TABLE document.payroll_result
        ADD CONSTRAINT payroll_result_net_consistency_chk
        CHECK (ABS(net_amount - (gross_amount - employee_deduction_amount)) < 0.005);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.payroll_result_line
        ADD CONSTRAINT payroll_result_line_component_type_chk
        CHECK (component_type IN ('earning', 'deduction', 'employer_contribution', 'statutory', 'memo'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.hr_case
        ADD CONSTRAINT hr_case_type_chk
        CHECK (case_type IN ('general', 'grievance', 'disciplinary', 'health', 'other'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.people_request
        ADD CONSTRAINT people_request_type_chk
        CHECK (request_type IN ('profile_change', 'bank_update', 'contact_change', 'document_request', 'other'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
