DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line','policy_acknowledgment'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table);
    END LOOP;
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','leave_request','people_request','hr_case','onboarding_case','offboarding_case',
        'payroll_period','payroll_run','payroll_run_employee','payroll_result'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table);
        EXECUTE format('CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table);
        EXECUTE format('CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table);
    END LOOP;
END;
$$;

CREATE TRIGGER trg_shift_assignment_10_contract BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_type_id ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION document.trg_validate_shift_assignment();
CREATE TRIGGER trg_shift_assignment_15_state BEFORE INSERT OR UPDATE ON document.shift_assignment FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_time_punch_10_reference BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_assignment_id ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_validate_attendance_reference();
CREATE TRIGGER trg_time_punch_12_evidence BEFORE UPDATE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_guard_time_punch();
CREATE TRIGGER trg_time_punch_15_state BEFORE UPDATE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_time_punch_15_no_delete BEFORE DELETE ON document.time_punch FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_attendance_day_10_reference BEFORE INSERT OR UPDATE OF tenant_id,employee_id,shift_assignment_id,attendance_date ON document.attendance_day FOR EACH ROW EXECUTE FUNCTION document.trg_validate_attendance_reference();
CREATE TRIGGER trg_attendance_day_15_state BEFORE UPDATE ON document.attendance_day FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();

CREATE TRIGGER trg_attendance_adjustment_15_state BEFORE INSERT OR UPDATE ON document.attendance_adjustment_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_compensation_change_10_contract BEFORE INSERT OR UPDATE ON document.compensation_change FOR EACH ROW EXECUTE FUNCTION document.trg_validate_compensation_change();
CREATE TRIGGER trg_compensation_change_15_state BEFORE INSERT OR UPDATE ON document.compensation_change FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_employee_tax_declaration_10_contract BEFORE INSERT OR UPDATE OF tenant_id,employee_id,employment_id ON document.employee_tax_declaration FOR EACH ROW EXECUTE FUNCTION document.trg_validate_tax_declaration();
CREATE TRIGGER trg_employee_tax_declaration_15_state BEFORE INSERT OR UPDATE ON document.employee_tax_declaration FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_employee_tax_declaration_line_10_guard BEFORE INSERT OR UPDATE OR DELETE ON document.employee_tax_declaration_line FOR EACH ROW EXECUTE FUNCTION document.trg_guard_tax_declaration_line();
CREATE TRIGGER trg_employee_tax_declaration_line_90_updated BEFORE UPDATE ON document.employee_tax_declaration_line FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_leave_request_10_contract BEFORE INSERT OR UPDATE OF tenant_id,leave_plan_id,leave_type_id,quantity_unit ON document.leave_request FOR EACH ROW EXECUTE FUNCTION document.trg_validate_leave_contract();
CREATE TRIGGER trg_leave_request_15_state BEFORE INSERT OR UPDATE ON document.leave_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_leave_balance_entry_10_contract BEFORE INSERT ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION document.trg_validate_leave_contract();
CREATE TRIGGER trg_leave_balance_entry_15_immutable BEFORE UPDATE OR DELETE ON document.leave_balance_entry FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_people_request_15_state BEFORE INSERT OR UPDATE ON document.people_request FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_approval();
CREATE TRIGGER trg_hr_case_15_state BEFORE INSERT OR UPDATE ON document.hr_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_case();
CREATE TRIGGER trg_onboarding_case_15_state BEFORE INSERT OR UPDATE ON document.onboarding_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_people_case();
CREATE TRIGGER trg_offboarding_case_15_state BEFORE INSERT OR UPDATE ON document.offboarding_case FOR EACH ROW EXECUTE FUNCTION document.trg_manage_people_case();

CREATE TRIGGER trg_payroll_period_15_state BEFORE UPDATE ON document.payroll_period FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_run_15_state BEFORE INSERT OR UPDATE ON document.payroll_run FOR EACH ROW EXECUTE FUNCTION document.trg_manage_payroll_run();
CREATE TRIGGER trg_payroll_run_employee_10_contract BEFORE INSERT OR UPDATE OF tenant_id,payroll_run_id,employee_id,compensation_assignment_id ON document.payroll_run_employee FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_run_employee();
CREATE TRIGGER trg_payroll_run_employee_15_state BEFORE UPDATE ON document.payroll_run_employee FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_result_10_contract BEFORE INSERT OR UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_result();
CREATE TRIGGER trg_payroll_result_15_state BEFORE UPDATE ON document.payroll_result FOR EACH ROW EXECUTE FUNCTION document.trg_manage_hr_operational_state();
CREATE TRIGGER trg_payroll_result_line_10_contract BEFORE INSERT ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_validate_payroll_result_line();
CREATE TRIGGER trg_payroll_result_line_15_immutable BEFORE UPDATE OR DELETE ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_payroll_result_line_80_projection AFTER INSERT ON document.payroll_result_line FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_payroll_result();

CREATE TRIGGER trg_policy_acknowledgment_10_immutable
BEFORE UPDATE OR DELETE ON document.policy_acknowledgment
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_policy_acknowledgment_05_contract
BEFORE INSERT ON document.policy_acknowledgment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_policy_acknowledgment();
