CREATE DOMAIN document.hr_approval_status_d AS text
    CHECK (VALUE IN ('draft','submitted','approved','rejected','cancelled','withdrawn'));
CREATE DOMAIN document.attendance_day_status_d AS text
    CHECK (VALUE IN ('open','approved','locked','voided'));
CREATE DOMAIN document.attendance_punch_type_d AS text
    CHECK (VALUE IN ('in','out','break_start','break_end'));
CREATE DOMAIN document.attendance_punch_source_d AS text
    CHECK (VALUE IN ('manual','biometric','mobile','rfid','kiosk','system','integration'));
CREATE DOMAIN document.attendance_punch_status_d AS text
    CHECK (VALUE IN ('accepted','rejected','voided'));
CREATE DOMAIN document.shift_assignment_status_d AS text
    CHECK (VALUE IN ('scheduled','worked','adjusted','cancelled'));
CREATE DOMAIN document.leave_quantity_unit_d AS text
    CHECK (VALUE IN ('day','hour'));
CREATE DOMAIN document.hr_case_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.hr_case_status_d AS text
    CHECK (VALUE IN ('open','in_progress','pending','resolved','closed','cancelled'));
CREATE DOMAIN document.people_case_status_d AS text
    CHECK (VALUE IN ('draft','active','completed','cancelled'));
CREATE DOMAIN document.employee_tax_declaration_status_d AS text
    CHECK (VALUE IN ('draft','submitted','approved','rejected','withdrawn','superseded'));
CREATE DOMAIN document.payroll_period_status_d AS text
    CHECK (VALUE IN ('open','processing','closed','locked'));
CREATE DOMAIN document.payroll_run_type_d AS text
    CHECK (VALUE IN ('regular','offcycle','correction','final'));
CREATE DOMAIN document.payroll_run_status_d AS text
    CHECK (VALUE IN ('draft','calculating','calculated','approved','posted','cancelled','reversed'));
CREATE DOMAIN document.payroll_run_employee_status_d AS text
    CHECK (VALUE IN ('included','excluded','calculated','error'));
CREATE DOMAIN document.payroll_result_status_d AS text
    CHECK (VALUE IN ('calculating','calculated','approved','posted','voided'));
CREATE DOMAIN document.policy_acknowledgment_channel_d AS text
    CHECK (VALUE IN ('self_service','administrator','workflow','integration','paper','other'));
