-- Table-owned seed for control.entity_operation
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/004_entity_engine/020_entities.sql
-- ============================================================


-- ============================================================
-- PLATFORM: People Management (HR, Payroll)
-- ============================================================
-- === SOURCE: 004_entities_people.sql ===

-- 020_entities/004_entities_people.sql
-- People Management entities (Phase 1): HR and Payroll entity registry.
-- Sources: 017_people_phase1.sql

-- === SOURCE: 017_people_phase1.sql ===

-- 020_entities/017_people_phase1.sql
-- Purpose: META/entity registry for Phase 1 People Management tables.
-- This registers the physical DDL added under master/document/control and
-- derives version-1 field metadata from the live table columns.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    r record;
    c record;
    v_module_id text;
    v_entity_id uuid;
    v_entity_version_id uuid;
    v_lc_active uuid;
    v_lc_org uuid;
    v_lc_employee uuid;
    v_lc_doc uuid;
    v_lifecycle_id uuid;
    v_field_name text;
    v_data_type text;
    v_ui_type text;
    v_detail_renderer text;
    v_list_columns text[];
    v_natural_key_fields text[];
BEGIN
    SELECT id INTO v_lc_active FROM control.lifecycle WHERE code = 'lc_active_inactive' AND tenant_id IS NULL;
    SELECT id INTO v_lc_org FROM control.lifecycle WHERE code = 'lc_org_master' AND tenant_id IS NULL;
    SELECT id INTO v_lc_employee FROM control.lifecycle WHERE code = 'lc_employee' AND tenant_id IS NULL;
    SELECT id INTO v_lc_doc FROM control.lifecycle WHERE code = 'lc_master_doc' AND tenant_id IS NULL;

    IF v_lc_active IS NULL OR v_lc_doc IS NULL THEN
        RAISE EXCEPTION 'People META seed requires lifecycle seeds to run first';
    END IF;

    FOR r IN
        SELECT *
        FROM (VALUES
            -- control formula/rate infrastructure
            ('control','formula_expression','PAYROLL','CONTROL','FEXPR','Formula','Formulas','function-square','violet','config','controlled','lc_active_inactive'),
            ('control','formula_expression_version','PAYROLL','CONTROL','FEXPV','Formula Version','Formula Versions','file-code','violet','config','locked','lc_active_inactive'),
            ('control','rate_table','PAYROLL','CONTROL','RTBL','Rate Table','Rate Tables','table','violet','config','controlled','lc_active_inactive'),
            ('control','rate_table_row','PAYROLL','CONTROL','RTROW','Rate Table Row','Rate Table Rows','list','violet','config','controlled','lc_active_inactive'),

            -- master People foundation
            ('master','person','HR','MASTER','PERS','Person','People','user-round','emerald','tenant_critical','controlled','lc_active_inactive'),
            ('master','person_sensitive_profile','HR','CONTROL','PSENS','Person Sensitive Profile','Person Sensitive Profiles','shield','red','tenant_critical','locked','lc_active_inactive'),
            ('master','external_reference','HR','RELATION','EXREF','External Reference','External References','link','gray','operational','controlled','lc_active_inactive'),
            ('master','org_unit','HR','MASTER','ORGUNT','Org Unit','Org Units','network','cyan','operational','controlled','lc_org_master'),
            ('master','job_family','HR','MASTER','JOBFAM','Job Family','Job Families','briefcase','cyan','operational','controlled','lc_org_master'),
            ('master','job_function','HR','MASTER','JOBFUN','Job Function','Job Functions','workflow','cyan','operational','controlled','lc_org_master'),
            ('master','career_band','HR','MASTER','CRBAND','Career Band','Career Bands','layers','cyan','operational','controlled','lc_active_inactive'),
            ('master','career_level','HR','MASTER','CRLVL','Career Level','Career Levels','stairs','cyan','operational','controlled','lc_active_inactive'),
            ('master','pay_grade','HR','MASTER','PYGRD','Pay Grade','Pay Grades','badge-dollar-sign','cyan','operational','controlled','lc_active_inactive'),
            ('master','designation','HR','MASTER','DSGN','Designation','Designations','badge','cyan','operational','controlled','lc_active_inactive'),
            ('master','job','HR','MASTER','JOB','Job','Jobs','briefcase-business','cyan','operational','controlled','lc_org_master'),
            ('master','position','HR','MASTER','POS','Position','Positions','git-branch','cyan','operational','controlled','lc_org_master'),
            ('master','employment','HR','MASTER','EMPLMT','Employment','Employments','user-check','emerald','tenant_critical','controlled','lc_employee'),
            ('master','work_assignment','HR','MASTER','WASSGN','Work Assignment','Work Assignments','route','emerald','tenant_critical','controlled','lc_active_inactive'),
            ('master','work_pattern','HR','MASTER','WPATT','Work Pattern','Work Patterns','calendar-days','blue','operational','controlled','lc_active_inactive'),
            ('master','work_pattern_day','HR','RELATION','WPATD','Work Pattern Day','Work Pattern Days','calendar','blue','operational','controlled','lc_active_inactive'),
            ('master','shift_type','HR','MASTER','SHIFT','Shift Type','Shift Types','clock','blue','operational','controlled','lc_active_inactive'),
            ('master','leave_type','HR','MASTER','LVTYP','Leave Type','Leave Types','calendar-off','green','operational','controlled','lc_active_inactive'),
            ('master','leave_plan','HR','MASTER','LVPLAN','Leave Plan','Leave Plans','calendar-range','green','operational','controlled','lc_active_inactive'),
            ('master','leave_plan_rule','HR','CONTROL','LVPRUL','Leave Plan Rule','Leave Plan Rules','list-checks','green','operational','controlled','lc_active_inactive'),
            ('master','employee_leave_enrollment','HR','RELATION','LVENTR','Leave Enrollment','Leave Enrollments','user-plus','green','operational','controlled','lc_active_inactive'),
            ('master','pay_group','PAYROLL','MASTER','PAYGRP','Pay Group','Pay Groups','wallet','violet','tenant_critical','controlled','lc_active_inactive'),
            ('master','pay_component','PAYROLL','MASTER','PAYCMP','Pay Component','Pay Components','circle-dollar-sign','violet','tenant_critical','controlled','lc_active_inactive'),
            ('master','pay_structure','PAYROLL','MASTER','PAYSTR','Pay Structure','Pay Structures','list-tree','violet','tenant_critical','controlled','lc_active_inactive'),
            ('master','pay_structure_line','PAYROLL','RELATION','PAYSTL','Pay Structure Line','Pay Structure Lines','list','violet','tenant_critical','controlled','lc_active_inactive'),
            ('master','statutory_scheme','PAYROLL','MASTER','STATSCH','Statutory Scheme','Statutory Schemes','landmark','violet','tenant_critical','controlled','lc_active_inactive'),
            ('master','employee_statutory_enrollment','PAYROLL','RELATION','STATEN','Statutory Enrollment','Statutory Enrollments','badge-check','violet','tenant_critical','controlled','lc_active_inactive'),

            -- document People transactions/facts
            ('document','shift_assignment','HR','DOCUMENT','SHFASN','Shift Assignment','Shift Assignments','calendar-clock','blue','operational','controlled','lc_master_doc'),
            ('document','time_punch','HR','DOCUMENT','TPUNCH','Time Punch','Time Punches','fingerprint','blue','operational','controlled','lc_master_doc'),
            ('document','attendance_day','HR','DOCUMENT','ATTDAY','Attendance Day','Attendance Days','calendar-check','blue','operational','controlled','lc_master_doc'),
            ('document','attendance_adjustment_request','HR','DOCUMENT','ATTADJ','Attendance Adjustment','Attendance Adjustments','clock-3','blue','operational','controlled','lc_master_doc'),
            ('document','leave_request','HR','DOCUMENT','LVREQ','Leave Request','Leave Requests','calendar-plus','green','operational','controlled','lc_master_doc'),
            ('document','leave_balance_entry','HR','DOCUMENT','LVBAL','Leave Balance Entry','Leave Balance Entries','book-open-check','green','operational','locked','lc_master_doc'),
            ('document','compensation_assignment','PAYROLL','DOCUMENT','COMPAS','Compensation Assignment','Compensation Assignments','badge-dollar-sign','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','compensation_change','PAYROLL','DOCUMENT','COMPCH','Compensation Change','Compensation Changes','refresh-ccw','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','payroll_period','PAYROLL','DOCUMENT','PAYPER','Payroll Period','Payroll Periods','calendar-range','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','payroll_run','PAYROLL','DOCUMENT','PAYRUN','Payroll Run','Payroll Runs','play-circle','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','payroll_run_employee','PAYROLL','DOCUMENT','PAYRUE','Payroll Run Employee','Payroll Run Employees','users','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','payroll_result','PAYROLL','DOCUMENT','PAYRES','Payroll Result','Payroll Results','receipt','violet','tenant_critical','locked','lc_master_doc'),
            ('document','payroll_result_line','PAYROLL','DOCUMENT','PAYRSL','Payroll Result Line','Payroll Result Lines','receipt-text','violet','tenant_critical','locked','lc_master_doc'),
            ('document','employee_tax_declaration','PAYROLL','DOCUMENT','TAXDEC','Employee Tax Declaration','Employee Tax Declarations','file-text','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','employee_tax_declaration_line','PAYROLL','DOCUMENT','TAXDCL','Tax Declaration Line','Tax Declaration Lines','list','violet','tenant_critical','controlled','lc_master_doc'),
            ('document','hr_case','HR','DOCUMENT','HRCASE','HR Case','HR Cases','life-buoy','emerald','operational','controlled','lc_master_doc'),
            ('document','onboarding_case','HR','DOCUMENT','ONBRD','Onboarding Case','Onboarding Cases','user-plus','emerald','operational','controlled','lc_master_doc'),
            ('document','offboarding_case','HR','DOCUMENT','OFFBRD','Offboarding Case','Offboarding Cases','user-minus','emerald','operational','controlled','lc_master_doc'),
            ('document','policy_acknowledgment','HR','DOCUMENT','POLACK','Policy Acknowledgment','Policy Acknowledgments','clipboard-check','emerald','operational','locked','lc_master_doc'),
            ('document','people_request','HR','DOCUMENT','PPLREQ','People Request','People Requests','send','emerald','operational','controlled','lc_master_doc')
        ) AS x(table_schema, table_name, module_code, entity_class, entity_short,
               label_singular, label_plural, icon_key, color_token,
               security_tier, mutability, lifecycle_code)
        ORDER BY table_schema, table_name
    LOOP
        SELECT id::text INTO v_module_id
        FROM shared.module
        WHERE code = r.module_code;

        IF v_module_id IS NULL THEN
            RAISE EXCEPTION 'shared.module code % not found for People entity %.%', r.module_code, r.table_schema, r.table_name;
        END IF;

        v_detail_renderer := CASE WHEN r.table_schema = 'document' THEN 'document' ELSE 'master' END;

        v_natural_key_fields := CASE r.table_name
            WHEN 'formula_expression' THEN ARRAY['code']
            WHEN 'formula_expression_version' THEN ARRAY['formula_expression_id','version_no']
            WHEN 'rate_table' THEN ARRAY['code']
            WHEN 'rate_table_row' THEN ARRAY['rate_table_id','effective_from','sequence_no']
            WHEN 'person' THEN ARRAY['code']
            WHEN 'person_sensitive_profile' THEN ARRAY['person_id']
            WHEN 'external_reference' THEN ARRAY['id']
            WHEN 'org_unit' THEN ARRAY['code']
            WHEN 'job_family' THEN ARRAY['code']
            WHEN 'job_function' THEN ARRAY['code']
            WHEN 'career_band' THEN ARRAY['code']
            WHEN 'career_level' THEN ARRAY['code']
            WHEN 'pay_grade' THEN ARRAY['code']
            WHEN 'designation' THEN ARRAY['code']
            WHEN 'job' THEN ARRAY['code']
            WHEN 'position' THEN ARRAY['code']
            WHEN 'employment' THEN ARRAY['code']
            WHEN 'work_assignment' THEN ARRAY['code']
            WHEN 'work_pattern' THEN ARRAY['code']
            WHEN 'work_pattern_day' THEN ARRAY['work_pattern_id','day_no']
            WHEN 'shift_type' THEN ARRAY['code']
            WHEN 'leave_type' THEN ARRAY['code']
            WHEN 'leave_plan' THEN ARRAY['code']
            WHEN 'leave_plan_rule' THEN ARRAY['leave_plan_id','rule_code']
            WHEN 'employee_leave_enrollment' THEN ARRAY['employee_id','leave_plan_id','effective_from']
            WHEN 'pay_group' THEN ARRAY['code']
            WHEN 'pay_component' THEN ARRAY['code']
            WHEN 'pay_structure' THEN ARRAY['code']
            WHEN 'pay_structure_line' THEN ARRAY['pay_structure_id','line_no']
            WHEN 'statutory_scheme' THEN ARRAY['code']
            WHEN 'employee_statutory_enrollment' THEN ARRAY['employee_id','statutory_scheme_id','effective_from']
            WHEN 'shift_assignment' THEN ARRAY['code']
            WHEN 'time_punch' THEN ARRAY['id']
            WHEN 'attendance_day' THEN ARRAY['employee_id','attendance_date']
            WHEN 'attendance_adjustment_request' THEN ARRAY['code']
            WHEN 'leave_request' THEN ARRAY['code']
            WHEN 'leave_balance_entry' THEN ARRAY['id']
            WHEN 'compensation_assignment' THEN ARRAY['code']
            WHEN 'compensation_change' THEN ARRAY['code']
            WHEN 'payroll_period' THEN ARRAY['code']
            WHEN 'payroll_run' THEN ARRAY['code']
            WHEN 'payroll_run_employee' THEN ARRAY['payroll_run_id','employee_id']
            WHEN 'payroll_result' THEN ARRAY['payroll_run_id','employee_id']
            WHEN 'payroll_result_line' THEN ARRAY['payroll_result_id','line_no']
            WHEN 'employee_tax_declaration' THEN ARRAY['code']
            WHEN 'employee_tax_declaration_line' THEN ARRAY['employee_tax_declaration_id','line_no']
            WHEN 'hr_case' THEN ARRAY['code']
            WHEN 'onboarding_case' THEN ARRAY['code']
            WHEN 'offboarding_case' THEN ARRAY['code']
            WHEN 'policy_acknowledgment' THEN ARRAY['employee_id','policy_code','policy_version']
            WHEN 'people_request' THEN ARRAY['code']
            ELSE ARRAY['id']
        END;

        v_list_columns := CASE r.table_name
            WHEN 'formula_expression' THEN ARRAY['code','name','module_code','status']
            WHEN 'formula_expression_version' THEN ARRAY['formula_expression_id','version_no','effective_from','effective_until','status']
            WHEN 'rate_table' THEN ARRAY['code','name','rate_table_kind','country_code','status']
            WHEN 'rate_table_row' THEN ARRAY['rate_table_id','row_key','effective_from','sequence_no','rate_value','amount_value']
            WHEN 'person' THEN ARRAY['person_number','display_name','primary_email','country_code','status']
            WHEN 'person_sensitive_profile' THEN ARRAY['person_id','date_of_birth','nationality_country_code','status']
            WHEN 'external_reference' THEN ARRAY['owner_entity','owner_id','source_system','external_code','status']
            WHEN 'org_unit' THEN ARRAY['code','name','unit_type','parent_id','status']
            WHEN 'job_family' THEN ARRAY['code','name','status']
            WHEN 'job_function' THEN ARRAY['code','name','job_family_id','status']
            WHEN 'career_band' THEN ARRAY['code','name','status']
            WHEN 'career_level' THEN ARRAY['code','name','career_band_id','level_no','status']
            WHEN 'pay_grade' THEN ARRAY['code','name','grade_set','min_amount','midpoint_amount','max_amount','status']
            WHEN 'designation' THEN ARRAY['code','name','status']
            WHEN 'job' THEN ARRAY['code','name','job_family_id','job_function_id','status']
            WHEN 'position' THEN ARRAY['code','name','company_code_id','org_unit_id','job_id','status']
            WHEN 'employment' THEN ARRAY['code','employee_id','person_id','company_code_id','hire_date','status']
            WHEN 'work_assignment' THEN ARRAY['code','employee_id','position_id','assignment_type','effective_from','status']
            WHEN 'work_pattern' THEN ARRAY['code','name','pattern_type','weekly_hours','status']
            WHEN 'work_pattern_day' THEN ARRAY['work_pattern_id','day_no','is_working_day','planned_minutes']
            WHEN 'shift_type' THEN ARRAY['code','name','start_time','end_time','is_overnight','status']
            WHEN 'leave_type' THEN ARRAY['code','name','leave_category','unit','status']
            WHEN 'leave_plan' THEN ARRAY['code','name','leave_type_id','accrual_frequency','status']
            WHEN 'leave_plan_rule' THEN ARRAY['leave_plan_id','rule_code','priority','entitlement_quantity','status']
            WHEN 'employee_leave_enrollment' THEN ARRAY['employee_id','leave_plan_id','effective_from','effective_until','status']
            WHEN 'pay_group' THEN ARRAY['code','name','company_code_id','pay_frequency','currency_code','status']
            WHEN 'pay_component' THEN ARRAY['code','name','component_type','value_type','status']
            WHEN 'pay_structure' THEN ARRAY['code','name','pay_group_id','effective_from','effective_until','status']
            WHEN 'pay_structure_line' THEN ARRAY['pay_structure_id','pay_component_id','line_no','default_amount','default_rate']
            WHEN 'statutory_scheme' THEN ARRAY['code','name','country_code','scheme_type','status']
            WHEN 'employee_statutory_enrollment' THEN ARRAY['employee_id','statutory_scheme_id','member_number','effective_from','status']
            WHEN 'shift_assignment' THEN ARRAY['code','employee_id','work_date','shift_type_id','status']
            WHEN 'time_punch' THEN ARRAY['employee_id','punch_at','punch_type','source_type','status']
            WHEN 'attendance_day' THEN ARRAY['employee_id','attendance_date','scheduled_minutes','worked_minutes','status']
            WHEN 'attendance_adjustment_request' THEN ARRAY['code','employee_id','attendance_day_id','reason_code','status']
            WHEN 'leave_request' THEN ARRAY['code','employee_id','leave_type_id','leave_plan_id','start_date','end_date','status']
            WHEN 'leave_balance_entry' THEN ARRAY['employee_id','leave_plan_id','leave_type_id','entry_date','quantity_delta','balance_after']
            WHEN 'compensation_assignment' THEN ARRAY['code','employee_id','employment_id','pay_group_id','base_amount','currency_code','status']
            WHEN 'compensation_change' THEN ARRAY['code','employee_id','effective_date','change_reason','status']
            WHEN 'payroll_period' THEN ARRAY['code','pay_group_id','period_year','period_number','period_start','period_end','status']
            WHEN 'payroll_run' THEN ARRAY['code','payroll_period_id','run_type','run_no','status']
            WHEN 'payroll_run_employee' THEN ARRAY['payroll_run_id','employee_id','status']
            WHEN 'payroll_result' THEN ARRAY['payroll_run_id','employee_id','gross_amount','employee_deduction_amount','net_amount','status']
            WHEN 'payroll_result_line' THEN ARRAY['payroll_result_id','line_no','pay_component_id','component_type','amount','currency_code']
            WHEN 'employee_tax_declaration' THEN ARRAY['code','employee_id','employment_id','country_code','tax_year','status']
            WHEN 'employee_tax_declaration_line' THEN ARRAY['employee_tax_declaration_id','line_no','declaration_code','amount']
            WHEN 'hr_case' THEN ARRAY['code','employee_id','case_type','priority','assigned_to','status']
            WHEN 'onboarding_case' THEN ARRAY['code','person_id','employee_id','target_start_date','status']
            WHEN 'offboarding_case' THEN ARRAY['code','employee_id','target_exit_date','reason_code','status']
            WHEN 'policy_acknowledgment' THEN ARRAY['employee_id','policy_code','policy_version','acknowledged_at','acknowledgment_channel']
            WHEN 'people_request' THEN ARRAY['code','employee_id','request_type','target_entity','status']
            ELSE ARRAY['code','name','status']
        END;

        SELECT COALESCE(array_agg(x.col ORDER BY x.ord), ARRAY['id'])
          INTO v_natural_key_fields
          FROM unnest(v_natural_key_fields) WITH ORDINALITY AS x(col, ord)
          JOIN information_schema.columns ic
            ON ic.table_schema = r.table_schema
           AND ic.table_name = r.table_name
           AND ic.column_name = x.col;

        SELECT COALESCE(array_agg(x.col ORDER BY x.ord), ARRAY['id'])
          INTO v_list_columns
          FROM unnest(v_list_columns) WITH ORDINALITY AS x(col, ord)
          JOIN information_schema.columns ic
            ON ic.table_schema = r.table_schema
           AND ic.table_name = r.table_name
           AND ic.column_name = x.col;

        INSERT INTO control.entity (
            module_id, name, entity_short, entity_code, entity_class,
            ownership_model, kind, backing_type, governance_level,
            security_tier, mutability, table_schema, table_name,
            label_singular, label_plural, icon_key, color_token,
            feature_flags, display_config, identity_config,
            status, created_by
        )
        VALUES (
            v_module_id, r.table_name, r.entity_short, r.table_name, r.entity_class,
            'system', 'ent', 'table', 'full',
            r.security_tier, r.mutability, r.table_schema, r.table_name,
            r.label_singular, r.label_plural, r.icon_key, r.color_token,
            jsonb_build_object('workspace', 'PPL', 'phase', 'phase1'),
            jsonb_build_object(
                'detail_renderer', v_detail_renderer,
                'list_columns', to_jsonb(v_list_columns),
                'code_field', v_natural_key_fields[1],
                'title_field', CASE
                    WHEN 'name' = ANY (v_list_columns) THEN 'name'
                    WHEN 'display_name' = ANY (v_list_columns) THEN 'display_name'
                    ELSE v_list_columns[1]
                END,
                'default_sort_field', v_natural_key_fields[1]
            ),
            jsonb_build_object('natural_key_fields', to_jsonb(v_natural_key_fields::text[])),
            'ACTIVE', v_su
        )
        ON CONFLICT ON CONSTRAINT entity_physical_uq DO UPDATE
        SET module_id = EXCLUDED.module_id,
            entity_code = EXCLUDED.entity_code,
            label_singular = EXCLUDED.label_singular,
            label_plural = EXCLUDED.label_plural,
            icon_key = EXCLUDED.icon_key,
            color_token = EXCLUDED.color_token,
            display_config = EXCLUDED.display_config,
            identity_config = COALESCE(control.entity.identity_config, '{}'::jsonb) || EXCLUDED.identity_config,
            feature_flags = control.entity.feature_flags || EXCLUDED.feature_flags,
            status = 'ACTIVE',
            updated_at = now(),
            updated_by = v_su
        RETURNING id INTO v_entity_id;

        INSERT INTO control.entity_version (
            entity_id, tenant_id, version_no, status,
            label, change_type, effective_from, created_by
        )
        VALUES (
            v_entity_id, NULL, 1, 'EFFECTIVE',
            'Initial People Phase 1 version', 'structural', now(), v_su
        )
        ON CONFLICT (entity_id, version_no) DO UPDATE
        SET status = 'EFFECTIVE',
            updated_at = now(),
            updated_by = v_su
        RETURNING id INTO v_entity_version_id;

        FOR c IN
            SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = r.table_schema
              AND table_name = r.table_name
            ORDER BY ordinal_position
        LOOP
            v_data_type := CASE
                WHEN c.udt_name = 'uuid' THEN 'uuid'
                WHEN c.data_type IN ('integer', 'smallint') THEN 'integer'
                WHEN c.data_type = 'bigint' THEN 'bigint'
                WHEN c.data_type = 'numeric' THEN 'decimal'
                WHEN c.data_type = 'boolean' THEN 'boolean'
                WHEN c.data_type = 'date' THEN 'date'
                WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
                WHEN c.data_type = 'timestamp without time zone' THEN 'datetime'
                WHEN c.data_type = 'jsonb' THEN 'jsonb'
                WHEN c.data_type = 'json' THEN 'json'
                WHEN c.data_type = 'ARRAY' AND c.udt_name = '_uuid' THEN 'uuid_array'
                WHEN c.data_type = 'ARRAY' THEN 'text_array'
                ELSE 'string'
            END;

            v_ui_type := CASE
                WHEN v_data_type = 'uuid' AND c.column_name LIKE '%_id' THEN 'reference'
                WHEN v_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money') THEN 'number'
                WHEN v_data_type = 'boolean' THEN 'checkbox'
                WHEN v_data_type = 'date' THEN 'date'
                WHEN v_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN v_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array') THEN 'json'
                ELSE 'text'
            END;

            v_field_name := CASE
                WHEN v_data_type = 'boolean'
                     AND c.column_name !~ '^(is_|has_|can_|allow_|enable_)'
                    THEN 'is_' || c.column_name
                ELSE c.column_name
            END;

            IF v_field_name LIKE '%\_id' ESCAPE '\' AND v_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]') THEN
                v_field_name := regexp_replace(v_field_name, '_id$', '_identifier');
            ELSIF v_field_name LIKE '%_id' AND v_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]') THEN
                v_field_name := v_field_name || CASE WHEN v_data_type = 'boolean' THEN '_flag' ELSE '_value' END;
            END IF;

            INSERT INTO control.entity_field (
                entity_version_id, name, column_name, label, data_type, ui_type,
                cardinality, origin, is_required, is_filterable, is_sortable,
                is_searchable, is_read_only, sort_order, created_by, validation
            )
            VALUES (
                v_entity_version_id,
                v_field_name,
                c.column_name,
                initcap(replace(c.column_name, '_', ' ')),
                v_data_type,
                v_ui_type,
                CASE WHEN c.is_nullable = 'NO' THEN 'one' ELSE 'zero_or_one' END,
                CASE WHEN c.column_name IN ('id','tenant_id','is_active','created_at','created_by','updated_at','updated_by','status_changed_at','status_changed_by') THEN 'system' ELSE 'standard' END,
                c.is_nullable = 'NO' AND c.column_name NOT IN ('id','tenant_id','created_at','created_by'),
                c.column_name IN ('tenant_id','code','name','status','employee_id','person_id','company_code_id','pay_group_id','payroll_run_id','workflow_request_id'),
                c.column_name IN ('code','name','status','created_at','updated_at','effective_from','work_date','attendance_date','period_start','period_end'),
                c.column_name IN ('code','name','employee_number','person_number','primary_email','description'),
                c.column_name IN ('id','tenant_id','is_active','created_at','created_by','updated_at','updated_by'),
                c.ordinal_position * 10,
                v_su,
                CASE
                    WHEN v_data_type = 'uuid' AND c.column_name LIKE '%_id'
                        THEN jsonb_build_object('ref_hint', regexp_replace(c.column_name, '_id$', ''))
                    ELSE NULL::jsonb
                END
            )
            ON CONFLICT DO NOTHING;
        END LOOP;

        v_lifecycle_id := CASE r.lifecycle_code
            WHEN 'lc_org_master' THEN COALESCE(v_lc_org, v_lc_active)
            WHEN 'lc_employee' THEN COALESCE(v_lc_employee, v_lc_active)
            WHEN 'lc_master_doc' THEN v_lc_doc
            ELSE v_lc_active
        END;

        INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
        VALUES (NULL, r.table_name, v_lifecycle_id, 100, v_su)
        ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

        INSERT INTO control.entity_operation (
            tenant_id, entity_name, permission_code, surface, placement,
            handler_type, handler_target, is_record_required, sort_order, created_by
        )
        VALUES
            (NULL, r.table_name, 'create', 'LIST', 'PRIMARY', 'NAVIGATE', '/app/' || r.table_name || '/new', false, 10, v_su),
            (NULL, r.table_name, 'update', 'DETAIL', 'PRIMARY', 'NAVIGATE', '/app/' || r.table_name || '/{id}/edit', true, 20, v_su),
            (NULL, r.table_name, 'delete', 'DETAIL', 'OVERFLOW', 'MODAL', 'delete', true, 30, v_su),
            (NULL, r.table_name, 'export', 'LIST', 'TOOLBAR', 'API', 'export', false, 40, v_su)
        ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;
    END LOOP;

    -- Existing master.employee is reused, so make sure its META version knows
    -- about the new person bridge column added by the DDL delta.
    SELECT ev.id INTO v_entity_version_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.table_schema = 'master'
      AND e.table_name = 'employee'
      AND ev.version_no = 1
    LIMIT 1;

    IF v_entity_version_id IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by
        )
        VALUES (
            v_entity_version_id, 'person_id', 'person_id', 'Person',
            'uuid', 'reference', 'zero_or_one', 'standard',
            false, true, false, false,
            '{"ref_entity":"person"}'::jsonb, 115, v_su
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'People Phase 1 META entities and fields seeded';
END $$;


-- === SOURCE: 021_control_numbering_registry.sql ===

-- 020_entities/021_control_numbering_registry.sql
-- Purpose: clean up legacy numbering entity registry entries and register the
--          canonical entity_numbering_config / entity_numbering_counter tables.
-- Safe to re-run: DELETE is scoped, INSERT uses ON CONFLICT DO NOTHING.

DO $$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_fnd  uuid;
BEGIN
    SELECT id INTO v_fnd FROM shared.module WHERE code = 'FND';

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 1: Remove stale entity_operation rows for decommissioned entities.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    DELETE FROM control.entity_operation
    WHERE tenant_id IS NULL
      AND entity_name IN (
          'numbering_series',
          'document_sequence_config',
          'document_sequence_counter',
          'control_document_sequence_config',
          'control_document_sequence_counter'
      );

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 2: Remove snapshot.entity_compiled and entity_compiled_overlay rows
    --         for the stale entity versions. The immutability triggers are
    --         disabled for this transaction â€” this is a decommission cleanup,
    --         not normal runtime write.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ALTER TABLE snapshot.entity_compiled         DISABLE TRIGGER trg_ec_immutable;
    ALTER TABLE snapshot.entity_compiled_overlay DISABLE TRIGGER trg_eco_immutable;

    DELETE FROM snapshot.entity_compiled_overlay
    WHERE entity_version_id IN (
        SELECT ev.id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.tenant_id IS NULL
          AND (e.table_schema, e.table_name) IN (
              ('master',  'numbering_series'),
              ('control', 'document_sequence_config'),
              ('control', 'document_sequence_counter')
          )
    );

    DELETE FROM snapshot.entity_compiled
    WHERE entity_version_id IN (
        SELECT ev.id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.tenant_id IS NULL
          AND (e.table_schema, e.table_name) IN (
              ('master',  'numbering_series'),
              ('control', 'document_sequence_config'),
              ('control', 'document_sequence_counter')
          )
    );

    ALTER TABLE snapshot.entity_compiled         ENABLE TRIGGER trg_ec_immutable;
    ALTER TABLE snapshot.entity_compiled_overlay ENABLE TRIGGER trg_eco_immutable;

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 3: Remove stale entity registry rows for decommissioned tables.
    --         entity_version rows are deleted via ON DELETE CASCADE.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    DELETE FROM control.entity
    WHERE tenant_id IS NULL
      AND (table_schema, table_name) IN (
          ('master',  'numbering_series'),
          ('control', 'document_sequence_config'),
          ('control', 'document_sequence_counter')
      );

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 4: Register control.entity_numbering_config
    --         Policy table â€” one row per entity Ã— number_field Ã— company code.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, slug, entity_short, entity_code, entity_class,
        ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by
    ) VALUES (
        v_fnd, 'entity_numbering_config', 'entity-numbering-config', 'ENC', 'entity_numbering_config', 'CONTROL',
        'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled',
        'control', 'entity_numbering_config',
        'Entity Numbering Config', 'Entity Numbering Configs', 'hash', 'violet',
        '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su
    )
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 5: Register control.entity_numbering_counter
    --         Hot-state counters â€” written on every document number generation.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, slug, entity_short, entity_code, entity_class,
        ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by
    ) VALUES (
        v_fnd, 'entity_numbering_counter', 'entity-numbering-counter', 'ENCT', 'entity_numbering_counter', 'CONTROL',
        'system', 'ent', 'table',
        'lite', 'platform_critical', 'locked',
        'control', 'entity_numbering_counter',
        'Entity Numbering Counter', 'Entity Numbering Counters', 'binary', 'slate',
        '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su
    )
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Step 6: Seed entity_version rows for any newly inserted entities.
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_version (entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
    SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial Version', 'structural', now(), v_su
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND (e.table_schema, e.table_name) IN (
          ('control', 'entity_numbering_config'),
          ('control', 'entity_numbering_counter')
      )
      AND NOT EXISTS (
          SELECT 1 FROM control.entity_version ev WHERE ev.entity_id = e.id
      );

    RAISE NOTICE 'entity_numbering registry cleanup complete';
END $$;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/004_entity_engine/035_version_fields.sql
-- ============================================================

-- ============================================================================
-- FILE: 035_version_fields.sql  (consolidated)
-- Purpose: All control.entity_field registrations for entity engine seed
-- Source:  035_version_fields/ 000_common_fields.sql → 099_fix_entity_field_column_mappings.sql
-- Execution order: 000 → 001 → ... → 024 → 099
-- Idempotent: ON CONFLICT DO NOTHING (000-016, 019-024, 099);
--             ON CONFLICT DO UPDATE  (017-018, master/governed schema coverage)
-- ============================================================================

DO $$
DECLARE
    v_su              uuid    := '00000000-0000-0000-0000-000000000000';
    v_su_admin        uuid    := '00000000-0000-0000-0000-000000000001';
    v_ev              uuid;
    cnt               int;
    total             int     := 0;
    v_data_type       text;
    v_ui_type         text;
    v_field_name      text;
    v_origin          text;
    v_ref_entity      text;
    v_ref_entity_id   uuid;
    v_rows            integer := 0;
    v_total           integer := 0;
    v_version_rows    integer := 0;
    v_deleted         integer := 0;
    v_display_updates integer := 0;
    r                 record;
    c                 record;
    v_field_rows      integer := 0;
    v_deleted_rows    integer := 0;
    v_display_rows    integer := 0;
    v_ev_entity       uuid;
    v_ev_ef           uuid;
    v_ev_er           uuid;
    v_patched_entity  integer := 0;
    v_patched_ef      integer := 0;
    v_patched_er      integer := 0;
    v_ev_cir          uuid;
    v_ev_ccr          uuid;
    v_patched_cir     integer := 0;
    v_patched_ccr     integer := 0;
    v_ev_product      uuid;
    v_ev_item         uuid;
    v_ev_cc           uuid;
    v_ev_ccat         uuid;
    v_patched_product integer := 0;
    v_patched_item    integer := 0;
    v_patched_cc      integer := 0;
    v_patched_ccat    integer := 0;
    v_main            integer := 0;
    v_type            integer := 0;
    v_pay             integer := 0;
    v_hol             integer := 0;
BEGIN

    -- ========================================================================
    -- Section: 000_common_fields
    -- ========================================================================


    -- ── Pass 1: id — ALL 111 master system entities ───────────────────────────
    -- Hidden, write_once, read_only — present on every table
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'id','id','ID','uuid','hidden',
        'one','system', true, false, false, false,
        true, false, 10, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 2: tenant_id — entities that ARE tenant-scoped ──────────────────
    -- Excludes: AGGREGATE (typically no tenant scoping)
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'tenant_id','tenant_id','Tenant','uuid','hidden',
        'one','system', true, true, false, false,
        true, false, 20, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION',
                                     'RELATION','LOG','DIMENSION'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3a: code — MASTER + REFERENCE + DIMENSION entities ─────────────
    -- Business code / slug; unique per tenant.
    -- Guard: only apply when the backing table actually has a 'code' column.
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_unique, is_filterable, is_sortable,
        is_searchable, is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'code','code','Code','string','text',
        'one','standard', true, true, true, true,
        true, false, false, 30, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
      AND EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = e.table_schema
          AND ic.table_name   = e.table_name
          AND ic.column_name  = 'code'
      )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3b: name — MASTER + REFERENCE + DIMENSION entities ─────────────
    -- Guard: only apply when the backing table actually has a 'name' column.
    -- Profile/junction tables (e.g. company_code_supplier_profile) are MASTER
    -- class but lack 'name' — omitting them prevents ORDER BY "name" 500 errors.
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'name','name','Name','string','text',
        'one','standard', true, true, true, true,
        false, false, 40, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','REFERENCE','DIMENSION'])
      AND EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = e.table_schema
          AND ic.table_name   = e.table_name
          AND ic.column_name  = 'name'
      )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 3c: description — MASTER + CONTROL + REFERENCE + DIMENSION ─────
    -- Guard: only apply when the backing table actually has a 'description' column.
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'description','description','Description','text','textarea',
        'one','standard', false, false, false, true,
        false, 50, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'])
      AND EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = e.table_schema
          AND ic.table_name   = e.table_name
          AND ic.column_name  = 'description'
      )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4a: status — entities bound to a lifecycle ──────────────────────
    -- Lifecycle-managed entities have a status column
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'status','status','Status','string','status',
        'one','system', true, true, true, false,
        true, 60, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 4b: is_active — same set as status ───────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT DISTINCT ev.id,
        'is_active','is_active','Active','boolean','hidden',
        'one','system', true, true, false, false,
        true, 70, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_lifecycle el ON el.entity_name = e.name AND el.tenant_id IS NULL
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5a: created_at — all entities (audit trail) ─────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_at','created_at','Created','timestamp','datetime',
        'one','system', true, true, true, false,
        true, false, 950, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5b: created_by — all entities ───────────────────────────────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_write_once, sort_order, created_by)
    SELECT ev.id,
        'created_by','created_by','Created By','uuid','reference',
        'one','system', true, false, false, false,
        false, true, 960, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master' AND e.ownership_model = 'system'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5c: updated_at — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_at','updated_at','Updated','timestamp','datetime',
        'one','system', false, true, true, false,
        true, 970, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    -- ── Pass 5d: updated_by — MASTER + CONTROL + DOCUMENT entities ───────────
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, sort_order, created_by)
    SELECT ev.id,
        'updated_by','updated_by','Updated By','uuid','reference',
        'one','system', false, false, false, false,
        true, 980, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.entity_class = ANY(ARRAY['MASTER','CONTROL','DOCUMENT'])
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;

    RAISE NOTICE '035_version_fields/000_common_fields: % rows inserted', total;

    -- ========================================================================
    -- Section: 001_fields_identity
    -- ========================================================================


    -- ── tenant ────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'display_name','display_name','Display Name','string','text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'realm_key',   'realm_key',   'Realm Key',  'string','text',     'one','system',  true, true,  true,  true, 120,v_su),
            (v_ev,'tenant_type', 'tenant_type', 'Tenant Type','enum', 'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'region',      'region',      'Region',     'string','text',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'subscription','subscription','Subscription','enum', 'select',   'one','standard',true, true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
        DO UPDATE SET
            column_name   = EXCLUDED.column_name,
            label         = EXCLUDED.label,
            data_type     = EXCLUDED.data_type,
            ui_type       = EXCLUDED.ui_type,
            cardinality   = EXCLUDED.cardinality,
            origin        = EXCLUDED.origin,
            is_required   = EXCLUDED.is_required,
            is_filterable = EXCLUDED.is_filterable,
            is_sortable   = EXCLUDED.is_sortable,
            is_searchable = EXCLUDED.is_searchable,
            enum_config   = CASE
                WHEN EXCLUDED.data_type = 'enum' AND control.entity_field.enum_domain_code IS NULL
                    THEN COALESCE(control.entity_field.enum_config, EXCLUDED.enum_config, '{}'::jsonb)
                ELSE control.entity_field.enum_config
            END,
            sort_order    = EXCLUDED.sort_order,
            updated_at    = now(),
            updated_by    = EXCLUDED.created_by;
    END IF;

    -- ── principal ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_type',     'principal_type',     'Type',           'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_locked',          'is_locked',          'Locked',         'boolean','hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_service_account', 'is_service_account', 'Service Account','boolean','hidden', 'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'login_email',        'login_email',        'Login Email',    'string', 'text',   'one','system',  false,true,  true,  true, 140,v_su),
            (v_ev,'external_ref',       'external_ref',       'External Ref',   'string', 'text',   'one','standard',false,true,  false, true, 150,v_su),
            (v_ev,'principal_source',   'principal_source',   'Source',         'enum',   'select', 'one','standard',false,true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_profile ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',         'principal_id',         'Principal',       'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'given_name',           'given_name',           'First Name',      'string','text',  'one','standard',false,true,  true,  true, 120,v_su),
            (v_ev,'family_name',          'family_name',          'Last Name',       'string','text',  'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'preferred_name',       'preferred_name',       'Preferred Name',  'string','text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'display_name',         'display_name',         'Display Name',    'string','text',  'one','system',  false,true,  true,  true, 150,v_su),
            (v_ev,'locale',               'locale',               'Locale',          'string','text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'timezone',             'timezone',             'Timezone',        'string','text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'keycloak_sync_status', 'keycloak_sync_status', 'Sync Status',     'enum', 'status','one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company','uuid','reference','one','standard',false,true,false,false,190,v_su),
            (v_ev,'employee_id',          'employee_id',          'Employee',        'uuid','reference','one','standard',false,true,  false, false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_identity_binding ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_identity_binding' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'realm_key',     'realm_key',     'Realm Key',     'string','text',  'one','system',  true, true,  true,  true, 120,v_su),
            (v_ev,'provider_code', 'provider_code', 'Provider',      'enum','select',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'subject_ref',   'subject_id',    'Subject ID',    'string','text',  'one','system',  true, false, false, true, 140,v_su),
            (v_ev,'username',      'username',      'Username',      'string','text',  'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'sync_status',   'sync_status',   'Sync Status',   'enum', 'status','one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'synced_at',     'synced_at',     'Synced At',     'timestamp','datetime','one','system',false,true,true,false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
        DO UPDATE SET
            column_name   = EXCLUDED.column_name,
            label         = EXCLUDED.label,
            data_type     = EXCLUDED.data_type,
            ui_type       = EXCLUDED.ui_type,
            cardinality   = EXCLUDED.cardinality,
            origin        = EXCLUDED.origin,
            is_required   = EXCLUDED.is_required,
            is_filterable = EXCLUDED.is_filterable,
            is_sortable   = EXCLUDED.is_sortable,
            is_searchable = EXCLUDED.is_searchable,
            enum_config   = CASE
                WHEN EXCLUDED.data_type = 'enum' AND control.entity_field.enum_domain_code IS NULL
                    THEN COALESCE(control.entity_field.enum_config, EXCLUDED.enum_config, '{}'::jsonb)
                ELSE control.entity_field.enum_config
            END,
            sort_order    = EXCLUDED.sort_order,
            updated_at    = now(),
            updated_by    = EXCLUDED.created_by;
    END IF;

    -- ── contact_link ──────────────────────────────────────────────────────────
    -- tenant_relationship
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_relationship' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'from_tenant_id',        'from_tenant_id',        'From Tenant',  'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'to_tenant_id',          'to_tenant_id',          'To Tenant',    'uuid','reference','one','system',  true, true,  false, false,120,v_su),
            (v_ev,'relationship_type',     'relationship_type',     'Type',         'enum','select',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'relationship_direction','relationship_direction','Direction',    'enum','select',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'scopes',                'scopes',                'Scopes',       'jsonb','json',   'one','standard',true, false, false, false,150,v_su),
            (v_ev,'invited_email',         'invited_email',         'Invited Email','string','text',   'one','standard',false,true,  false, true, 160,v_su),
            (v_ev,'invited_at',            'invited_at',            'Invited At',   'timestamp','datetime','one','standard',false,true,true,false,170,v_su),
            (v_ev,'accepted_at',           'accepted_at',           'Accepted At',  'timestamp','datetime','one','standard',false,true,true,false,180,v_su),
            (v_ev,'effective_from',        'effective_from',        'Effective From','timestamp','datetime','one','standard',true,true,true,false,190,v_su),
            (v_ev,'effective_until',       'effective_until',       'Effective Until','timestamp','datetime','one','standard',false,true,true,false,200,v_su),
            (v_ev,'status',                'status',                'Status',       'enum','status',  'one','system',  true, true,  true,  false,210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
        DO UPDATE SET
            column_name   = EXCLUDED.column_name,
            label         = EXCLUDED.label,
            data_type     = EXCLUDED.data_type,
            ui_type       = EXCLUDED.ui_type,
            cardinality   = EXCLUDED.cardinality,
            origin        = EXCLUDED.origin,
            is_required   = EXCLUDED.is_required,
            is_filterable = EXCLUDED.is_filterable,
            is_sortable   = EXCLUDED.is_sortable,
            is_searchable = EXCLUDED.is_searchable,
            enum_config   = CASE
                WHEN EXCLUDED.data_type = 'enum' AND control.entity_field.enum_domain_code IS NULL
                    THEN COALESCE(control.entity_field.enum_config, EXCLUDED.enum_config, '{}'::jsonb)
                ELSE control.entity_field.enum_config
            END,
            sort_order    = EXCLUDED.sort_order,
            updated_at    = now(),
            updated_by    = EXCLUDED.created_by;
    END IF;

    -- principal_relationship
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_relationship' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'from_tenant_id',     'from_tenant_id',     'From Tenant',       'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'from_principal_id',  'from_principal_id',  'From Principal',    'uuid','reference','one','system',  true, true,  false, false,120,v_su),
            (v_ev,'to_tenant_id',       'to_tenant_id',       'To Tenant',         'uuid','reference','one','system',  true, true,  false, false,130,v_su),
            (v_ev,'to_principal_id',    'to_principal_id',    'To Principal',      'uuid','reference','one','system',  true, true,  false, false,140,v_su),
            (v_ev,'relationship_type',  'relationship_type',  'Type',              'enum','select',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'verification_status','verification_status','Verification',      'enum','status',  'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'verified_method',    'verified_method',    'Verified Method',   'enum','select',  'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'verified_at',        'verified_at',        'Verified At',       'timestamp','datetime','one','standard',false,true,true,false,180,v_su),
            (v_ev,'effective_from',     'effective_from',     'Effective From',    'timestamp','datetime','one','standard',true,true,true,false,190,v_su),
            (v_ev,'effective_until',    'effective_until',    'Effective Until',   'timestamp','datetime','one','standard',false,true,true,false,200,v_su),
            (v_ev,'status',             'status',             'Status',            'string','status', 'one','system',  true, true,  true,  false,210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
        DO UPDATE SET
            column_name   = EXCLUDED.column_name,
            label         = EXCLUDED.label,
            data_type     = EXCLUDED.data_type,
            ui_type       = EXCLUDED.ui_type,
            cardinality   = EXCLUDED.cardinality,
            origin        = EXCLUDED.origin,
            is_required   = EXCLUDED.is_required,
            is_filterable = EXCLUDED.is_filterable,
            is_sortable   = EXCLUDED.is_sortable,
            is_searchable = EXCLUDED.is_searchable,
            enum_config   = CASE
                WHEN EXCLUDED.data_type = 'enum' AND control.entity_field.enum_domain_code IS NULL
                    THEN COALESCE(control.entity_field.enum_config, EXCLUDED.enum_config, '{}'::jsonb)
                ELSE control.entity_field.enum_config
            END,
            sort_order    = EXCLUDED.sort_order,
            updated_at    = now(),
            updated_by    = EXCLUDED.created_by;
    END IF;

    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',  'owner_type',  'Owner Type',  'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',    'owner_id',    'Owner',       'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'channel_type','channel_type','Channel',     'enum',  'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'value',       'value',       'Value',       'string','text',     'one','standard',true, false, false, true, 140,v_su),
            (v_ev,'purpose',     'purpose',     'Purpose',     'enum',  'select',   'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'is_primary',  'is_primary',  'Primary',     'boolean','hidden',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_verified', 'is_verified', 'Verified',    'boolean','hidden',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'verified_at', 'verified_at', 'Verified At', 'timestamp','datetime','one','system',false,true,true,false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_email ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_email' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'contact_link_id','contact_link_id','Contact Link','uuid',    'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'local_part',     'local_part',     'Local Part',  'string',  'text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'domain',         'domain',         'Domain',      'string',  'text',     'one','system',  false,true,  true,  true, 130,v_su),
            (v_ev,'is_disposable',  'is_disposable',  'Disposable',  'boolean', 'hidden',   'one','system',  false,true,  false, false,140,v_su),
            (v_ev,'bounce_count',   'bounce_count',   'Bounces',     'integer', 'number',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_phone ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_phone' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'contact_link_id','contact_link_id','Contact Link',  'uuid',  'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'e164',           'e164',           'E.164 Number',  'string','text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'calling_code',   'calling_code',   'Calling Code',  'string','text',     'one','system',  false,true,  false, false,130,v_su),
            (v_ev,'national_number','national_number', 'National No.',  'string','text',     'one','system',  false,false, false, true, 140,v_su),
            (v_ev,'line_type',      'line_type',      'Line Type',     'enum',  'select',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── label ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'label' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity',      'entity',      'Entity',      'string','text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'locale_code', 'locale_code', 'Locale',      'string','text',  'one','standard',true, true,  true,  false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── owner_type ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'owner_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',   'category',   'Category',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'sort_order', 'sort_order', 'Sort Order',  'integer','number','one','standard',false,false, true,  false,120,v_su),
            (v_ev,'schema_name','schema_name','Schema',      'string', 'text',  'one','system',  false,false, false, false,130,v_su),
            (v_ev,'table_name', 'table_name', 'Table',       'string', 'text',  'one','system',  false,false, false, false,140,v_su),
            (v_ev,'is_system',  'is_system',  'System',      'boolean','hidden','one','system',  false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'address_type',      'address_type',      'Address Type',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'line1',             'line1',             'Address Line 1',  'string', 'text',  'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'line2',             'line2',             'Address Line 2',  'string', 'text',  'one','standard',false,false, false, false,130,v_su),
            (v_ev,'city',              'city',              'City',            'string', 'text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'region',            'region',            'Region/State',    'string', 'text',  'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'postal_code',       'postal_code',       'Postal Code',     'string', 'text',  'one','standard',false,true,  true,  true, 160,v_su),
            (v_ev,'country_code',      'country_code',      'Country',         'string', 'text',  'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'formatted_address', 'formatted_address', 'Full Address',    'string', 'text',  'one','system',  false,false, false, true, 180,v_su),
            (v_ev,'address_email',     'address_email',     'Address Email',   'string', 'email', 'one','standard',false,false, false, true, 190,v_su),
            (v_ev,'address_phone',     'address_phone',     'Address Phone',   'string', 'phone', 'one','standard',false,false, false, true, 200,v_su),
            (v_ev,'address_fax',       'address_fax',       'Address Fax',     'string', 'phone', 'one','standard',false,false, false, true, 210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address_link ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',     'owner_type',     'Owner Type',     'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',       'owner_id',       'Owner',          'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'address_id',     'address_id',     'Address',        'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'purpose',        'purpose',        'Purpose',        'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_primary',     'is_primary',     'Primary',        'boolean','hidden',  'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',  'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'effective_until','effective_until','Effective Until','date',  'date',     'one','standard',false,true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_module_subscription ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_module_subscription' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'module_id',    'module_id',    'Module',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',       'status',       'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subscribed_at','subscribed_at','Subscribed At','timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_feature_entitlement ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_feature_entitlement' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'feature_id',    'feature_id',    'Feature',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',        'status',        'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'activated_at',  'activated_at',  'Activated At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'activated_by',  'activated_by',  'Activated By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_permission_override ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_permission_override' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'permission_id','permission_id','Permission','uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'is_granted',   'is_granted',   'Granted',  'boolean','hidden',   'one','standard',true, true,  false, false,120,v_su),
            (v_ev,'reason',       'reason',       'Reason',   'text',   'textarea', 'one','standard',false,false, false, true, 130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires',  'timestamp','datetime','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',   'granted_by',   'Granted By','uuid',  'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_access ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_access' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',     'entity_type',     'Entity Type',    'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',       'entity_id',       'Entity',         'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'granted_by',      'granted_by',      'Granted By',     'uuid',  'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'is_system',               'is_system',               'System Group',     'boolean','hidden','one','system',  false,true,  false, false,110,v_su),
            (v_ev,'is_self_service_eligible','is_self_service_eligible','Self-Service',     'boolean','hidden','one','standard',false,true,  false, false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_role ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_role' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'group_id',              'group_id',              'Group',             'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'role_id',               'role_id',               'Role',              'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'visibility_scope',      'visibility_scope',      'Visibility Scope',  'enum','select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'assignment_scope_type', 'assignment_scope_type', 'Assignment Scope',  'enum','select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',            'expires_at',            'Expires At',        'timestamp','datetime','one','standard',false,true,true,false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_member ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_member' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'group_id',    'group_id',    'Group',     'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'added_by',    'added_by',    'Added By',  'uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_persona ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_persona' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'persona_id',  'persona_id',  'Persona',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'assigned_by', 'assigned_by', 'Assigned By','uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team ──────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'leader_id',     'leader_id',     'Leader',         'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'team_type',     'team_type',     'Team Type',      'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'effective_from','effective_from','Effective From', 'date','date',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'effective_to',  'effective_to',  'Effective To',   'date','date',     'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team_member ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team_member' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'team_id',     'team_id',     'Team',        'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','User',        'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'role_in_team','role_in_team','Role in Team','string',   'text',     'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At',   'timestamp','datetime', 'one','system',  false,true,  true,  false,140,v_su),
            (v_ev,'left_at',     'left_at',     'Left At',     'timestamp','datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── access_grant ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'access_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'role_id',              'role_id',              'Role',             'uuid',     'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'group_id',             'group_id',             'Group',            'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'principal_id',         'principal_id',         'User',             'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'permission_id',        'permission_id',        'Permission',       'uuid',     'reference','one','standard',true, true,  false, false,140,v_su),
            (v_ev,'effect',               'effect',               'Effect',           'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'visibility_scope',     'visibility_scope',     'Visibility',       'enum',     'select',   'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'assignment_scope_type','assignment_scope_type','Scope Type',       'enum',     'select',   'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'expires_at',           'expires_at',           'Expires At',       'timestamp','datetime', 'one','standard',false,true,  true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── group_feature_grant ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'group_feature_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'group_id',   'group_id',   'Group',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id', 'feature_id', 'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type','access_type','Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at', 'expires_at', 'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by', 'granted_by', 'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_feature_grant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_feature_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id',  'feature_id',  'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type', 'access_type', 'Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',  'granted_by',  'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── delegation_grant ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'delegation_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'delegator_id','delegator_id','Delegator',  'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'delegate_id', 'delegate_id', 'Delegate',   'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'scope_type',  'scope_type',  'Scope Type', 'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'scope_ref',   'scope_ref',   'Scope Ref',  'string',   'text',     'one','standard',false,true,  false, true, 140,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_revoked',  'is_revoked',  'Revoked',    'boolean',  'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reason',      'reason',      'Reason',     'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/001_fields_identity: done';

    -- ========================================================================
    -- Section: 002_fields_notifications
    -- ========================================================================


    -- ── notification ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'notification' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'recipient_id',  'recipient_id',  'Recipient',   'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'sender_id',     'sender_id',     'Sender',      'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',     'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'category',      'category',      'Category',    'enum',     'select',   'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'priority',      'priority',      'Priority',    'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'title',         'title',         'Title',       'string',   'text',     'one','standard',true, false, false, true, 160,v_su),
            (v_ev,'body',          'body',          'Body',        'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su),
            (v_ev,'entity_type',   'entity_type',   'Entity Type', 'string',   'text',     'one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'entity_id',     'entity_id',     'Entity',      'uuid',     'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'is_read',       'is_read',       'Read',        'boolean',  'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'is_dismissed',  'is_dismissed',  'Dismissed',   'boolean',  'hidden',   'one','standard',false,true,  false, false,210,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',  'timestamp','datetime', 'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',            'country_code',            'Country',            'string', 'text',  'one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'currency_code',           'currency_code',           'Currency',           'string', 'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'locale_code',             'locale_code',             'Locale',             'string', 'text',  'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',           'timezone_code',           'Timezone',           'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'fiscal_year_start_month', 'fiscal_year_start_month', 'Fiscal Year Start',  'integer','number','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'language_code',           'language_code',           'Language',           'string', 'text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reporting_currency_code', 'reporting_currency_code', 'Reporting Currency', 'string', 'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_brand_profile_id','default_brand_profile_id','Default Brand',      'uuid',   'reference','one','standard',false,true,false,false,180,v_su),
            (v_ev,'default_letterhead_id',   'default_letterhead_id',   'Default Letterhead', 'uuid',   'reference','one','standard',false,true,false,false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/002_fields_notifications: done';

    -- ========================================================================
    -- Section: 003_fields_content
    -- ========================================================================


    -- ── attachment ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'file_name',   'file_name',    'File Name',  'string', 'text',  'one','standard',true, false, true,  true, 110,v_su),
            (v_ev,'file_size',   'size_bytes',   'File Size',  'integer','number','one','system',  false,false, true,  false,120,v_su),
            (v_ev,'mime_type',   'content_type', 'MIME Type',  'string', 'text',  'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'storage_key', 'storage_key',  'Storage Key','string', 'text',  'one','system',  false,false, false, false,140,v_su),
            (v_ev,'checksum',    'sha256',        'Checksum',   'string', 'text',  'one','system',  false,false, false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── multipart_upload ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'multipart_upload' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'upload_ref',  'upload_id',    'Upload ID',  'string',    'text',     'one','system',  true, false, false, false,110,v_su),
            (v_ev,'file_name',   'file_name',    'File Name',  'string',    'text',     'one','standard',true, false, true,  true, 120,v_su),
            (v_ev,'mime_type',   'content_type', 'MIME Type',  'string',    'text',     'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'expires_at',  'expires_at',   'Expires At', 'timestamp', 'datetime', 'one','system',  false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── attachment_acl ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment_acl' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'attachment_id','attachment_id','Attachment',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id', 'principal_id', 'User',        'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'group_id',     'group_id',     'Group',       'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level', 'access_level', 'Access Level','enum','select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',   'entity_type',      'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',     'entity_id',        'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'parent_id',     'parent_comment_id','Parent',      'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'body',          'comment_text',     'Body',        'text',   'textarea', 'one','standard',true, false, false, true, 140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_draft ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_draft' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'body',        'draft_text',  'Draft Body',  'text',  'textarea', 'one','standard',false,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_mention ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_mention' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',  'Comment',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','mentioned_id','Mentioned User','uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'is_notified', 'is_notified', 'Notified',      'boolean','hidden',   'one','system',  false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_reaction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_reaction' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',   'Comment', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id', 'User',    'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'emoji',       'reaction_type','Emoji',   'string','text',     'one','standard',true, true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',  'entity_type', 'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',    'entity_id',   'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'subject',      'title',       'Subject',     'string', 'text',     'one','standard',false,false, true,  true, 130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation_participant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation_participant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'conversation_id','conversation_id','Conversation','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id',   'principal_id',   'User',        'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',      'joined_at',      'Joined At',   'timestamp','datetime','one','system',false,true,true,false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/003_fields_content: done';

    -- ========================================================================
    -- Section: 004_fields_doc_template
    -- ========================================================================


    -- ── document ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'document' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'tags','tags','Tags','string','text','one','standard',false,false,false,true,110,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── brand_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'brand_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'direction',       'direction',       'Direction',        'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'default_locale',  'default_locale',  'Default Locale',   'string', 'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_default',      'is_default',      'Default',          'boolean','hidden','one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── letterhead ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'letterhead' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'watermark_text',    'watermark_text',    'Watermark',       'string', 'text',     'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'is_default',        'is_default',        'Default',         'boolean','hidden',   'one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'kind',               'kind',               'Template Kind',     'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'engine',             'engine',             'Engine',            'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version',   'uuid',   'reference','one','system',  false,true,  false, false,130,v_su),
            (v_ev,'is_rtl_supported',   'is_rtl_supported',   'RTL Support',       'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template_binding ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template_binding' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'template_id', 'template_id', 'Template',   'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_name', 'entity_name', 'Entity',     'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'operation',   'operation',   'Operation',  'string', 'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'variant',     'variant',     'Variant',    'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'priority',    'priority',    'Priority',   'integer','number',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── entity_document_link ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'entity_document_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'document_id', 'document_id', 'Document',    'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'link_type',   'link_type',   'Link Type',   'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── lifecycle_instance ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'lifecycle_instance' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_name', 'entity_name', 'Entity Name', 'string','text',     'one','system',true, true,  true,  false,110,v_su),
            (v_ev,'entity_ref',  'entity_id',   'Entity ID',   'string','text',     'one','system',true, true,  false, true, 120,v_su),
            (v_ev,'lifecycle_id','lifecycle_id','Lifecycle',   'uuid',  'reference','one','system',true, true,  false, false,130,v_su),
            (v_ev,'state_id',    'state_id',    'State',       'uuid',  'reference','one','system',true, true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── print_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'print_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'paper_size',    'paper_size',    'Paper Size',    'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'orientation',   'orientation',   'Orientation',   'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'color_mode',    'color_mode',    'Color Mode',    'enum',   'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'output_format', 'output_format', 'Output Format', 'enum',   'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'quality_dpi',   'quality_dpi',   'DPI',           'integer','number','one','standard',false,false, true,  false,150,v_su),
            (v_ev,'is_default',    'is_default',    'Default',       'boolean','hidden','one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/004_fields_doc_template: done';

    -- ========================================================================
    -- Section: 005_fields_finance_org
    -- ========================================================================


    -- ── legal_entity ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'legal_entity' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',        'legal_name',             'Legal Name',        'string','text',      'one','standard',true, true,  true,  true,  110,v_su),
            (v_ev,'registration_no',   'registration_no',        'Registration No.',  'string','text',      'one','standard',false,true,  false, true,  120,v_su),
            (v_ev,'tax_identifier',    'tax_registration_number','Tax ID',            'string','text',      'one','standard',false,true,  false, true,  130,v_su),
            (v_ev,'country_code',      'country_code',           'Country',           'string','text',      'one','standard',true, true,  true,  false, 140,v_su),
            (v_ev,'entity_type',       'entity_type',            'Entity Type',       'enum',  'select',    'one','standard',true, true,  true,  false, 150,v_su),
            (v_ev,'incorporation_date','incorporation_date',      'Incorporated',      'date',  'date',      'one','standard',false,true,  true,  false, 160,v_su),
            (v_ev,'is_publicly_listed','is_publicly_listed',     'Publicly Listed',   'boolean','hidden',   'one','standard',false,true,  false, false, 170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_entity_id',         'legal_entity_id',         'Legal Entity',         'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"legal_entity"}'::jsonb,110,v_su),
            (v_ev,'functional_currency',     'functional_currency',     'Functional Currency',  'string', 'currency', 'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'country_code',            'country_code',            'Country',              'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'fiscal_year_start_month', 'fiscal_year_start_month', 'Fiscal Year Start',    'integer','number',   'one','standard',true, true,  true,  false,NULL::jsonb,140,v_su),
            (v_ev,'fiscal_year_variant',     'fiscal_year_variant',     'Fiscal Year Variant',  'string', 'text',     'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'default_ledger_book_id',  'default_ledger_book_id',  'Default Ledger Book',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"ledger_book"}'::jsonb,160,v_su),
            (v_ev,'regulatory_framework',    'regulatory_framework',    'Regulatory Framework', 'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'timezone',                'timezone_code',           'Timezone',             'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,180,v_su),
            (v_ev,'tax_registration_number', 'tax_registration_number', 'Tax Registration No.', 'string', 'text',     'one','standard',false,true,  false, true, NULL::jsonb,190,v_su),
            (v_ev,'tax_jurisdiction_id',     'tax_jurisdiction_id',     'Tax Jurisdiction',     'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_jurisdiction"}'::jsonb,200,v_su),
            (v_ev,'is_intercompany_enabled', 'is_intercompany_enabled', 'Intercompany Enabled', 'boolean','checkbox',  'one','standard',false,true,  true,  false,NULL::jsonb,210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_unit ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_unit' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid','reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'bu_type',         'bu_type',         'Unit Type',      'enum','select',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'bu_head_id',      'bu_head_id',      'Head',           'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,130,v_su),
            (v_ev,'parent_id',       'parent_id',       'Parent Unit',    'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"business_unit"}'::jsonb,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── cost_center ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'cost_center' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',  'company_code_id',     'Company Code',  'uuid','reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'cost_center_type', 'cost_center_category','Type',          'enum','select',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'manager_id',       'responsible_person_id','Manager',      'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,130,v_su),
            (v_ev,'parent_id',        'parent_id',           'Parent',        'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"cost_center"}'::jsonb,140,v_su),
            (v_ev,'level_no',         'level_no',            'Level',         'integer','number', 'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'path',             'path',                'Path',          'string','text',    'one','system',  false,false, false, true, NULL::jsonb,160,v_su),
            (v_ev,'node_type',        'node_type',           'Node Type',     'enum','select',    'one','standard',true, true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'profit_center_id', 'profit_center_id',    'Profit Center', 'uuid','reference', 'one','standard',false,true,  false, false,'{"ref_entity":"profit_center"}'::jsonb,180,v_su),
            (v_ev,'site_id',          'site_id',             'Site',          'uuid','reference', 'one','standard',false,true,  false, false,'{"ref_entity":"site"}'::jsonb,190,v_su),
            (v_ev,'currency_code',    'currency_code',       'Currency',      'string','currency','one','standard',false,true,  false, false,NULL::jsonb,200,v_su),
            (v_ev,'is_statistical',   'is_statistical',      'Statistical',   'boolean','checkbox','one','standard',false,true, true,  false,NULL::jsonb,210,v_su),
            (v_ev,'valid_from',       'valid_from',          'Valid From',    'date','date',      'one','standard',false,true,  true,  false,NULL::jsonb,220,v_su),
            (v_ev,'valid_to',         'valid_to',            'Valid To',      'date','date',      'one','standard',false,true,  true,  false,NULL::jsonb,230,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;

        UPDATE control.entity_field ef
           SET lookup_config = v.lookup_config,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
            ('profit_center_id'::text, '{"search_fields":["code","name"],"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"empty"}}'::jsonb),
            ('site_id'::text,          '{"search_fields":["code","name"],"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"empty"}}'::jsonb)
          ) AS v(field_name, lookup_config)
         WHERE ef.entity_version_id = v_ev
           AND ef.name = v.field_name;
    END IF;

    -- ── profit_center ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'profit_center' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id',     'Company Code', 'uuid','reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'pc_type',         'profit_center_type',  'Type',         'enum','select',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'manager_id',      'responsible_person_id','Manager',     'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,130,v_su),
            (v_ev,'parent_id',       'parent_id',           'Parent',       'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"profit_center"}'::jsonb,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── warehouse ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'warehouse' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'site_id',         'site_id',         'Site',           'uuid','reference','one','standard',true, true,  false, false,'{"ref_entity":"site"}'::jsonb,110,v_su),
            (v_ev,'warehouse_type',  'warehouse_type',  'Type',           'enum','select',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'manager_id',      'manager_id',      'Manager',        'uuid','reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/005_fields_finance_org: done';

    -- ========================================================================
    -- Section: 006_fields_coa_gl
    -- ========================================================================


    -- ── chart_of_account ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'chart_of_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'coa_type',      'framework',     'COA Type',      'enum',   'select',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'country_code',  'country_code',  'Country',       'string', 'text',    'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'account_range', 'account_range', 'Account Range', 'string', 'text',    'one','standard',false,false, false, false,130,v_su),
            (v_ev,'version',       'version',       'Version',       'integer','number',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_locked',     'is_locked',     'Locked',        'boolean','checkbox','one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_type ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'account_class',    'account_class',    'Account Class',    'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'normal_balance',   'normal_balance',   'Normal Balance',   'enum',   'select', 'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_balance_sheet', 'is_balance_sheet', 'Balance Sheet',    'boolean','hidden', 'one','standard',true, true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'chart_of_account_id','chart_of_account_id','Chart of Accounts','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent Account',   'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'account_nature',     'account_class',      'Nature',           'enum','select',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'node_type',          'node_type',          'Node Type',        'enum','select',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'normal_balance',     'normal_balance',     'Normal Balance',   'enum','select',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'subledger_type',     'subledger_type',     'Subledger Type',   'string','text',  'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'currency_code',      'currency_code',      'Currency',         'string','currency','one','standard',false,true, false, false,170,v_su),
            (v_ev,'account_level',      'level_no',           'Level',            'integer','number','one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'account_path',       'path',               'Account Path',     'string','text',  'one','system',  false,false, false, true, 190,v_su),
            (v_ev,'sort_order',         'sort_order',         'Sort Order',       'integer','number','one','standard',false,false, true,  false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_hierarchy ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_hierarchy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'root_account_id', 'root_account_id', 'Root Account',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'level',           'level',           'Level',         'integer','number','one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'path',            'path',            'Path',          'string','text',   'one','system',  false,false, false, true, 140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ledger_book
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'ledger_book' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',                 'code',                 'Book Code',         'string', 'text',    'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'name',                 'name',                 'Name',              'string', 'text',    'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'category',             'category',             'Category',          'string', 'select',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'base_currency_code',   'base_currency_code',   'Base Currency',     'string', 'currency','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_primary',           'is_primary',           'Primary',           'boolean','checkbox','one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'is_manual_je_allowed', 'is_manual_je_allowed', 'Manual JE Allowed', 'boolean','checkbox','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'status',               'status',               'Status',            'string', 'status',  'one','system',  true, true,  true,  false,170,v_su),
            (v_ev,'sort_order',           'sort_order',           'Sort Order',        'integer','number',  'one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_gl_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',        'company_code_id',        'Company Code',           'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'gl_account_id',          'gl_account_id',          'GL Account',             'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'is_posting_allowed',     'posting_allowed',        'Posting Allowed',        'boolean','checkbox', 'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_blocked_for_manual',  'blocked_for_manual',     'Blocked for Manual',     'boolean','checkbox', 'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_blocked_for_auto',    'blocked_for_auto',       'Blocked for Auto',       'boolean','checkbox', 'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'requires_cost_center',   'requires_cost_center',   'Requires Cost Center',   'boolean','checkbox', 'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'requires_profit_center', 'requires_profit_center', 'Requires Profit Center', 'boolean','checkbox', 'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'requires_project',       'requires_project',       'Requires Project',       'boolean','checkbox', 'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'default_cost_center_id', 'default_cost_center_id', 'Default Cost Center',    'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'default_site_id',        'default_site_id',        'Default Site',           'uuid',   'reference','one','standard',false,true,  false, false,200,v_su),
            (v_ev,'tax_category',           'tax_category',           'Tax Category',           'string', 'text',     'one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'reconciliation_type',    'reconciliation_type',    'Reconciliation Type',    'string', 'text',     'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_book_assignment ──────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_book_assignment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_id',         'book_id',         'Ledger Book',  'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'priority',        'priority',        'Priority',     'integer','number',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'status',          'status',          'Status',       'string','status',   'one','system',  true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;

        DELETE FROM control.entity_field
        WHERE entity_version_id = v_ev
          AND name IN ('book_code','is_leading');
    END IF;

    RAISE NOTICE '035_version_fields/006_fields_coa_gl: done';

    -- ========================================================================
    -- Section: 007_fields_project_fiscal
    -- ========================================================================


    -- ── project ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'project_type',      'project_type',        'Project Type',   'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'company_code_id',   'company_code_id',     'Company Code',   'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'start_date',        'planned_start',       'Start Date',     'date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'end_date',          'planned_end',         'End Date',       'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'budget_amount',     'planned_cost',        'Budget',         'money',  'money',    'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'currency_id',       'currency_code',       'Currency',       'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'project_manager_id','responsible_person_id','Project Manager','uuid',  'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'parent_project_id', 'parent_project_id',  'Parent Project', 'uuid',   'reference','one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── project_item ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'project_id',      'project_id',    'Project',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'item_type',       'item_type',     'Item Type',     'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planned_amount',  'planned_cost',  'Planned',       'money',  'money',    'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'currency_id',     'currency_code', 'Currency',      'uuid',   'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dimension_count', 'dimension_count', 'Dimensions', 'integer','number', 'one','system',false,false, false, false,110,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fiscal_period ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fiscal_period' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'period_no',       'period_number',   'Period No.',    'integer','number',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'period_type',     'period_type',     'Period Type',   'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fiscal_year',     'fiscal_year',     'Fiscal Year',   'integer','number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'start_date',      'start_date',      'Start Date',    'date',   'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'end_date',        'end_date',        'End Date',      'date',   'date',     'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',   'reference','one','standard',true, true,  false, false,160,v_su),
            (v_ev,'posting_status',  'status',          'Posting Status','enum',   'status',   'one','system',  true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/007_fields_project_fiscal: done';

    -- ========================================================================
    -- Section: 008_fields_partners
    -- ========================================================================


    -- ── customer ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'customer' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'business_partner_id','business_partner_id','Business Partner', 'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_partner"}'::jsonb,110,v_su),
            (v_ev,'customer_code',      'customer_code',      'Customer Code',    'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'customer_type',      'customer_type',      'Type',             'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'account_manager_id', 'account_manager_id', 'Account Manager',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,140,v_su),
            (v_ev,'risk_rating',        'risk_rating',        'Risk Rating',      'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_key_account',     'is_key_account',     'Key Account',      'boolean','checkbox', 'one','standard',false,true,  true,  false,NULL::jsonb,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── supplier ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'supplier' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        -- Remove is_preferred / is_preferred_supplier if mistakenly seeded on supplier entity.
        -- This field belongs to supplier_qualification (016_supplier_qualification.sql),
        -- not master.supplier — querying it against master.supplier causes a column error.
        DELETE FROM control.entity_field
        WHERE entity_version_id = v_ev
          AND name IN ('is_preferred', 'is_preferred_supplier');

        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'business_partner_id','business_partner_id','Business Partner','uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_partner"}'::jsonb,110,v_su),
            (v_ev,'supplier_code',      'supplier_code',      'Supplier Code',   'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'supplier_type',      'supplier_type',      'Type',            'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'payment_term_id',    'payment_term_id',    'Payment Terms',   'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,140,v_su),
            (v_ev,'payment_method_id',  'payment_method_id',  'Payment Method',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,150,v_su),
            (v_ev,'account_manager_id', 'account_manager_id', 'Account Manager', 'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,160,v_su),
            (v_ev,'commodity_category_id',  'commodity_category_id',  'Commodity Category',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"commodity_category"}'::jsonb,170,v_su),
            (v_ev,'is_payment_ready',   'is_payment_ready',   'Payment Ready',   'boolean','checkbox', 'one','standard',false,true,  true,  false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── employee ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'employee' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'employee_number', 'employee_number', 'Employee Number', 'string','text',     'one','standard',true, true,  true,  true, NULL::jsonb,110,v_su),
            (v_ev,'principal_id',    'principal_id',    'User Account',    'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,120,v_su),
            (v_ev,'first_name',      'first_name',      'First Name',      'string','text',     'one','standard',true, false, true,  true, NULL::jsonb,130,v_su),
            (v_ev,'last_name',       'last_name',       'Last Name',       'string','text',     'one','standard',true, false, true,  true, NULL::jsonb,140,v_su),
            (v_ev,'display_name',    'display_name',    'Display Name',    'string','text',     'one','standard',false,false, true,  true, NULL::jsonb,150,v_su),
            (v_ev,'email',           'email',           'Email',           'string','email',    'one','standard',false,true,  true,  true, NULL::jsonb,160,v_su),
            (v_ev,'phone',           'phone',           'Phone',           'string','phone',    'one','standard',false,false, false, true, NULL::jsonb,170,v_su),
            (v_ev,'employment_type', 'employment_type', 'Employment Type', 'enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'department',      'department',      'Department',      'string','text',     'one','standard',false,true,  true,  true, NULL::jsonb,190,v_su),
            (v_ev,'title',           'title',           'Title',           'string','text',     'one','standard',false,true,  true,  true, NULL::jsonb,200,v_su),
            (v_ev,'manager_id',      'manager_id',      'Manager',         'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"employee"}'::jsonb,210,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',    'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,220,v_su),
            (v_ev,'hire_date',       'hire_date',       'Hire Date',       'date',  'date',     'one','standard',false,true,  true,  false,NULL::jsonb,230,v_su),
            (v_ev,'termination_date','termination_date','Termination Date', 'date',  'date',     'one','standard',false,true,  true,  false,NULL::jsonb,240,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_customer_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_customer_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'customer_id',                   'customer_id',                   'Customer',            'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"customer"}'::jsonb,110,v_su),
            (v_ev,'company_code_id',               'company_code_id',               'Company Code',        'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'credit_limit',                  'credit_limit',                  'Credit Limit',        'money',  'money',    'one','standard',false,true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'credit_limit_currency_code',    'credit_limit_currency_code',    'Credit Currency',     'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'credit_rating',                 'credit_rating',                 'Credit Rating',       'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_blocked',                    'is_blocked',                    'Blocked',             'boolean','toggle',   'one','standard',false,true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'block_reason',                  'block_reason',                  'Block Reason',        'string', 'text',     'one','standard',false,false, false, false,NULL::jsonb,170,v_su),
            (v_ev,'default_accounting_profile_id', 'default_accounting_profile_id', 'Accounting Profile',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"accounting_profile"}'::jsonb,180,v_su),
            (v_ev,'tax_group_id',                  'tax_group_id',                  'Tax Group',           'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,190,v_su),
            (v_ev,'default_receipt_method_id',     'default_receipt_method_id',     'Receipt Method',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,200,v_su),
            (v_ev,'default_dimension_set_id',      'default_dimension_set_id',      'Dimension Set',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,210,v_su),
            (v_ev,'payment_term_id',               'payment_term_id',               'Payment Terms',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,220,v_su),
            (v_ev,'currency_code',                 'currency_code',                 'Currency',            'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,230,v_su),
            (v_ev,'statement_cycle_code',          'statement_cycle_code',          'Statement Cycle',     'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,240,v_su),
            (v_ev,'dunning_policy_id',             'dunning_policy_id',             'Dunning Policy',      'uuid',   'reference','one','standard',false,true,  false, false,NULL::jsonb,250,v_su),
            (v_ev,'status',                        'status',                        'Status',              'lifecycle_state','select','one','standard',true,true,true,false,NULL::jsonb,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_supplier_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_supplier_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'supplier_id',                      'supplier_id',                      'Supplier',             'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"supplier"}'::jsonb,110,v_su),
            (v_ev,'company_code_id',                  'company_code_id',                  'Company Code',         'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'is_blocked',                       'is_blocked',                       'Blocked',              'boolean','toggle',   'one','standard',false,true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'block_reason',                     'block_reason',                     'Block Reason',         'string', 'text',     'one','standard',false,false, false, false,NULL::jsonb,140,v_su),
            (v_ev,'currency_code',                    'currency_code',                    'Currency',             'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,150,v_su),
            (v_ev,'default_accounting_profile_id',    'default_accounting_profile_id',    'Accounting Profile',   'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"accounting_profile"}'::jsonb,160,v_su),
            (v_ev,'payment_term_id',                  'payment_term_id',                  'Payment Terms',        'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,170,v_su),
            (v_ev,'payment_method_id',                'payment_method_id',                'Payment Method',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,180,v_su),
            (v_ev,'preferred_remittance_bank_link_id','preferred_remittance_bank_link_id','Remittance Bank',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"business_partner_bank_account"}'::jsonb,190,v_su),
            (v_ev,'tax_group_id',                     'tax_group_id',                     'Tax Group',            'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,200,v_su),
            (v_ev,'default_wht_tax_group_id',         'default_wht_tax_group_id',         'Default WHT Group',    'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,210,v_su),
            (v_ev,'default_dimension_set_id',         'default_dimension_set_id',         'Dimension Set',        'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,220,v_su),
            (v_ev,'invoice_hold_policy_id',           'invoice_hold_policy_id',           'Invoice Hold Policy',  'uuid',   'reference','one','standard',false,true,  false, false,NULL::jsonb,230,v_su),
            (v_ev,'status',                           'status',                           'Status',               'lifecycle_state','select','one','standard',true,true,true,false,NULL::jsonb,240,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/008_fields_partners: done';

    -- ========================================================================
    -- Section: 009_fields_assets
    -- ========================================================================


    -- ── asset_class ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_class' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',  'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_id',         'parent_id',         'Parent Class',  'uuid',   'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'asset_nature',      'asset_nature',      'Nature',        'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_depreciable',    'is_depreciable',    'Depreciable',   'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'capitalization_threshold','capitalization_threshold','Cap Threshold','money','money','one','standard',false,true,true,false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',      'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'sort_order',        'sort_order',        'Sort Order',    'integer','number',   'one','standard',false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'asset_class_id',    'asset_class_id',    'Asset Class',     'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'acquisition_date',  'acquisition_date',  'Acquisition Date','date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'in_service_date',   'in_service_date',   'In Service Date', 'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'acquisition_cost',  'acquisition_cost',  'Acquisition Cost','money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',        'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'cost_center_id',    'cost_center_id',    'Cost Center',     'uuid',   'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'custodian_id',      'custodian_id',      'Custodian',       'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'barcode',           'barcode',           'Barcode',         'string', 'text',     'one','standard',false,true,  false, true, 200,v_su),
            (v_ev,'serial_number',     'serial_number',     'Serial No.',      'string', 'text',     'one','standard',false,true,  false, true, 210,v_su),
            (v_ev,'retirement_type',   'retirement_type',   'Retirement Type', 'enum',   'select',   'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_book ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_book' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'asset_id',              'asset_id',              'Asset',            'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_type',             'book_type',             'Book Type',        'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'depreciation_method',   'depreciation_method',   'Depr Method',      'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'useful_life_months',    'useful_life_months',    'Useful Life (mo)', 'integer','number',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'cost_basis',            'cost_basis',            'Cost Basis',       'money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'accumulated_depreciation','accumulated_depreciation','Accum Depr',   'money',  'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'carrying_amount',       'carrying_amount',       'Carrying Amount',  'money',  'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'currency_code',         'currency_code',         'Currency',         'string', 'text',     'one','standard',true, true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_component ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_component' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_asset_id',   'parent_asset_id',   'Parent Asset',    'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'component_asset_id','component_asset_id','Component Asset', 'uuid',   'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'component_type',    'component_type',    'Component Type',  'enum',   'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'pct_of_parent',     'pct_of_parent',     'Allocation %',    'decimal','number',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'allocated_cost',    'allocated_cost',    'Allocated Cost',  'money',  'money',    'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_assignment_history ──────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_assignment_history' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'asset_id',       'asset_id',       'Asset',          'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'assignment_type','assignment_type','Assignment Type','enum',     'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'to_value_id',    'to_value_id',    'To (New)',       'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',     'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_to',   'effective_to',   'Effective To',   'date',     'date',     'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'reason',         'reason',         'Reason',         'text',     'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'assigned_by',    'assigned_by',    'Assigned By',    'uuid',     'reference','one','standard',true, true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/009_fields_assets: done';

    -- ========================================================================
    -- Section: 010_fields_dimensions
    -- ========================================================================


    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name = 'business_intent'
      AND ef.name IN (
          'default_gl_account_id',
          'default_tax_group_id',
          'is_approval_required',
          'max_auto_approve_amount',
          'max_auto_approve_currency',
          'default_tax_code',
          'default_asset_profile_code',
          'commodity_domain_affinities'
      );

    -- ── dimension_type ────────────────────────────────────────────────────────
    -- No reference fields; validation column omitted.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',              'category',              'Category',          'enum',    'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_hierarchical',       'is_hierarchical',       'Hierarchical',      'boolean', 'hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'max_depth',             'max_depth',             'Max Depth',         'integer', 'number', 'one','standard',false,false, true,  false,130,v_su),
            (v_ev,'is_balanced',           'is_balanced',           'Balanced',          'boolean', 'hidden', 'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_multi_allowed',      'is_multi_allowed',      'Multi-Value',       'boolean', 'hidden', 'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_company_scoped_allowed','is_company_scoped_allowed','Company Scoped','boolean','hidden', 'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'source_entity_name',    'source_entity_name',    'Source Entity',     'string',  'text',   'one','system',  false,true,  false, false,170,v_su),
            (v_ev,'icon',                  'icon',                  'Icon',              'string',  'text',   'one','standard',false,false, false, false,180,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',        'integer', 'number', 'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_value ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_value' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dimension_type_id',   'dimension_type_id',   'Dimension Type',    'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',      'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    120,v_su),
            (v_ev,'parent_id',           'parent_id',           'Parent',            'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'level_no',            'level_no',            'Level',             'integer', 'number',   'one','system',  false,true,  true,  false,NULL::jsonb,                               140,v_su),
            (v_ev,'path_key',            'path_key',            'Path',              'string',  'text',     'one','system',  false,false, true,  false,NULL::jsonb,                               150,v_su),
            (v_ev,'effective_from',      'effective_from',      'Effective From',    'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               160,v_su),
            (v_ev,'effective_to',        'effective_to',        'Effective To',      'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               170,v_su),
            (v_ev,'is_posting_allowed',  'is_posting_allowed',  'Posting Allowed',   'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               180,v_su),
            (v_ev,'is_budgeting_allowed','is_budgeting_allowed','Budgeting Allowed', 'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               190,v_su),
            (v_ev,'is_planning_allowed', 'is_planning_allowed', 'Planning Allowed',  'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               200,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,NULL::jsonb,                               210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set_item ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dimension_set_id',   'dimension_set_id',   'Dimension Set',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,   110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Value',          'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'ordinal',            'ordinal',            'Order',          'integer', 'number',   'one','standard',true, false, true,  false,NULL::jsonb,                               140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_intent ───────────────────────────────────────────────────────
    -- CONTROL class: 000_common_fields inserts description/status/is_active but NOT code/name
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_intent' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',                   'code',                   'Code',               'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,                                  100,v_su),
            (v_ev,'name',                   'name',                   'Name',               'string', 'text',     'one','standard',true, false, true,  true, NULL::jsonb,                                  105,v_su),
            (v_ev,'domain',                 'domain',                 'Domain',             'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                  110,v_su),
            (v_ev,'subtype',                'subtype',                'Subtype',            'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,                                  120,v_su),
            (v_ev,'parent_id',              'parent_id',              'Parent Intent',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"business_intent"}'::jsonb,    130,v_su),
            (v_ev,'visibility',             'visibility',             'Visibility',         'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                  180,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',         'integer','number',   'one','standard',false,false, true,  false,NULL::jsonb,                                  190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_intent_policy ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_intent_policy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',        'company_code_id',        'Company Code',     'uuid',  'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    110,v_su),
            (v_ev,'intent_id',              'intent_id',              'Intent',           'uuid',  'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_intent"}'::jsonb, 120,v_su),
            (v_ev,'mapping_mode',           'mapping_mode',           'Mode',             'enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                130,v_su),
            (v_ev,'is_default',             'is_default',             'Default',          'boolean','hidden',  'one','standard',false,true,  false, false,NULL::jsonb,                                140,v_su),
            (v_ev,'override_gl_account_id', 'override_gl_account_id', 'Override GL Acct', 'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"gl_account"}'::jsonb,      150,v_su),
            (v_ev,'notes',                  'notes',                  'Notes',            'text',  'textarea', 'one','standard',false,false, false, true, NULL::jsonb,                                160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_dimension_default ────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_dimension_default' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',    'company_code_id',    'Company Code',   'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Default Value',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'is_mandatory',       'is_mandatory',       'Mandatory',      'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               140,v_su),
            (v_ev,'allow_override',     'allow_override',     'Allow Override', 'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               150,v_su),
            (v_ev,'effective_from',     'effective_from',     'Effective From', 'date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,                               160,v_su),
            (v_ev,'effective_to',       'effective_to',       'Effective To',   'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── Patch existing rows missing ref_entity (idempotent UPDATE) ────────────
    -- Covers rows already inserted before validation column was added to this file.
    UPDATE control.entity_field ef
       SET validation = ref_fix.val
      FROM (VALUES
        ('dimension_value',              'dimension_type_id',        '{"ref_entity":"dimension_type"}'::jsonb),
        ('dimension_value',              'company_code_id',          '{"ref_entity":"company_code"}'::jsonb),
        ('dimension_value',              'parent_id',                '{"ref_entity":"dimension_value"}'::jsonb),
        ('dimension_set_item',           'dimension_set_id',         '{"ref_entity":"dimension_set"}'::jsonb),
        ('dimension_set_item',           'dimension_type_id',        '{"ref_entity":"dimension_type"}'::jsonb),
        ('dimension_set_item',           'dimension_value_id',       '{"ref_entity":"dimension_value"}'::jsonb),
        ('business_intent',              'parent_id',                '{"ref_entity":"business_intent"}'::jsonb),
        ('company_code_intent_policy',   'company_code_id',          '{"ref_entity":"company_code"}'::jsonb),
        ('company_code_intent_policy',   'intent_id',                '{"ref_entity":"business_intent"}'::jsonb),
        ('company_code_intent_policy',   'override_gl_account_id',   '{"ref_entity":"gl_account"}'::jsonb),
        ('company_code_dimension_default','company_code_id',         '{"ref_entity":"company_code"}'::jsonb),
        ('company_code_dimension_default','dimension_type_id',       '{"ref_entity":"dimension_type"}'::jsonb),
        ('company_code_dimension_default','dimension_value_id',      '{"ref_entity":"dimension_value"}'::jsonb)
      ) AS ref_fix(entity_name, field_name, val),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.name = ref_fix.entity_name
       AND (ef.validation IS NULL OR NOT (ef.validation ? 'ref_entity'));

    RAISE NOTICE '035_version_fields/010_fields_dimensions: done';

    -- ========================================================================
    -- Section: 011_fields_tax_fx
    -- ========================================================================


    -- ── tax_jurisdiction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_jurisdiction' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',       'country_code',       'Country',          'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'state_region_code',  'state_region_code',  'State/Region',     'string',  'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'jurisdiction_type',  'jurisdiction_type',  'Type',             'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',           'uuid',    'reference','one','standard',false,true,false,false,140,v_su),
            (v_ev,'level_no',           'level_no',           'Level',            'integer', 'number','one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'filing_frequency',   'filing_frequency',   'Filing Frequency', 'enum',    'select','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'currency_code',      'currency_code',      'Currency',         'string',  'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'sort_order',         'sort_order',         'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tax_type ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_type' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category',              'category',              'Category',         'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_recoverable',        'is_recoverable',        'Recoverable',      'boolean', 'hidden','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_deducted_at_source', 'is_deducted_at_source', 'Deducted at Source','boolean','hidden','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'is_included_in_price',  'is_included_in_price',  'Included in Price','boolean', 'hidden','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_compound_eligible',  'is_compound_eligible',  'Compound Eligible','boolean', 'hidden','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fx_rate ───────────────────────────────────────────────────────────────
    -- NOTE: fx_rate has no code/name columns; 000_common_fields bulk-inserts them
    -- for all MASTER entities (harmless — ON CONFLICT DO NOTHING guards inserts).
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fx_rate' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'from_currency',  'from_currency',  'From Currency', 'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'to_currency',    'to_currency',    'To Currency',   'string',  'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'rate',           'rate',           'Rate',          'decimal', 'number','one','standard',true, false, true,  false,130,v_su),
            (v_ev,'rate_type',      'rate_type',      'Rate Type',     'enum',    'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_date', 'effective_date', 'Effective Date','date',    'date',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'source',         'source',         'Source',        'enum',    'select','one','standard',true, true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/011_fields_tax_fx: done';

    -- ========================================================================
    -- Section: 012_fields_budget
    -- ========================================================================


    -- ── budget_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'fund_type',           'fund_type',           'Fund Type',        'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fund_source',         'fund_source',         'Fund Source',      'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'total_amount',        'total_amount',        'Total Amount',     'money',   'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,190,v_su),
            (v_ev,'is_multi_year',       'is_multi_year',       'Multi-Year',       'boolean', 'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'multi_year_strategy', 'multi_year_strategy', 'Multi-Yr Strategy','enum',    'select',   'one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_replenishable',    'is_replenishable',    'Replenishable',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'parent_profile_id',   'parent_profile_id',   'Parent Profile',   'uuid',    'reference','one','standard',false,true,  false, false,250,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── budget_allocation ─────────────────────────────────────────────────────
    -- DOCUMENT class: code/name not bulk-inserted by 000_common_fields; add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_allocation' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',                'code',                'Code',             'string',  'text',     'one','standard',true, true,  true,  true, 100,v_su),
            (v_ev,'name',                'name',                'Name',             'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'budget_profile_id',   'budget_profile_id',   'Budget Profile',   'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'cost_center_id',      'cost_center_id',      'Cost Center',      'uuid',    'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'project_id',          'project_id',          'Project',          'uuid',    'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'gl_account_id',       'gl_account_id',       'GL Account',       'uuid',    'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'allocated_amount',    'allocated_amount',    'Allocated',        'money',   'money',    'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,190,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,200,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_carry_forward',    'is_carry_forward',    'Carry Forward',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,250,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── planning_model ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'planning_model' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',      'company_code_id',      'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'model_type',           'model_type',           'Model Type',      'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planning_horizon',     'planning_horizon',     'Horizon',         'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'granularity',          'granularity',          'Granularity',     'enum',    'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'base_currency_code',   'base_currency_code',   'Base Currency',   'string',  'text',     'one','standard',true, true,  false, false,150,v_su),
            (v_ev,'fiscal_year_from',     'fiscal_year_from',     'Fiscal Year From','integer', 'number',   'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'fiscal_year_to',       'fiscal_year_to',       'Fiscal Year To',  'integer', 'number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'version',              'version',              'Version',         'integer', 'number',   'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'is_current',           'is_current',           'Current',         'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su),
            (v_ev,'based_on_model_id',    'based_on_model_id',    'Based On',        'uuid',    'reference','one','standard',false,true,  false, false,200,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',           'uuid',    'reference','one','standard',false,true,  false, false,210,v_su),
            (v_ev,'sort_order',           'sort_order',           'Sort Order',      'integer', 'number',   'one','standard',false,false, true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/012_fields_budget: done';

    -- ========================================================================
    -- Section: 013_fields_banking
    -- ========================================================================


    -- ── bank_party ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_party' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',          'country_code',          'Country',              'string', 'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'institution_type',      'institution_type',      'Institution Type',     'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'bic',                   'bic',                   'BIC / SWIFT',          'string', 'text',  'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'national_bank_code_type','national_bank_code_type','Bank Code Type',      'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'national_bank_code',    'national_bank_code',    'Bank Code',            'string', 'text',    'one','standard',false,false, false, true, 150,v_su),
            (v_ev,'branch_name',           'branch_name',           'Branch Name',          'string', 'text',    'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'supports_swift',        'supports_swift',        'Supports SWIFT',       'boolean','checkbox','one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'supports_local_clearing','supports_local_clearing','Supports Local Clearing','boolean','checkbox','one','standard',false,true,true,false,180,v_su),
            (v_ev,'supports_sepa',         'supports_sepa',         'Supports SEPA',        'boolean','checkbox','one','standard',false,true,  true,  false,190,v_su),
            (v_ev,'supports_ach',          'supports_ach',          'Supports ACH',         'boolean','checkbox','one','standard',false,true,  true,  false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'bank_party_id',       'bank_party_id',       'Bank',              'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"bank_party"}'::jsonb,110,v_su),
            (v_ev,'account_holder_name', 'account_holder_name', 'Account Holder',    'string', 'text',     'one','standard',true, false, true,  true, NULL::jsonb,120,v_su),
            (v_ev,'account_id_type',     'account_id_type',     'Account ID Type',   'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'account_id_value',    'account_id_value',    'Account Number',    'string', 'text',     'one','standard',true, false, false, false,NULL::jsonb,140,v_su),
            (v_ev,'account_last4',       'account_last4',       'Last 4',            'string', 'text',     'one','system',  false,false, false, false,NULL::jsonb,150,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',          'string', 'text',     'one','standard',true, true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'account_nature',      'account_nature',      'Account Nature',    'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'is_verified',         'is_verified',         'Verified',          'boolean','hidden',   'one','standard',false,true,  false, false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',      'owner_type',      'Owner Type',    'string',  'text',     'one','standard',true, true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',         'uuid',    'reference','one','standard',true, true,  false, false,NULL::jsonb,120,v_su),
            (v_ev,'bank_account_id', 'bank_account_id', 'Bank Account',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"bank_account"}'::jsonb,130,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,140,v_su),
            (v_ev,'purpose',         'purpose',         'Purpose',       'string',  'text',     'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_primary',      'is_primary',      'Primary',       'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,160,v_su),
            (v_ev,'effective_from',  'effective_from',  'Effective From','date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'effective_until', 'effective_until', 'Effective To',  'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_house_config ─────────────────────────────────────────────
    -- CONTROL class. The table has no description column; 099 removes any stale
    -- common-field description row left behind by older seed runs.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_house_config' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'bank_account_link_id',  'bank_account_link_id',  'Bank Account Link', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"bank_account_link"}'::jsonb,110,v_su),
            (v_ev,'gl_account_id',         'gl_account_id',         'Cash GL Account',   'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"gl_account"}'::jsonb,120,v_su),
            (v_ev,'usage_type',            'usage_type',            'Usage Type',        'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'is_disbursement_enabled','is_disbursement_enabled','Disbursement',     'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'is_collection_enabled', 'is_collection_enabled', 'Collection',        'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,150,v_su),
            (v_ev,'is_default_disbursement','is_default_disbursement','Default Disbursement','boolean','hidden', 'one','standard',false,true,  false, false,NULL::jsonb,160,v_su),
            (v_ev,'is_default_collection', 'is_default_collection', 'Default Collection','boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,170,v_su),
            (v_ev,'reconciliation_mode',   'reconciliation_mode',   'Reconciliation',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'priority',              'priority',              'Priority',          'integer', 'number',   'one','standard',false,false, true,  false,NULL::jsonb,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_method ────────────────────────────────────────────────────────
    -- requires_bank_interface is a behavioral capability. Execution bindings live
    -- in control.payment_method_interface_binding, not a master entity picker.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_method' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'direction',                  'direction',                  'Direction',                 'enum',   'select',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'instrument_mode',            'instrument_mode',            'Instrument Mode',           'enum',   'select',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'sort_order',                 'sort_order',                 'Sort Order',                'integer','number',  'one','standard',false,false, true,  false,130,v_su),
            (v_ev,'requires_bank_account',      'requires_bank_account',      'Requires Bank Account',     'boolean','checkbox','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'requires_counterparty_bank', 'requires_counterparty_bank', 'Requires Counterparty Bank','boolean','checkbox','one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'requires_bank_interface',    'requires_bank_interface',    'Requires Bank Interface',   'boolean','checkbox','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'requires_reference_number',  'requires_reference_number',  'Requires Reference No.',    'boolean','checkbox','one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'supports_batch',             'supports_batch',             'Supports Batch',            'boolean','checkbox','one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'supports_partial',           'supports_partial',           'Supports Partial',          'boolean','checkbox','one','standard',false,true,  true,  false,190,v_su),
            (v_ev,'supports_reversal',          'supports_reversal',          'Supports Reversal',         'boolean','checkbox','one','standard',false,true,  true,  false,200,v_su),
            (v_ev,'supports_file_generation',   'supports_file_generation',   'Supports File Generation',  'boolean','checkbox','one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'supports_real_time_api',     'supports_real_time_api',     'Supports Real-Time API',    'boolean','checkbox','one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/013_fields_banking: done';

    -- ========================================================================
    -- Section: 014_fields_payment_terms
    -- ========================================================================


    -- ── holiday_calendar ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'country_code',     'country_code',     'Country',          'string',  'text',  'one','standard',false,true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'company_code_id',  'company_code_id',  'Company Code',     'uuid',    'reference','one','standard',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'weekend_pattern',  'weekend_pattern',  'Weekend Pattern',  'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',          'boolean', 'hidden','one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'sort_order',       'sort_order',       'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,NULL::jsonb,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── holiday_calendar_day ──────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    -- name exists in DDL but not seeded by bulk pass — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar_day' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'holiday_calendar_id','holiday_calendar_id','Calendar',      'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"holiday_calendar"}'::jsonb,110,v_su),
            (v_ev,'calendar_year',      'calendar_year',      'Year',          'integer', 'number',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'holiday_date',       'holiday_date',       'Date',          'date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'name',               'name',               'Name',          'string',  'text',     'one','standard',true, false, true,  true, NULL::jsonb,140,v_su),
            (v_ev,'day_type',           'day_type',           'Day Type',      'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'observance_type',    'observance_type',    'Observance',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'is_half_day',        'is_half_day',        'Half Day',      'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'applicable_to',          'applicable_to',          'Applicable To',    'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'base_event',             'base_event',             'Base Event',       'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'due_rule_type',          'due_rule_type',          'Due Rule',         'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'due_days',               'due_days',               'Due Days',         'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,140,v_su),
            (v_ev,'due_day_of_month',       'due_day_of_month',       'Due Day of Month', 'integer', 'number','one','standard',false,true,  true,  false,'{"min":1,"max":31}'::jsonb,145,v_su),
            (v_ev,'grace_days',             'grace_days',             'Grace Days',       'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,150,v_su),
            (v_ev,'due_date_flexibility',   'due_date_flexibility',   'Due Flexibility',  'enum',    'select','one','standard',false,true,  true,  false,NULL::jsonb,155,v_su),
            (v_ev,'business_day_convention','business_day_convention','Business Day Convention','enum','select','one','standard',false,true,true,false,NULL::jsonb,158,v_su),
            (v_ev,'holiday_calendar_id',    'holiday_calendar_id',    'Holiday Calendar', 'uuid',    'reference','one','standard',false,true,false,false,'{"ref_entity":"holiday_calendar"}'::jsonb,160,v_su),
            (v_ev,'month_offset',           'month_offset',           'Month Offset',     'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,165,v_su),
            (v_ev,'term_category',          'term_category',          'Category',         'enum',    'select','one','standard',false,true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'installment_count',      'installment_count',      'Installments',     'integer', 'number','one','standard',false,true,  true,  false,'{"min":1}'::jsonb,175,v_su),
            (v_ev,'version',                'version',                'Version',          'integer', 'number','one','system',  false,true,  true,  false,'{"min":1}'::jsonb,180,v_su),
            (v_ev,'supersedes_payment_term_id','supersedes_payment_term_id','Supersedes Term','uuid','hidden','one','system',false,true,false,false,'{"ref_entity":"payment_term"}'::jsonb,185,v_su),
            (v_ev,'is_current_version',     'is_current_version',     'Current',          'boolean', 'hidden','one','system',  false,true,  false, false,NULL::jsonb,190,v_su),
            (v_ev,'effective_from',         'effective_from',         'Effective From',   'date',    'date',  'one','standard',false,true,  true,  false,NULL::jsonb,200,v_su),
            (v_ev,'effective_to',           'effective_to',           'Effective To',     'date',    'date',  'one','standard',false,true,  true,  false,NULL::jsonb,210,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,'{"min":0}'::jsonb,220,v_su),
            (v_ev,'status_changed_at',      'status_changed_at',      'Status Changed At','datetime','hidden','one','system',false,true,  true,  false,NULL::jsonb,900,v_su),
            (v_ev,'status_changed_by',      'status_changed_by',      'Status Changed By','uuid',    'hidden','one','system',false,true, false, false,'{"ref_entity":"principal"}'::jsonb,910,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_clause ───────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    -- is_active is standalone boolean (no status column) — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_clause' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'payment_term_id', 'payment_term_id', 'Payment Term',    'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,110,v_su),
            (v_ev,'clause_code',     'clause_code',     'Clause Code',     'string',  'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'clause_type',     'clause_type',     'Clause Type',     'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'sequence_no',     'sequence_no',     'Sequence',        'integer', 'number',   'one','standard',true, false, true,  false,'{"min":1}'::jsonb,140,v_su),
            (v_ev,'calc_mode',       'calc_mode',       'Calc Mode',       'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'default_pct',     'default_pct',     'Default %',       'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,160,v_su),
            (v_ev,'default_amount',  'default_amount',  'Default Amount',  'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,170,v_su),
            (v_ev,'flexibility_mode','flexibility_mode','Flexibility',     'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'is_active',       'is_active',       'Active',          'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,190,v_su),
            (v_ev,'settles_clause_code','settles_clause_code','Settles Clause','string','text',   'one','standard',false,true,  true,  false,NULL::jsonb,200,v_su),
            (v_ev,'application_scope','application_scope','Application Scope','enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,210,v_su),
            (v_ev,'basis_amount_mode','basis_amount_mode','Basis Amount',   'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,220,v_su),
            (v_ev,'currency_code',   'currency_code',   'Currency',        'string',  'currency', 'one','standard',false,true,  true,  false,'{"max_length":3}'::jsonb,230,v_su),
            (v_ev,'min_pct',         'min_pct',         'Min %',           'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,240,v_su),
            (v_ev,'max_pct',         'max_pct',         'Max %',           'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,250,v_su),
            (v_ev,'min_amount',      'min_amount',      'Min Amount',      'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,260,v_su),
            (v_ev,'max_amount',      'max_amount',      'Max Amount',      'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,270,v_su),
            (v_ev,'cumulative_cap_pct','cumulative_cap_pct','Cumulative Cap %','decimal','number', 'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,280,v_su),
            (v_ev,'cumulative_cap_amount','cumulative_cap_amount','Cumulative Cap Amount','money','money','one','standard',false,false,true,false,'{"min":0}'::jsonb,290,v_su),
            (v_ev,'trigger_event',   'trigger_event',   'Trigger Event',   'string',  'text',     'one','standard',false,true,  true,  false,NULL::jsonb,300,v_su),
            (v_ev,'release_event',   'release_event',   'Release Event',   'string',  'text',     'one','standard',false,true,  true,  false,NULL::jsonb,310,v_su),
            (v_ev,'release_delay_days','release_delay_days','Release Delay Days','integer','number','one','standard',false,false,true,false,'{"min":0}'::jsonb,320,v_su),
            (v_ev,'recovery_start_after_pct','recovery_start_after_pct','Recovery Start After %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,330,v_su),
            (v_ev,'recovery_end_before_pct','recovery_end_before_pct','Recovery End Before %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,340,v_su),
            (v_ev,'recovery_method', 'recovery_method', 'Recovery Method', 'enum',    'select',   'one','standard',false,true,  true,  false,NULL::jsonb,350,v_su),
            (v_ev,'partial_release_pct','partial_release_pct','Partial Release %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,360,v_su),
            (v_ev,'partial_release_event','partial_release_event','Partial Release Event','string','text','one','standard',false,true,true,false,NULL::jsonb,370,v_su),
            (v_ev,'rounding_method', 'rounding_method', 'Rounding Method', 'enum',    'select',   'one','standard',false,true,  true,  false,NULL::jsonb,380,v_su),
            (v_ev,'rounding_scale',  'rounding_scale',  'Rounding Scale',  'integer', 'number',   'one','standard',false,false, true,  false,'{"min":0}'::jsonb,390,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_discount_tier ────────────────────────────────────────────
    -- RELATION class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_discount_tier' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'payment_term_id',      'payment_term_id',      'Payment Term',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,110,v_su),
            (v_ev,'tier_no',              'tier_no',              'Tier',          'integer', 'number',   'one','standard',true, true,  true,  false,'{"min":1}'::jsonb,120,v_su),
            (v_ev,'qualify_within_days',  'qualify_within_days',  'Qualify Days',  'integer', 'number',   'one','standard',true, true,  true,  false,'{"min":1}'::jsonb,130,v_su),
            (v_ev,'discount_pct',         'discount_pct',         'Discount %',    'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,140,v_su),
            (v_ev,'discount_basis_mode',  'discount_basis_mode',  'Basis Mode',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_best_only',         'is_best_only',         'Best Only',     'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/014_fields_payment_terms: done';

    -- ========================================================================
    -- Section: 015_fields_products
    -- ========================================================================

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name IN ('product', 'item')
      AND ef.name IN ('spend_category_id', 'item_category_id');

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name = 'company_code_spend_policy';

    -- product
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'product' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
        SELECT entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by,
               CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
        FROM (VALUES
            (v_ev,'commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,110,v_su),
            (v_ev,'product_type','product_type','Product Type','enum','select','one','standard',true,true,true,false,NULL::jsonb,130,v_su),
            (v_ev,'unit_of_measure','unit_of_measure','UOM','string','text','one','standard',false,true,false,false,NULL::jsonb,140,v_su),
            (v_ev,'base_price','base_price','Base Price','money','money','one','standard',false,true,true,false,NULL::jsonb,150,v_su),
            (v_ev,'currency_code','currency_code','Currency','string','text','one','standard',false,true,false,false,NULL::jsonb,160,v_su),
            (v_ev,'is_taxable','is_taxable','Taxable','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,170,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- item
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
        SELECT entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by,
               CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
        FROM (VALUES
            (v_ev,'code','code','Code','string','text','one','standard',true,true,true,true,NULL::jsonb,30,v_su),
            (v_ev,'name','name','Name','string','text','one','standard',true,true,true,true,NULL::jsonb,40,v_su),
            (v_ev,'description','description','Description','text','textarea','one','standard',false,false,false,true,NULL::jsonb,50,v_su),
            (v_ev,'company_code_id','company_code_id','Company Code','uuid','reference','one','standard',true,true,false,false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'product_id','product_id','Product','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"product"}'::jsonb,120,v_su),
            (v_ev,'commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,130,v_su),
            (v_ev,'valuation_method','valuation_method','Valuation Method','enum','select','one','standard',true,true,true,false,NULL::jsonb,150,v_su),
            (v_ev,'standard_cost','standard_cost','Standard Cost','money','money','one','standard',false,true,true,false,NULL::jsonb,160,v_su),
            (v_ev,'uom_code','uom_code','UOM','string','text','one','standard',true,true,false,false,NULL::jsonb,170,v_su),
            (v_ev,'has_lot_tracking','has_lot_tracking','Lot Tracking','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,180,v_su),
            (v_ev,'has_serial_tracking','has_serial_tracking','Serial Tracking','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,190,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- commodity_classification
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'commodity_classification' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
        SELECT entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, sort_order, created_by,
               CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
        FROM (VALUES
            (v_ev,'owner_type','owner_type','Owner Type','string','text','one','standard',true,true,true,false,110,v_su),
            (v_ev,'owner_id','owner_id','Owner','uuid','reference','one','standard',true,true,false,false,120,v_su),
            (v_ev,'classification_type','classification_type','Classification','enum','select','one','standard',true,true,true,false,130,v_su),
            (v_ev,'domain_code','domain_code','Domain','string','text','one','standard',true,true,true,false,140,v_su),
            (v_ev,'mapping_type','mapping_type','Mapping Type','enum','select','one','standard',true,true,true,false,150,v_su),
            (v_ev,'is_primary','is_primary','Primary','boolean','hidden','one','standard',false,true,false,false,160,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    UPDATE control.entity_field ef
       SET validation = ref_fix.val
      FROM (VALUES
        ('product', 'commodity_category_id', '{"ref_entity":"commodity_category"}'::jsonb),
        ('item',    'company_code_id',       '{"ref_entity":"company_code"}'::jsonb),
        ('item',    'product_id',            '{"ref_entity":"product"}'::jsonb),
        ('item',    'commodity_category_id', '{"ref_entity":"commodity_category"}'::jsonb)
      ) AS ref_fix(entity_name, field_name, val),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.name = ref_fix.entity_name
       AND (ef.validation IS NULL OR NOT (ef.validation ? 'ref_entity'));

    RAISE NOTICE '035_version_fields/015_fields_products: done';

    -- ========================================================================
    -- Section: 016_fields_ui
    -- ========================================================================


    -- ── principal_ui_profile ──────────────────────────────────────────────────
    -- CONTROL class: 1:1 with principal; no status/is_active columns
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',           'principal_id',           'Principal',         'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'locale_code',            'locale_code',            'Locale',            'string',  'text',     'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'language_code',          'language_code',          'Language',          'string',  'text',     'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',          'timezone_code',          'Timezone',          'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'appearance_mode',        'appearance_mode',        'Appearance',        'enum',    'select',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'density_code',           'density_code',           'Density',           'enum',    'select',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'home_workspace_code',    'home_workspace_code',    'Home Workspace',    'string',  'text',     'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company',   'uuid',    'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'default_dashboard_id',   'default_dashboard_id',   'Default Dashboard', 'uuid',    'reference','one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_ui_preference ───────────────────────────────────────────────
    -- CONTROL class: key-value extension table
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_preference' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',    'principal_id',    'Principal',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'preference_code', 'preference_code', 'Preference',      'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',    'surface_code',    'Surface',         'string', 'text',     'one','standard',false,true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── saved_view ────────────────────────────────────────────────────────────
    -- CONTROL class: code/name not bulk-inserted — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'saved_view' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'code',               'code',               'Code',           'string',  'text',     'one','standard',true, true,  true,  false,100,v_su),
            (v_ev,'name',               'name',               'Name',           'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'owner_principal_id', 'owner_principal_id', 'Owner',          'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',              'scope',              'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',       'surface_code',       'Surface',        'string',  'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'entity_key',         'entity_key',         'Entity Key',     'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_pinned',          'is_pinned',          'Pinned',         'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_default',         'is_default',         'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'version',            'version',            'Version',        'integer', 'number',   'one','system',  false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard ─────────────────────────────────────────────────────────────
    -- MASTER class: code/name/description/status/is_active from 000_common_fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_principal_id','owner_principal_id','Owner',         'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',            'scope',            'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',     'surface_code',     'Surface',        'string',  'text',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_home',          'is_home',          'Home Dashboard', 'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard_widget ──────────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard_widget' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'dashboard_id',    'dashboard_id',    'Dashboard',      'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'widget_code',     'widget_code',     'Widget Code',    'string',  'text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'widget_type_code','widget_type_code','Widget Type',    'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'title',           'title',           'Title',          'string',  'text',     'one','standard',false,false, false, true, 140,v_su),
            (v_ev,'x_pos',           'x_pos',           'X Position',     'integer', 'number',   'one','standard',true, false, true,  false,150,v_su),
            (v_ev,'y_pos',           'y_pos',           'Y Position',     'integer', 'number',   'one','standard',true, false, true,  false,160,v_su),
            (v_ev,'width_units',     'width_units',     'Width',          'integer', 'number',   'one','standard',true, false, true,  false,170,v_su),
            (v_ev,'height_units',    'height_units',    'Height',         'integer', 'number',   'one','standard',true, false, true,  false,180,v_su),
            (v_ev,'is_visible',      'is_visible',      'Visible',        'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_notification_preference ─────────────────────────────────────
    -- CONTROL class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_notification_preference' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'event_code',    'event_code',    'Event',         'string',  'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',       'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_enabled',    'is_enabled',    'Enabled',       'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'frequency_code','frequency_code','Frequency',     'enum',    'select',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item ──────────────────────────────────────────────────────────
    -- MASTER class: uses 'title' (not 'name') and 'summary' (not 'description')
    -- NOTE: bulk pass inserts 'name'/'description'/'is_active' for MASTER —
    -- content_item uses 'title'/'summary' and has no is_active column (harmless metadata rows)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'title',              'title',              'Title',          'string', 'text',     'one','standard',true, false, true,  true, 110,v_su),
            (v_ev,'kind',               'kind',               'Kind',           'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',         'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'locale_code',        'locale_code',        'Locale',         'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'slug',               'slug',               'Slug',           'string', 'text',     'one','standard',true, false, true,  true, 150,v_su),
            (v_ev,'summary',            'summary',            'Summary',        'text',   'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version','uuid',   'reference','one','system',  false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_link' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'source_content_item_id','source_content_item_id','Source',        'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'target_content_item_id','target_content_item_id','Target',        'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'relation_type',         'relation_type',         'Relation Type', 'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'display_order',         'display_order',         'Order',         'integer', 'number',   'one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_access_grant ─────────────────────────────────────────────
    -- CONTROL class: no updated_at/updated_by columns in DDL (harmless if bulk inserts them)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_access_grant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'content_item_id','content_item_id','Content Item',   'uuid',      'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'subject_type',   'subject_type',   'Subject Type',   'enum',      'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subject_id',     'subject_id',     'Subject',        'uuid',      'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level',   'access_level',   'Access Level',   'enum',      'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',     'expires_at',     'Expires At',     'timestamp', 'datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/016_fields_ui: done';

    -- ========================================================================
    -- Section: 017_fields_master_schema_coverage
    -- ========================================================================

    v_total := 0; v_version_rows := 0; v_rows := 0; v_deleted := 0; v_display_updates := 0;

    -- entity_version insert moved to 020_entities/001_entity_registry.sql

    GET DIAGNOSTICS v_version_rows = ROW_COUNT;

    FOR r IN
        SELECT
            e.id AS entity_id,
            e.entity_code,
            e.table_schema,
            e.table_name,
            e.backing_type,
            COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) AS entity_readonly,
            ev.id AS entity_version_id
        FROM control.entity e
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.version_no = 1
        WHERE e.table_schema = 'master'
          AND e.ownership_model = 'system'
          AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
        ORDER BY e.table_name
    LOOP
        FOR c IN
            SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = r.table_schema
              AND table_name = r.table_name
            ORDER BY ordinal_position
        LOOP
            v_data_type := CASE
                WHEN c.udt_name = 'uuid' THEN 'uuid'
                WHEN c.data_type IN ('integer', 'smallint') THEN 'integer'
                WHEN c.data_type = 'bigint' THEN 'bigint'
                WHEN c.data_type IN ('numeric', 'decimal') THEN 'decimal'
                WHEN c.data_type = 'money' THEN 'money'
                WHEN c.data_type = 'boolean' THEN 'boolean'
                WHEN c.data_type = 'date' THEN 'date'
                WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
                WHEN c.data_type = 'timestamp without time zone' THEN 'datetime'
                WHEN c.data_type = 'jsonb' THEN 'jsonb'
                WHEN c.data_type = 'json' THEN 'json'
                WHEN c.data_type = 'tsvector' THEN 'tsvector'
                WHEN c.data_type = 'ARRAY' AND c.udt_name = '_uuid' THEN 'uuid_array'
                WHEN c.data_type = 'ARRAY' AND c.udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
                WHEN c.data_type = 'ARRAY' AND c.udt_name = '_jsonb' THEN 'jsonb_array'
                WHEN c.data_type = 'ARRAY' THEN 'text_array'
                WHEN c.data_type = 'text' THEN 'text'
                ELSE 'string'
            END;

            v_ui_type := CASE
                WHEN c.column_name IN ('id', 'tenant_id')
                  OR c.column_name IN ('created_by', 'updated_by', 'status_changed_by', 'deleted_by')
                  OR v_data_type = 'tsvector'
                    THEN 'hidden'
                WHEN v_data_type = 'uuid' AND c.column_name LIKE '%\_id' ESCAPE '\'
                    THEN 'reference'
                WHEN v_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money')
                    THEN 'number'
                WHEN v_data_type = 'boolean' THEN 'checkbox'
                WHEN v_data_type = 'date' THEN 'date'
                WHEN v_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN v_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array')
                    THEN 'json'
                ELSE 'text'
            END;

            v_field_name := CASE
                WHEN v_data_type = 'boolean'
                 AND c.column_name !~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN 'is_' || c.column_name
                ELSE c.column_name
            END;

            IF v_field_name LIKE '%\_id' ESCAPE '\'
               AND v_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]') THEN
                v_field_name := regexp_replace(v_field_name, '_id$', '_identifier');
            END IF;

            v_origin := CASE
                WHEN c.column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ) THEN 'system'
                ELSE 'standard'
            END;

            v_ref_entity := NULL;
            v_ref_entity_id := NULL;

            IF v_data_type = 'uuid' AND (
                c.column_name LIKE '%\_id' ESCAPE '\'
                OR c.column_name IN (
                    'created_by', 'updated_by', 'status_changed_by', 'deleted_by',
                    'approved_by', 'rejected_by', 'verified_by', 'reviewed_by'
                )
            ) THEN
                v_ref_entity := CASE
                    WHEN c.column_name = 'tenant_id' THEN 'tenant'
                    WHEN c.column_name IN (
                        'created_by', 'updated_by', 'status_changed_by', 'deleted_by',
                        'principal_id', 'user_id', 'owner_user_id', 'reviewer_user_id',
                        'actor_principal_id', 'approved_by', 'rejected_by',
                        'verified_by', 'reviewed_by'
                    ) THEN 'principal'
                    WHEN c.column_name = 'assessment_id' THEN 'party_risk_assessment'
                    WHEN c.column_name IN ('risk_dimension_id', 'dimension_id') THEN 'risk_dimension'
                    WHEN c.column_name IN ('risk_driver_id', 'driver_id') THEN 'risk_driver_registry'
                    WHEN c.column_name IN ('risk_model_id', 'model_id') THEN 'risk_model'
                    WHEN c.column_name IN ('risk_source_id', 'source_id') AND r.entity_code LIKE '%risk%' THEN 'risk_source'
                    WHEN c.column_name IN ('network_provider_id', 'provider_id') AND r.entity_code LIKE '%network%' THEN 'network_provider'
                    WHEN c.column_name IN ('tenant_parameter_definition_id', 'parameter_definition_id') THEN 'tenant_parameter_definition'
                    WHEN c.column_name ~ '(^|_)business_partner_id$' THEN 'business_partner'
                    WHEN c.column_name ~ '(^|_)legal_entity_id$' THEN 'legal_entity'
                    WHEN c.column_name ~ '(^|_)company_code_id$' THEN 'company_code'
                    WHEN c.column_name ~ '(^|_)bank_account_id$' THEN 'bank_account'
                    WHEN c.column_name ~ '(^|_)contact_id$' THEN 'contact'
                    WHEN c.column_name ~ '(^|_)address_id$' THEN 'address'
                    WHEN c.column_name ~ '(^|_)employee_id$' THEN 'employee'
                    WHEN c.column_name ~ '(^|_)supplier_id$' THEN 'supplier'
                    WHEN c.column_name ~ '(^|_)commodity_id$' THEN 'commodity'
                    WHEN c.column_name ~ '(^|_)attachment_id$' THEN 'attachment'
                    WHEN c.column_name ~ '(^|_)folder_id$' THEN 'attachment_folder'
                    WHEN c.column_name = 'parent_id' THEN r.entity_code
                    ELSE regexp_replace(
                        regexp_replace(c.column_name, '_id$', ''),
                        '^(source|target|parent|child|owner|counterparty|remote|member|default|preferred|primary|buyer|seller|from|to)_',
                        ''
                    )
                END;

                SELECT e.id
                  INTO v_ref_entity_id
                FROM control.entity e
                WHERE e.tenant_id IS NULL
                  AND e.entity_code = v_ref_entity
                LIMIT 1;

                IF v_ref_entity_id IS NULL THEN
                    v_ref_entity := NULL;
                END IF;
            END IF;

            INSERT INTO control.entity_field (
                entity_version_id,
                name,
                column_name,
                label,
                data_type,
                ui_type,
                cardinality,
                origin,
                is_required,
                is_filterable,
                is_sortable,
                is_searchable,
                is_read_only,
                is_computed,
                reference_config,
                fk_target_entity_id,
                fk_target_field,
                validation,
                sort_order,
                created_by,
                updated_by
            )
            VALUES (
                r.entity_version_id,
                v_field_name,
                c.column_name,
                initcap(replace(c.column_name, '_', ' ')),
                v_data_type,
                v_ui_type,
                CASE
                    WHEN v_data_type IN ('text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'many'
                    WHEN c.is_nullable = 'NO' THEN 'one'
                    ELSE 'zero_or_one'
                END,
                v_origin,
                c.is_nullable = 'NO'
                    AND r.backing_type <> 'view'
                    AND c.column_name NOT IN (
                        'id', 'tenant_id', 'created_at', 'created_by',
                        'updated_at', 'updated_by', 'status_changed_at',
                        'status_changed_by', 'deleted_at', 'deleted_by',
                        'row_version', 'xmin'
                    ),
                c.column_name = ANY(ARRAY[
                    'tenant_id', 'code', 'name', 'status', 'is_active',
                    'entity_code', 'entity_type', 'record_id', 'party_id',
                    'business_partner_id', 'legal_entity_id', 'company_code_id',
                    'network_provider_id', 'risk_model_id', 'risk_dimension_id',
                    'risk_source_id', 'risk_driver_id', 'assessment_id',
                    'principal_id', 'created_at', 'updated_at'
                ])
                OR c.column_name LIKE '%\_id' ESCAPE '\'
                OR c.column_name LIKE '%\_code' ESCAPE '\'
                OR c.column_name LIKE '%\_type' ESCAPE '\'
                OR c.column_name LIKE '%\_status' ESCAPE '\',
                c.column_name = ANY(ARRAY[
                    'code', 'name', 'status', 'is_active', 'created_at',
                    'updated_at', 'effective_from', 'effective_to',
                    'effective_until', 'valid_from', 'valid_to',
                    'reviewed_at', 'assessed_at', 'last_used_at',
                    'display_order', 'sort_order'
                ]),
                c.column_name = ANY(ARRAY[
                    'code', 'name', 'title', 'display_name', 'full_name',
                    'description', 'email', 'primary_email', 'device_name',
                    'entity_code', 'record_label', 'external_ref',
                    'external_reference'
                ])
                OR c.column_name LIKE '%\_name' ESCAPE '\'
                OR c.column_name LIKE '%\_number' ESCAPE '\',
                r.entity_readonly
                OR r.backing_type = 'view'
                OR c.column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ),
                false,
                CASE
                    WHEN v_ref_entity IS NOT NULL THEN jsonb_build_object(
                        'target_entity', v_ref_entity,
                        'target_field', 'id',
                        'display_field', 'name'
                    )
                    ELSE NULL::jsonb
                END,
                v_ref_entity_id,
                CASE WHEN v_ref_entity_id IS NOT NULL THEN 'id' ELSE NULL END,
                CASE
                    WHEN v_ref_entity IS NOT NULL THEN jsonb_build_object('ref_entity', v_ref_entity)
                    WHEN v_data_type = 'uuid' AND c.column_name LIKE '%\_id' ESCAPE '\' THEN
                        jsonb_build_object('ref_hint', regexp_replace(c.column_name, '_id$', ''))
                    ELSE NULL::jsonb
                END,
                c.ordinal_position * 10,
                v_su_admin,
                v_su_admin
            )
            ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
            DO UPDATE
            SET
                column_name = EXCLUDED.column_name,
                label = COALESCE(control.entity_field.label, EXCLUDED.label),
                data_type = EXCLUDED.data_type,
                ui_type = EXCLUDED.ui_type,
                cardinality = EXCLUDED.cardinality,
                origin = EXCLUDED.origin,
                is_required = EXCLUDED.is_required,
                is_filterable = control.entity_field.is_filterable OR EXCLUDED.is_filterable,
                is_sortable = control.entity_field.is_sortable OR EXCLUDED.is_sortable,
                is_searchable = control.entity_field.is_searchable OR EXCLUDED.is_searchable,
                is_read_only = CASE
                    WHEN control.entity_field.is_write_once THEN control.entity_field.is_read_only
                    ELSE control.entity_field.is_read_only OR EXCLUDED.is_read_only
                END,
                is_computed = CASE
                    WHEN control.entity_field.is_write_once THEN control.entity_field.is_computed
                    ELSE control.entity_field.is_computed OR EXCLUDED.is_computed
                END,
                reference_config = COALESCE(control.entity_field.reference_config, EXCLUDED.reference_config),
                fk_target_entity_id = COALESCE(control.entity_field.fk_target_entity_id, EXCLUDED.fk_target_entity_id),
                fk_target_field = COALESCE(control.entity_field.fk_target_field, EXCLUDED.fk_target_field),
                validation = COALESCE(control.entity_field.validation, EXCLUDED.validation),
                sort_order = EXCLUDED.sort_order,
                updated_at = now(),
                updated_by = v_su_admin;

            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_total := v_total + v_rows;
        END LOOP;
    END LOOP;

    -- Remove common-field rows that were stamped onto coverage entities but do
    -- not map to a physical column on the backing table/view.
    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.table_schema = 'master'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
      AND ef.column_name <> ''
      AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = ef.column_name
      );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    UPDATE control.entity e
    SET
        display_config = COALESCE(e.display_config, '{}'::jsonb)
            || jsonb_build_object(
                'code_field', COALESCE(cfg.natural_field, cfg.code_field, cfg.title_field, 'id'),
                'title_field', COALESCE(cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_field', COALESCE(cfg.sort_field, cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_order', 'asc',
                'list_columns', to_jsonb(cfg.list_columns)
            ),
        identity_config = CASE
            WHEN cfg.natural_field IS NOT NULL
            THEN jsonb_set(COALESCE(e.identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY[cfg.natural_field]::text[]), true)
            ELSE e.identity_config
        END,
        updated_at = now(),
        updated_by = v_su_admin
    FROM control.entity_version ev
    JOIN control.entity e_cfg
      ON e_cfg.id = ev.entity_id
    CROSS JOIN LATERAL (
        SELECT
            (
                SELECT ef.name
                FROM jsonb_array_elements_text(
                    CASE
                        WHEN jsonb_typeof(COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
                        THEN COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields'
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY nk(field_name, ord)
                JOIN control.entity_field ef
                  ON ef.entity_version_id = ev.id
                 AND (ef.name = nk.field_name OR ef.column_name = nk.field_name)
                WHERE ef.is_active
                ORDER BY nk.ord
                LIMIT 1
            ) AS natural_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'code', 'series_code', 'parameter_code', 'entity_code',
                      'name', 'display_name', 'record_id', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'code' THEN 1
                    WHEN 'series_code' THEN 2
                    WHEN 'parameter_code' THEN 3
                    WHEN 'entity_code' THEN 4
                    WHEN 'name' THEN 5
                    WHEN 'display_name' THEN 6
                    WHEN 'record_id' THEN 7
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS code_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'display_name', 'name', 'title', 'full_name',
                      'code', 'series_code', 'parameter_code',
                      'email', 'primary_email', 'description', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'display_name' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'title' THEN 3
                    WHEN 'full_name' THEN 4
                    WHEN 'code' THEN 5
                    WHEN 'series_code' THEN 6
                    WHEN 'parameter_code' THEN 7
                    WHEN 'email' THEN 8
                    WHEN 'primary_email' THEN 9
                    WHEN 'description' THEN 20
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS title_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'updated_at', 'created_at', 'effective_from',
                      'valid_from', 'reviewed_at', 'assessed_at',
                      'display_order', 'sort_order', 'code', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'updated_at' THEN 1
                    WHEN 'created_at' THEN 2
                    WHEN 'effective_from' THEN 3
                    WHEN 'valid_from' THEN 4
                    WHEN 'reviewed_at' THEN 5
                    WHEN 'assessed_at' THEN 6
                    WHEN 'display_order' THEN 7
                    WHEN 'sort_order' THEN 8
                    WHEN 'code' THEN 20
                    WHEN 'name' THEN 21
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS sort_field,
            ARRAY(
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND COALESCE(ef.ui_type, '') <> 'hidden'
                ORDER BY CASE
                    WHEN ef.name = ANY(ARRAY['code', 'series_code', 'parameter_code']) THEN 1
                    WHEN ef.name = ANY(ARRAY['name', 'display_name', 'title', 'full_name']) THEN 2
                    WHEN ef.name LIKE '%\_id' ESCAPE '\' THEN 3
                    WHEN ef.name = ANY(ARRAY['status', 'is_active']) THEN 4
                    WHEN ef.name = ANY(ARRAY['created_at', 'updated_at']) THEN 9
                    ELSE 5
                END,
                ef.sort_order,
                ef.name
                LIMIT 8
            ) AS list_columns
    ) cfg
    WHERE ev.entity_id = e.id
      AND e_cfg.id = e.id
      AND ev.version_no = 1
      AND e.table_schema = 'master'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage';

    GET DIAGNOSTICS v_display_updates = ROW_COUNT;

    RAISE NOTICE
        'Master schema coverage versions upserted %, fields upserted %, removed %, refreshed display config %',
        v_version_rows, v_total, v_deleted, v_display_updates;

    -- ========================================================================
    -- Section: 018_fields_governed_schema_coverage
    -- ========================================================================

    v_version_rows := 0; v_field_rows := 0; v_deleted_rows := 0; v_display_rows := 0;

    -- entity_version insert moved to 020_entities/001_entity_registry.sql

    GET DIAGNOSTICS v_version_rows = ROW_COUNT;

    WITH coverage_entities AS (
        SELECT
            e.id AS entity_id,
            e.entity_code,
            e.table_schema,
            e.table_name,
            e.backing_type,
            ev.id AS entity_version_id
        FROM control.entity e
        JOIN control.entity_version ev
          ON ev.entity_id = e.id
         AND ev.version_no = 1
        WHERE e.ownership_model = 'system'
          AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
    ),
    cols AS (
        SELECT
            ce.*,
            ic.column_name,
            ic.data_type AS pg_data_type,
            ic.udt_name,
            ic.is_nullable,
            ic.ordinal_position,
            (
                ic.column_name ~* '(password|passwd|secret|token|credential|hash|salt|private_key|api_key|access_key|refresh_key|fingerprint)'
            ) AS is_sensitive
        FROM coverage_entities ce
        JOIN information_schema.columns ic
          ON ic.table_schema = ce.table_schema
         AND ic.table_name = ce.table_name
    ),
    typed AS (
        SELECT
            cols.*,
            CASE
                WHEN udt_name = 'uuid' THEN 'uuid'
                WHEN pg_data_type IN ('integer', 'smallint') THEN 'integer'
                WHEN pg_data_type = 'bigint' THEN 'bigint'
                WHEN pg_data_type IN ('numeric', 'decimal') THEN 'decimal'
                WHEN pg_data_type = 'money' THEN 'money'
                WHEN pg_data_type = 'boolean' THEN 'boolean'
                WHEN pg_data_type = 'date' THEN 'date'
                WHEN pg_data_type = 'timestamp with time zone' THEN 'timestamptz'
                WHEN pg_data_type = 'timestamp without time zone' THEN 'datetime'
                WHEN pg_data_type = 'jsonb' THEN 'jsonb'
                WHEN pg_data_type = 'json' THEN 'json'
                WHEN pg_data_type = 'tsvector' THEN 'tsvector'
                WHEN pg_data_type = 'ARRAY' AND udt_name = '_uuid' THEN 'uuid_array'
                WHEN pg_data_type = 'ARRAY' AND udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
                WHEN pg_data_type = 'ARRAY' AND udt_name = '_jsonb' THEN 'jsonb_array'
                WHEN pg_data_type = 'ARRAY' THEN 'text_array'
                WHEN pg_data_type = 'text' THEN 'text'
                ELSE 'string'
            END AS field_data_type
        FROM cols
    ),
    named AS (
        SELECT
            typed.*,
            CASE
                WHEN field_data_type = 'boolean'
                 AND column_name !~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN 'is_' || column_name
                ELSE column_name
            END AS boolean_safe_name
        FROM typed
    ),
    id_safe AS (
        SELECT
            named.*,
            CASE
                WHEN boolean_safe_name LIKE '%\_id' ESCAPE '\'
                 AND field_data_type NOT IN ('uuid', 'reference', 'uuid_array', 'uuid[]')
                    THEN regexp_replace(boolean_safe_name, '_id$', '_identifier')
                ELSE boolean_safe_name
            END AS generated_name
        FROM named
    ),
    collision_safe AS (
        SELECT
            id_safe.*,
            CASE
                WHEN count(*) OVER (PARTITION BY entity_version_id, generated_name) = 1
                    THEN generated_name
                WHEN field_data_type = 'boolean'
                 AND column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
                    THEN generated_name || '_' || ordinal_position::text
                WHEN field_data_type = 'boolean'
                    THEN 'is_' || regexp_replace(column_name, '_id$', '_identifier') || '_flag'
                ELSE regexp_replace(column_name, '_id$', '_identifier') || '_field'
            END AS collision_safe_name
        FROM id_safe
    ),
    final_fields AS (
        SELECT
            collision_safe.*,
            CASE
                WHEN count(*) OVER (PARTITION BY entity_version_id, collision_safe_name) = 1
                    THEN collision_safe_name
                ELSE collision_safe_name || '_' || ordinal_position::text
            END AS field_name,
            CASE
                WHEN is_sensitive
                  OR column_name IN (
                    'id', 'tenant_id', 'created_by', 'updated_by',
                    'status_changed_by', 'deleted_by', 'row_version', 'xmin'
                  )
                  OR field_data_type = 'tsvector'
                    THEN 'hidden'
                WHEN field_data_type = 'uuid' AND column_name LIKE '%\_id' ESCAPE '\'
                    THEN 'reference'
                WHEN field_data_type IN ('integer', 'bigint', 'decimal', 'numeric', 'money')
                    THEN 'number'
                WHEN field_data_type = 'boolean' THEN 'checkbox'
                WHEN field_data_type = 'date' THEN 'date'
                WHEN field_data_type IN ('datetime', 'timestamptz') THEN 'datetime'
                WHEN field_data_type IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array')
                    THEN 'json'
                WHEN field_data_type = 'text' THEN 'textarea'
                ELSE 'text'
            END AS field_ui_type,
            CASE
                WHEN column_name IN (
                    'id', 'tenant_id', 'is_active', 'created_at', 'created_by',
                    'updated_at', 'updated_by', 'status_changed_at',
                    'status_changed_by', 'deleted_at', 'deleted_by',
                    'row_version', 'xmin'
                ) THEN 'system'
                ELSE 'standard'
            END AS field_origin
        FROM collision_safe
    )
    INSERT INTO control.entity_field (
        entity_version_id,
        name,
        column_name,
        label,
        data_type,
        ui_type,
        cardinality,
        origin,
        is_required,
        is_filterable,
        is_sortable,
        is_searchable,
        is_read_only,
        is_computed,
        validation,
        visibility,
        editability,
        sort_order,
        created_by,
        updated_by
    )
    SELECT
        entity_version_id,
        field_name,
        column_name,
        initcap(replace(column_name, '_', ' ')),
        field_data_type,
        field_ui_type,
        CASE
            WHEN field_data_type IN ('text_array', 'uuid_array', 'int_array', 'jsonb_array') THEN 'many'
            WHEN is_nullable = 'NO' THEN 'one'
            ELSE 'zero_or_one'
        END,
        field_origin,
        is_nullable = 'NO'
            AND backing_type <> 'view'
            AND column_name NOT IN (
                'id', 'tenant_id', 'created_at', 'created_by',
                'updated_at', 'updated_by', 'status_changed_at',
                'status_changed_by', 'deleted_at', 'deleted_by',
                'row_version', 'xmin'
            ),
        NOT is_sensitive
            AND (
                column_name = ANY(ARRAY[
                    'tenant_id', 'code', 'name', 'status', 'is_active',
                    'entity_code', 'entity_type', 'record_id', 'created_at',
                    'updated_at'
                ])
                OR column_name LIKE '%\_id' ESCAPE '\'
                OR column_name LIKE '%\_code' ESCAPE '\'
                OR column_name LIKE '%\_type' ESCAPE '\'
                OR column_name LIKE '%\_status' ESCAPE '\'
            ),
        NOT is_sensitive
            AND field_data_type NOT IN ('json', 'jsonb', 'text_array', 'uuid_array', 'int_array', 'jsonb_array', 'tsvector')
            AND (
                column_name = ANY(ARRAY[
                    'code', 'name', 'status', 'is_active', 'created_at',
                    'updated_at', 'effective_from', 'effective_to',
                    'valid_from', 'valid_to', 'sort_order', 'display_order'
                ])
                OR column_name LIKE '%\_at' ESCAPE '\'
                OR column_name LIKE '%\_date' ESCAPE '\'
            ),
        NOT is_sensitive
            AND field_data_type IN ('string', 'text')
            AND (
                column_name = ANY(ARRAY[
                    'code', 'name', 'title', 'display_name', 'full_name',
                    'description', 'email', 'primary_email', 'entity_code',
                    'record_label', 'external_ref', 'external_reference'
                ])
                OR column_name LIKE '%\_name' ESCAPE '\'
                OR column_name LIKE '%\_number' ESCAPE '\'
            ),
        true,
        false,
        CASE
            WHEN field_data_type = 'uuid' AND column_name LIKE '%\_id' ESCAPE '\'
                THEN jsonb_build_object('ref_hint', regexp_replace(column_name, '_id$', ''))
            ELSE NULL::jsonb
        END,
        CASE
            WHEN is_sensitive OR field_ui_type = 'hidden'
                THEN jsonb_build_object('hidden', true, 'reason', 'governed_metadata_coverage')
            ELSE jsonb_build_object('hidden', false)
        END,
        jsonb_build_object('mode', 'readOnly', 'reason', 'governed_metadata_coverage'),
        least(ordinal_position * 10, 32000)::smallint,
        v_su,
        v_su
    FROM final_fields
    ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL
    DO UPDATE
    SET
        column_name = EXCLUDED.column_name,
        label = COALESCE(control.entity_field.label, EXCLUDED.label),
        data_type = EXCLUDED.data_type,
        ui_type = EXCLUDED.ui_type,
        cardinality = EXCLUDED.cardinality,
        origin = EXCLUDED.origin,
        is_required = EXCLUDED.is_required,
        is_filterable = EXCLUDED.is_filterable,
        is_sortable = EXCLUDED.is_sortable,
        is_searchable = EXCLUDED.is_searchable,
        is_read_only = true,
        is_write_once = false,
        is_computed = false,
        validation = COALESCE(control.entity_field.validation, EXCLUDED.validation),
        visibility = COALESCE(control.entity_field.visibility, EXCLUDED.visibility),
        editability = COALESCE(control.entity_field.editability, EXCLUDED.editability),
        sort_order = EXCLUDED.sort_order,
        updated_at = now(),
        updated_by = v_su;

    GET DIAGNOSTICS v_field_rows = ROW_COUNT;

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
      AND ef.column_name <> ''
      AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = ef.column_name
      );

    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

    UPDATE control.entity e
    SET
        display_config = COALESCE(e.display_config, '{}'::jsonb)
            || jsonb_build_object(
                'code_field', COALESCE(cfg.code_field, cfg.title_field, cfg.natural_field, 'id'),
                'title_field', COALESCE(cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_field', COALESCE(cfg.sort_field, cfg.title_field, cfg.code_field, cfg.natural_field, 'id'),
                'default_sort_order', 'asc',
                'list_columns', to_jsonb(cfg.list_columns),
                'readOnly', true,
                'hidden', true
            ),
        identity_config = CASE
            WHEN cfg.natural_field IS NOT NULL
            THEN jsonb_set(COALESCE(e.identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY[cfg.natural_field]::text[]), true)
            ELSE e.identity_config
        END,
        updated_at = now(),
        updated_by = v_su
    FROM control.entity_version ev
    JOIN control.entity e_cfg
      ON e_cfg.id = ev.entity_id
    CROSS JOIN LATERAL (
        SELECT
            (
                SELECT ef.name
                FROM jsonb_array_elements_text(
                    CASE
                        WHEN jsonb_typeof(COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
                        THEN COALESCE(e_cfg.identity_config, '{}'::jsonb)->'natural_key_fields'
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY nk(field_name, ord)
                JOIN control.entity_field ef
                  ON ef.entity_version_id = ev.id
                 AND (ef.name = nk.field_name OR ef.column_name = nk.field_name)
                WHERE ef.is_active
                ORDER BY nk.ord
                LIMIT 1
            ) AS natural_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'code', 'entity_code', 'permission_code',
                      'document_no', 'number', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'code' THEN 1
                    WHEN 'entity_code' THEN 2
                    WHEN 'permission_code' THEN 3
                    WHEN 'document_no' THEN 4
                    WHEN 'number' THEN 5
                    WHEN 'name' THEN 6
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS code_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'display_name', 'name', 'title', 'full_name',
                      'code', 'entity_code', 'document_no',
                      'number', 'description', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'display_name' THEN 1
                    WHEN 'name' THEN 2
                    WHEN 'title' THEN 3
                    WHEN 'full_name' THEN 4
                    WHEN 'code' THEN 5
                    WHEN 'entity_code' THEN 6
                    WHEN 'document_no' THEN 7
                    WHEN 'number' THEN 8
                    WHEN 'description' THEN 20
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS title_field,
            (
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND ef.name = ANY(ARRAY[
                      'updated_at', 'created_at', 'effective_from',
                      'valid_from', 'document_date', 'posting_date',
                      'sort_order', 'display_order', 'code', 'name', 'id'
                  ])
                ORDER BY CASE ef.name
                    WHEN 'updated_at' THEN 1
                    WHEN 'created_at' THEN 2
                    WHEN 'effective_from' THEN 3
                    WHEN 'valid_from' THEN 4
                    WHEN 'document_date' THEN 5
                    WHEN 'posting_date' THEN 6
                    WHEN 'sort_order' THEN 10
                    WHEN 'display_order' THEN 11
                    WHEN 'code' THEN 20
                    WHEN 'name' THEN 21
                    WHEN 'id' THEN 99
                    ELSE 50
                END
                LIMIT 1
            ) AS sort_field,
            ARRAY(
                SELECT ef.name
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.is_active
                  AND COALESCE(ef.ui_type, '') <> 'hidden'
                ORDER BY CASE
                    WHEN ef.name = ANY(ARRAY['code', 'entity_code', 'permission_code', 'document_no']) THEN 1
                    WHEN ef.name = ANY(ARRAY['name', 'display_name', 'title', 'full_name']) THEN 2
                    WHEN ef.name LIKE '%\_id' ESCAPE '\' THEN 3
                    WHEN ef.name = ANY(ARRAY['status', 'is_active']) THEN 4
                    WHEN ef.name = ANY(ARRAY['created_at', 'updated_at']) THEN 9
                    ELSE 5
                END,
                ef.sort_order,
                ef.name
                LIMIT 8
            ) AS list_columns
    ) cfg
    WHERE ev.entity_id = e.id
      AND e_cfg.id = e.id
      AND ev.version_no = 1
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage';

    GET DIAGNOSTICS v_display_rows = ROW_COUNT;

    RAISE NOTICE
        'Governed schema coverage versions upserted %, fields upserted %, removed %, refreshed display config %',
        v_version_rows, v_field_rows, v_deleted_rows, v_display_rows;

    -- ========================================================================
    -- Section: 019_fields_meta_entity_enum_overrides
    -- ========================================================================

    v_patched_entity := 0; v_patched_ef := 0; v_patched_er := 0;


    -- ── Resolve entity_version IDs for the meta-entity registrations ──────────
    SELECT ev.id INTO v_ev_entity
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity'
    LIMIT 1;

    SELECT ev.id INTO v_ev_ef
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity_field'
    LIMIT 1;

    SELECT ev.id INTO v_ev_er
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.table_schema = 'control' AND e.table_name = 'entity_relation'
    LIMIT 1;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity → meta-entity property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_entity IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            -- Entity classification
            ('entity_class',     'enum', 'select', 'entity.entity_class'),
            ('ownership_model',  'enum', 'select', 'entity.ownership_model'),
            ('backing_type',     'enum', 'select', 'entity.backing_type'),
            ('governance_level', 'enum', 'select', 'entity.governance_level'),
            ('security_tier',    'enum', 'select', 'entity.security_tier'),
            ('mutability',       'enum', 'select', 'entity.mutability'),
            ('kind',             'enum', 'select', 'entity.kind'),
            -- Status / lifecycle
            ('status',           'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_entity
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_entity = ROW_COUNT;
        RAISE NOTICE 'control_entity field overrides applied: %', v_patched_entity;

    ELSE
        RAISE NOTICE 'control_entity entity_version not found — skipping entity patches';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity_field → meta-entity-field property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_ef IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            -- Core field metadata enums
            ('data_type',    'enum', 'select', 'entity_field.data_type'),
            ('cardinality',  'enum', 'select', 'entity_field.cardinality'),
            ('origin',       'enum', 'select', 'entity_field.origin'),
            ('ui_type',      'enum', 'select', 'entity_field.ui_type'),
            ('compute_mode', 'enum', 'select', 'entity_field.compute_mode'),
            -- Lookup-domain chooser (text FK → control.lookup_domain.code)
            ('enum_domain_code', 'string', 'lookup_chooser', NULL),
            -- Boolean flags
            ('is_required',      'boolean', 'checkbox', NULL),
            ('is_unique',        'boolean', 'checkbox', NULL),
            ('is_searchable',    'boolean', 'checkbox', NULL),
            ('is_filterable',    'boolean', 'checkbox', NULL),
            ('is_sortable',      'boolean', 'checkbox', NULL),
            ('is_groupable',     'boolean', 'checkbox', NULL),
            ('is_aggregatable',  'boolean', 'checkbox', NULL),
            ('is_read_only',     'boolean', 'checkbox', NULL),
            ('is_write_once',    'boolean', 'checkbox', NULL),
            ('is_deprecated',    'boolean', 'checkbox', NULL),
            ('is_computed',      'boolean', 'checkbox', NULL),
            ('is_active',        'boolean', 'checkbox', NULL),
            -- Status
            ('status',       'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_ef
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ef = ROW_COUNT;
        RAISE NOTICE 'control_entity_field field overrides applied: %', v_patched_ef;

    ELSE
        RAISE NOTICE 'control_entity_field entity_version not found — skipping entity_field patches';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- control.entity_relation → meta-relation property overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_er IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            enum_config      = NULL,
            updated_at       = now(),
            updated_by       = v_su
        FROM (VALUES
            ('kind',   'enum', 'select', 'entity_relation.kind'),
            ('status', 'string', 'status', NULL)
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_er
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_er = ROW_COUNT;
        RAISE NOTICE 'control_entity_relation field overrides applied: %', v_patched_er;

    ELSE
        RAISE NOTICE 'control_entity_relation entity_version not found — skipping entity_relation patches';
    END IF;

    RAISE NOTICE 'Meta entity enum overrides complete (entity=%, entity_field=%, entity_relation=%)',
        v_patched_entity, v_patched_ef, v_patched_er;


    -- ========================================================================
    -- Section: 020_fields_classification_enum_patches
    -- ========================================================================

    v_patched_cir := 0; v_patched_ccr := 0;


    -- ── Resolve entity_version IDs ────────────────────────────────────────────
    SELECT ev.id INTO v_ev_cir
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code = 'commodity_classification_to_intent_rule'
      AND e.tenant_id IS NULL
    LIMIT 1;

    SELECT ev.id INTO v_ev_ccr
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code = 'commodity_code_to_category_rule'
      AND e.tenant_id IS NULL
    LIMIT 1;

    -- ══════════════════════════════════════════════════════════════════════════
    -- commodity_classification_to_intent_rule → enum field overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_cir IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            updated_at       = now(),
            enum_config      = NULL,
            updated_by       = v_su
        FROM (VALUES
            -- Single-value enum selects
            ('classification_source', 'enum',       'select', 'control.classification_source'),
            ('condition_type',        'enum',       'select', 'control.classification_condition_type'),
            ('resolved_domain',       'enum',       'select', 'control.accounting_domain'),
            ('direction',             'enum',       'select', 'control.classification_direction'),
            -- Multi-value: keep text_array data type, switch ui_type to tags
            -- enum_domain_code provides metadata for future tag-label resolvers
            ('applies_to_flows',      'text_array', 'tags',   'control.procurement_flow_type')
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_cir
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_cir = ROW_COUNT;
        RAISE NOTICE 'commodity_classification_to_intent_rule field patches applied: %', v_patched_cir;

    ELSE
        RAISE NOTICE 'commodity_classification_to_intent_rule entity_version not found — skipping';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- commodity_code_to_category_rule → enum field overrides
    -- ══════════════════════════════════════════════════════════════════════════
    IF v_ev_ccr IS NOT NULL THEN

        UPDATE control.entity_field ef
        SET
            data_type        = patch.data_type,
            ui_type          = patch.ui_type,
            enum_domain_code = patch.enum_domain_code,
            updated_at       = now(),
            enum_config      = NULL,
            updated_by       = v_su
        FROM (VALUES
            ('match_mode', 'enum', 'select', 'control.commodity_match_mode')
        ) AS patch(col, data_type, ui_type, enum_domain_code)
        WHERE ef.entity_version_id = v_ev_ccr
          AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ccr = ROW_COUNT;
        RAISE NOTICE 'commodity_code_to_category_rule field patches applied: %', v_patched_ccr;

    ELSE
        RAISE NOTICE 'commodity_code_to_category_rule entity_version not found — skipping';
    END IF;

    RAISE NOTICE 'Classification rule enum patches complete (CIR=%, CCR=%)',
        v_patched_cir, v_patched_ccr;


    -- ========================================================================
    -- Section: 021_fields_products_enum_patches
    -- ========================================================================

    v_patched_product := 0; v_patched_item := 0; v_patched_cc := 0; v_patched_ccat := 0;

    SELECT ev.id INTO v_ev_product
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'product' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_item
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'item' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_cc
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'commodity_classification' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_ccat
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'commodity_category' AND e.tenant_id IS NULL LIMIT 1;

    IF v_ev_product IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('product_type', 'master.product_type')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_product
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_product = ROW_COUNT;
    END IF;

    IF v_ev_item IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('valuation_method', 'master.valuation_method')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_item
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_item = ROW_COUNT;
    END IF;

    IF v_ev_cc IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('classification_type', 'master.cc_classification_type'),
              ('mapping_type',        'master.cc_mapping_type')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_cc
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_cc = ROW_COUNT;
    END IF;

    IF v_ev_ccat IS NOT NULL THEN
        -- Prior partial runs may have both the auto-discovered column name
        -- (buy_allowed) and the curated field name (is_buy_allowed). Collapse
        -- that alias pair before the rename patch to keep ef_version_name_uidx
        -- satisfied on rerun.
        WITH patch(col, name) AS (
            VALUES
              ('buy_allowed',                'is_buy_allowed'),
              ('sell_allowed',               'is_sell_allowed'),
              ('inventory_allowed',          'is_inventory_allowed'),
              ('is_classification_required', 'is_classification_required'),
              ('is_hs_required',             'is_hs_required'),
              ('is_regulated',               'is_regulated'),
              ('default_valuation_method',   'default_valuation_method')
        )
        DELETE FROM control.entity_field stale
        USING patch, control.entity_field target
        WHERE stale.entity_version_id = v_ev_ccat
          AND stale.column_name = patch.col
          AND stale.name <> patch.name
          AND target.entity_version_id = stale.entity_version_id
          AND target.name = patch.name;

        UPDATE control.entity_field ef
           SET name = patch.name,
               data_type = patch.data_type,
               ui_type = patch.ui_type,
               enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('buy_allowed',                'is_buy_allowed',                'boolean', 'checkbox', NULL::text),
              ('sell_allowed',               'is_sell_allowed',               'boolean', 'checkbox', NULL::text),
              ('inventory_allowed',          'is_inventory_allowed',          'boolean', 'checkbox', NULL::text),
              ('is_classification_required', 'is_classification_required',    'boolean', 'checkbox', NULL::text),
              ('is_hs_required',             'is_hs_required',                'boolean', 'checkbox', NULL::text),
              ('is_regulated',               'is_regulated',                  'boolean', 'checkbox', NULL::text),
              ('default_valuation_method',   'default_valuation_method',      'enum',    'select',   'master.valuation_method')
          ) AS patch(col, name, data_type, ui_type, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_ccat
           AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ccat = ROW_COUNT;
    END IF;

    RAISE NOTICE 'Products enum patches complete (product=%, item=%, cc=%, ccat=%)',
        v_patched_product, v_patched_item, v_patched_cc, v_patched_ccat;

    -- ========================================================================
    -- Section: 022_fields_mass_enum_domain_patch
    -- ========================================================================

    v_main := 0; v_type := 0;


    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 1 — Fields with data_type = 'enum':
    --          assign enum_domain_code, clear enum_config.
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        enum_domain_code = mapping.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        -- ── IAM / Identity (001_fields_identity) ──────────────────────────────
        ('tenant',                         'tenant_type',         'master.tenant_type'),
        ('tenant',                         'subscription',        'master.tenant_subscription'),
        ('principal',                      'principal_type',      'master.principal_type'),
        ('tenant_relationship',            'relationship_type',   'master.tenant_relationship_type'),
        ('tenant_relationship',            'relationship_direction','master.tenant_relationship_direction'),
        ('tenant_relationship',            'status',              'master.tenant_relationship_status'),
        ('principal_relationship',         'relationship_type',   'master.principal_relationship_type'),
        ('principal_relationship',         'verification_status', 'master.principal_relationship_verification_status'),
        ('principal_relationship',         'verified_method',     'master.principal_relationship_verified_method'),
        ('contact_link',                   'channel_type',        'master.contact_link_channel_type'),
        ('contact_link',                   'purpose',             'master.contact_link_purpose'),
        ('address',                        'address_type',        'master.address_type'),
        ('address_link',                   'purpose',             'master.address_purpose'),
        ('delegation_grant',               'scope_type',          'master.delegation_scope'),
        -- ── Notifications (002_fields_notifications) ──────────────────────────
        ('notification',                   'channel',             'notification.channel'),
        ('notification',                   'category',            'notification.category'),
        ('notification',                   'priority',            'notification.priority'),
        -- ── Template / Document (004_fields_doc_template) ─────────────────────
        ('template',                       'kind',                'master.template_kind'),
        ('template',                       'engine',              'master.template_engine'),
        -- ── Finance Org (005_fields_finance_org) ──────────────────────────────
        -- cost_center: field name='cost_center_type', column_name='cost_center_category'
        -- profit_center: field name='pc_type', column_name='profit_center_type'
        ('legal_entity',                   'entity_type',         'master.legal_entity_type'),
        ('cost_center',                    'cost_center_category','master.cost_center_category'),
        ('cost_center',                    'node_type',           'master.cost_center_node_type'),
        ('profit_center',                  'profit_center_type',  'master.profit_center_type'),
        ('warehouse',                      'warehouse_type',      'master.warehouse_type'),
        -- ── COA / GL (006_fields_coa_gl) ──────────────────────────────────────
        -- chart_of_account: field name='coa_type', column_name='framework'
        -- gl_account: field name='account_nature', column_name='account_class'
        ('chart_of_account',               'framework',           'master.chart_of_account_framework'),
        ('gl_account_type',                'account_class',       'master.gl_account_class'),
        ('gl_account_type',                'normal_balance',      'master.gl_account_balance'),
        ('gl_account',                     'account_class',       'master.gl_account_class'),
        ('gl_account',                     'node_type',           'master.gl_account_node_type'),
        ('gl_account',                     'normal_balance',      'master.gl_account_balance'),
        -- ── Project / Fiscal (007_fields_project_fiscal) ──────────────────────
        ('project',                        'project_type',        'master.project_type'),
        ('project_item',                   'item_type',           'master.project_item_type'),
        ('fiscal_period',                  'period_type',         'master.fiscal_period_type'),
        -- ── Business Partners (008_fields_partners) ───────────────────────────
        ('customer',                       'customer_type',       'master.customer_type'),
        ('supplier',                       'supplier_type',       'master.supplier_type'),
        ('employee',                       'employment_type',     'master.employment_type'),
        -- ── Assets (009_fields_assets) ────────────────────────────────────────
        ('asset_class',                    'asset_nature',        'master.asset_nature'),
        ('asset',                          'retirement_type',     'master.asset_retirement_type'),
        ('asset_book',                     'book_type',           'master.asset_book_type'),
        ('asset_book',                     'depreciation_method', 'master.depreciation_method'),
        ('asset_assignment_history',       'assignment_type',     'master.asset_assignment_type'),
        -- ── Dimensions (010_fields_dimensions) ────────────────────────────────
        ('dimension_type',                 'category',            'master.dimension_type_category'),
        -- ── Banking (013_fields_banking) ──────────────────────────────────────
        ('bank_party',                     'institution_type',    'master.bank_party_institution_type'),
        ('bank_account',                   'account_id_type',     'master.bank_account_id_type'),
        ('bank_account',                   'account_nature',      'master.bank_account_nature'),
        ('bank_account_house_config',      'usage_type',          'master.bank_account_usage_type'),
        ('bank_account_house_config',      'reconciliation_mode', 'master.bank_account_reconciliation_mode'),
        ('payment_method',                 'direction',           'master.payment_method_direction'),
        ('payment_method',                 'instrument_mode',     'master.payment_method_instrument_mode'),
        -- ── Payment Terms (014_fields_payment_terms) ──────────────────────────
        ('payment_term',                   'base_event',          'master.payment_term_trigger_event'),
        ('payment_term',                   'term_category',       'master.payment_term_category'),
        ('payment_term_clause',            'recovery_method',     'master.payment_term_recovery_method'),
        -- ── UI / CMS / Notifications (016_fields_ui) ──────────────────────────
        ('principal_ui_profile',           'appearance_mode',     'ui.appearance_mode'),
        ('principal_ui_profile',           'density_code',        'ui.density'),
        ('saved_view',                     'scope',               'ui.view_scope'),
        ('dashboard',                      'scope',               'ui.dashboard_scope'),
        ('dashboard_widget',               'widget_type_code',    'ui.widget_type'),
        ('principal_notification_preference','channel',           'notification.channel'),
        ('principal_notification_preference','frequency_code',    'notification.digest_frequency'),
        ('content_item',                   'kind',                'master.content_item_kind'),
        ('content_item_link',              'relation_type',       'master.content_item_link_relation_type')
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
    RAISE NOTICE 'Pass 1 (enum_domain_code only): % rows updated', v_main;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 2 — Fields registered as data_type = 'string' that should be 'enum'.
    --          Promote data_type + ui_type and assign enum_domain_code.
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        data_type        = 'enum',
        ui_type          = 'select',
        enum_domain_code = patch.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        -- ledger_book.category: registered as data_type='string', ui_type='select'
        ('ledger_book',   'category',             'master.ledger_book_category'),
        -- gl_account.subledger_type: registered as data_type='string', ui_type='text'
        ('gl_account',    'subledger_type',        'master.gl_account_subledger'),
        -- company_code.fiscal_year_variant: registered as data_type='string', ui_type='text'
        ('company_code',  'fiscal_year_variant',   'master.company_code_fy_variant'),
        -- company_code.regulatory_framework: registered as data_type='string', ui_type='text'
        ('company_code',  'regulatory_framework',  'master.company_code_framework')
    ) AS patch(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = patch.ename
      AND ef.column_name       = patch.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM patch.domain;

    GET DIAGNOSTICS v_type = ROW_COUNT;
    RAISE NOTICE 'Pass 2 (data_type promotion + enum_domain_code): % rows updated', v_type;

    RAISE NOTICE 'Mass enum domain patch complete: % + % = % total field updates',
        v_main, v_type, v_main + v_type;


    -- ========================================================================
    -- Section: 023_fields_medium_confidence_enum_patches
    -- ========================================================================

    v_main := 0; v_pay := 0; v_hol := 0;


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


    -- ========================================================================
    -- Section: 024_fields_commodity_category
    -- ========================================================================

    DELETE FROM control.entity_operation
     WHERE entity_name IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     );

    DELETE FROM control.entity_lifecycle
     WHERE entity_name IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     );

    DELETE FROM control.entity
     WHERE entity_code IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     )
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, enum_domain_code, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, lookup_config, sort_order, created_by)
    SELECT ev.id, f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.enum_domain_code, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.lookup_config, f.sort_order, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    CROSS JOIN (VALUES
        ('parent_id',        'parent_id',        'Parent',      'uuid',    'reference', 'zero_or_one', NULL::text, false, true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 110),
        ('root_category_id', 'root_category_id', 'Root',        'uuid',    'reference', 'one',         NULL::text, true,  true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 120),
        ('level_no',        'level_no',         'Level',       'integer', 'number',    'zero_or_one', NULL::text, false, true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 130),
        ('sort_order',      'sort_order',       'Sort Order',  'integer', 'number',    'one',         NULL::text, false, false, true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 140),
        ('is_buy_allowed',  'buy_allowed',      'Buy Allowed', 'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 150),
        ('is_sell_allowed', 'sell_allowed',     'Sell Allowed','boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 160),
        ('is_inventory_allowed','inventory_allowed','Inventory Allowed','boolean','checkbox','one',   NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 170),
        ('is_classification_required','is_classification_required','Classification Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,180),
        ('is_hs_required',  'is_hs_required',   'HS Required', 'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 190),
        ('is_regulated',    'is_regulated',     'Regulated',   'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 200),
        ('allowed_classification_domains','allowed_classification_domains','Allowed Classification Domains','jsonb','json','one',NULL::text,true,false,false,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,210),
        ('uom_code',        'uom_code',         'UOM',         'string',  'text',      'zero_or_one', NULL::text, false, true,  false, true,  NULL::jsonb, NULL::jsonb, NULL::jsonb, 220),
        ('sales_revenue_recognition_method','sales_revenue_recognition_method','Revenue Recognition','string','text','one',NULL::text,true,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,230),
        ('sales_variable_consideration','sales_variable_consideration','Variable Consideration','string','text','zero_or_one',NULL::text,false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,240),
        ('sales_standalone_selling_price_method','sales_standalone_selling_price_method','Standalone Selling Price','string','text','zero_or_one',NULL::text,false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,250),
        ('is_stockable',    'is_stockable',     'Stockable',   'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 260),
        ('is_consumable',   'is_consumable',    'Consumable',  'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 270),
        ('default_valuation_method','default_valuation_method','Valuation Method','enum','select','zero_or_one','master.valuation_method',false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,280),
        ('is_lot_tracking_allowed','is_lot_tracking_allowed','Lot Tracking Allowed','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,290),
        ('is_lot_tracking_required','is_lot_tracking_required','Lot Tracking Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,300),
        ('is_serial_tracking_allowed','is_serial_tracking_allowed','Serial Tracking Allowed','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,310),
        ('is_serial_tracking_required','is_serial_tracking_required','Serial Tracking Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,320)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, lookup_config, sort_order)
    WHERE e.entity_code = 'commodity_category'
      AND e.tenant_id IS NULL
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('code','name','is_buy_allowed','is_sell_allowed','is_inventory_allowed','is_regulated','status'),
               'search_fields',      jsonb_build_array('code','name','description'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['code']::text[]), true),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id, 'commodity_category_id', 'commodity_category_id', 'Commodity Category',
           'uuid', 'reference', 'zero_or_one', 'standard', false, true, false, false,
           '{"ref_entity":"commodity_category"}'::jsonb,
           '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,
           115, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code IN ('product', 'item')
      AND e.tenant_id IS NULL
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object(
               'requires_owner_type_scope', true,
               'owner_type_column', 'owner_type',
               'default_owner_type_scope', 'commodity_category'
           ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_classification'
       AND tenant_id IS NULL;

    UPDATE control.entity_field ef
       SET label            = 'Commodity Category',
           data_type        = 'uuid',
           ui_type          = 'reference',
           validation       = '{"ref_entity":"commodity_category"}'::jsonb,
           reference_config = '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,
           updated_at       = now(),
           updated_by       = v_su
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.entity_code = 'commodity_classification'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'owner_id';

    RAISE NOTICE '035_version_fields/024_fields_commodity_category: done';

    -- ========================================================================
    -- Section: 099_fix_entity_field_column_mappings
    -- ========================================================================


-- =============================================================================
-- §1  master.cost_center
--     cost_center_type → cost_center_category
--     manager_id       → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'cost_center_category'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'cost_center' AND ev.version_no = 1
  AND  ef.name = 'cost_center_type'
  AND  ef.column_name = 'cost_center_type';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'cost_center' AND ev.version_no = 1
  AND  ef.name = 'manager_id'
  AND  ef.column_name = 'manager_id';


-- =============================================================================
-- §2  master.profit_center
--     pc_type    → profit_center_type
--     manager_id → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'profit_center_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'profit_center' AND ev.version_no = 1
  AND  ef.name = 'pc_type'
  AND  ef.column_name = 'pc_type';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'profit_center' AND ev.version_no = 1
  AND  ef.name = 'manager_id'
  AND  ef.column_name = 'manager_id';


-- =============================================================================
-- §3  master.project
--     start_date        → planned_start
--     end_date          → planned_end
--     budget_amount     → planned_cost
--     currency_id       → currency_code
--     project_manager_id → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'planned_start'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'start_date'
  AND  ef.column_name = 'start_date';

UPDATE control.entity_field ef
SET    column_name = 'planned_end'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'end_date'
  AND  ef.column_name = 'end_date';

UPDATE control.entity_field ef
SET    column_name = 'planned_cost'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'budget_amount'
  AND  ef.column_name = 'budget_amount';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'project_manager_id'
  AND  ef.column_name = 'project_manager_id';


-- =============================================================================
-- §4  master.project_item
--     planned_amount → planned_cost
--     currency_id    → currency_code
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'planned_cost'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project_item' AND ev.version_no = 1
  AND  ef.name = 'planned_amount'
  AND  ef.column_name = 'planned_amount';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project_item' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';


-- =============================================================================
-- §5  master.gl_account
--     account_nature → account_class
--     account_level  → level_no
--     account_path   → path
--     currency_id    → currency_code
--     DELETE balance_type (duplicate of normal_balance which is already registered)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'account_class'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_nature'
  AND  ef.column_name = 'account_nature';

UPDATE control.entity_field ef
SET    column_name = 'level_no'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_level'
  AND  ef.column_name = 'account_level';

UPDATE control.entity_field ef
SET    column_name = 'path'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_path'
  AND  ef.column_name = 'account_path';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';

-- Remove balance_type: it duplicates normal_balance (same column, different field name).
-- normal_balance is already registered separately and is the canonical field.
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'gl_account' AND ev.version_no = 1
  AND ef.name = 'balance_type';


-- =============================================================================
-- §6  master.chart_of_account
--     coa_type → framework
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'framework'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'chart_of_account' AND ev.version_no = 1
  AND  ef.name = 'coa_type'
  AND  ef.column_name = 'coa_type';


-- =============================================================================
-- §7  master.legal_entity
--     tax_identifier field: column_name tax_id → tax_registration_number
--     DELETE currency_id (legal_entity uses char(3) functional_currency, not a uuid FK)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'tax_registration_number'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'legal_entity' AND ev.version_no = 1
  AND  ef.name = 'tax_identifier'
  AND  ef.column_name = 'tax_id';

-- currency_id registered as uuid/reference but legal_entity has no uuid currency FK.
-- Functional currency is char(3) functional_currency — remove the orphaned field.
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'legal_entity' AND ev.version_no = 1
  AND ef.name = 'currency_id';


-- =============================================================================
-- §8  master.fiscal_period
--     period_no      → period_number
--     posting_status → status
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'period_number'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'fiscal_period' AND ev.version_no = 1
  AND  ef.name = 'period_no'
  AND  ef.column_name = 'period_no';

UPDATE control.entity_field ef
SET    column_name = 'status'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'fiscal_period' AND ev.version_no = 1
  AND  ef.name = 'posting_status'
  AND  ef.column_name = 'posting_status';


-- =============================================================================
-- §9  master.dimension_set
--     company_code_id and is_mandatory do not exist on dimension_set.
--     dimension_set is a content-addressed composite key table; these fields
--     belong to dimension_entry or dimension_type, not the set header.
-- =============================================================================
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'dimension_set' AND ev.version_no = 1
  AND ef.name IN ('company_code_id', 'is_mandatory');


-- =============================================================================
-- §10  master.warehouse
--      company_code_id — warehouse is scoped via site_id (site → company_code).
--      address_id      — address inherited from parent site, not inline.
--      Both columns do not exist on master.warehouse.
-- =============================================================================
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'warehouse' AND ev.version_no = 1
  AND ef.name IN ('company_code_id', 'address_id');


-- =============================================================================
-- §11  master.attachment
--      file_size → size_bytes
--      mime_type → content_type
--      checksum  → sha256
--      owner_type and owner_id: attachment ownership is via entity_document_link,
--      not inline columns (per table design). Remove these orphaned fields.
--      is_public: column does not exist on master.attachment.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'size_bytes'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'file_size'
  AND  ef.column_name = 'file_size';

UPDATE control.entity_field ef
SET    column_name = 'content_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'mime_type'
  AND  ef.column_name = 'mime_type';

UPDATE control.entity_field ef
SET    column_name = 'sha256'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'checksum'
  AND  ef.column_name = 'checksum';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'attachment' AND ev.version_no = 1
  AND ef.name IN ('owner_type', 'owner_id', 'is_public');


-- =============================================================================
-- §12  master.multipart_upload
--      mime_type   → content_type
--      total_parts — column does not exist on master.multipart_upload (uses part_etags jsonb)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'content_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'multipart_upload' AND ev.version_no = 1
  AND  ef.name = 'mime_type'
  AND  ef.column_name = 'mime_type';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'multipart_upload' AND ev.version_no = 1
  AND ef.name = 'total_parts';


-- =============================================================================
-- §13  master.comment
--      parent_id   → parent_comment_id
--      body        → comment_text
--      body_format, is_flagged, is_pinned — not in master.comment DDL; remove.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'parent_comment_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment' AND ev.version_no = 1
  AND  ef.name = 'parent_id'
  AND  ef.column_name = 'parent_id';

UPDATE control.entity_field ef
SET    column_name = 'comment_text'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment' AND ev.version_no = 1
  AND  ef.name = 'body'
  AND  ef.column_name = 'body';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'comment' AND ev.version_no = 1
  AND ef.name IN ('body_format', 'is_flagged', 'is_pinned');


-- =============================================================================
-- §14  master.comment_draft
--      body → draft_text
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'draft_text'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_draft' AND ev.version_no = 1
  AND  ef.name = 'body'
  AND  ef.column_name = 'body';


-- =============================================================================
-- §15  master.comment_mention
--      principal_id → mentioned_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'mentioned_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_mention' AND ev.version_no = 1
  AND  ef.name = 'principal_id'
  AND  ef.column_name = 'principal_id';


-- =============================================================================
-- §16  master.comment_reaction
--      emoji → reaction_type
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'reaction_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_reaction' AND ev.version_no = 1
  AND  ef.name = 'emoji'
  AND  ef.column_name = 'emoji';


-- =============================================================================
-- §17  master.conversation
--      subject     → title
--      is_resolved, resolved_at — not in master.conversation DDL; remove.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'title'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'conversation' AND ev.version_no = 1
  AND  ef.name = 'subject'
  AND  ef.column_name = 'subject';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'conversation' AND ev.version_no = 1
  AND ef.name IN ('is_resolved', 'resolved_at');


-- =============================================================================
-- §18  master.company_code_customer_profile
--      ar_account_id    → ar_gl_account_id
--      credit_limit_local → credit_limit
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'ar_gl_account_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_customer_profile' AND ev.version_no = 1
  AND  ef.name = 'ar_account_id'
  AND  ef.column_name = 'ar_account_id';

UPDATE control.entity_field ef
SET    column_name = 'credit_limit'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_customer_profile' AND ev.version_no = 1
  AND  ef.name = 'credit_limit_local'
  AND  ef.column_name = 'credit_limit_local';


-- =============================================================================
-- §19  master.company_code_supplier_profile
--      ap_account_id → ap_gl_account_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'ap_gl_account_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_supplier_profile' AND ev.version_no = 1
  AND  ef.name = 'ap_account_id'
  AND  ef.column_name = 'ap_account_id';


-- =============================================================================
-- §20  P0 source-seed convergence for long-running databases
--      These rows were removed from the canonical source seed files because the
--      backing DDL columns do not exist. Delete stale rows that may already have
--      been inserted by an older seed run, and repair same-name fields where the
--      canonical column mapping changed.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'timezone_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code' AND ev.version_no = 1
  AND  ef.name = 'timezone'
  AND  ef.column_name = 'timezone';

UPDATE control.entity_field ef
SET    data_type = 'string',
       ui_type   = 'text',
       enum_config = NULL,
       enum_domain_code = NULL
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'customer' AND ev.version_no = 1
  AND  ef.name = 'risk_rating'
  AND  ef.data_type = 'enum';

UPDATE control.entity e
SET    feature_flags = COALESCE(e.feature_flags, '{}'::jsonb)
                       || '{"requires_owner_type_scope":true,"owner_type_column":"owner_type"}'::jsonb
WHERE  e.tenant_id IS NULL
  AND  e.name IN ('bank_account_link', 'commodity_classification');

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      (e.name = 'company_code' AND ef.name IN (
          'local_currency_id',
          'accounting_currency_id',
          'chart_of_account_id',
          'company_code_type'
      ))
   OR (e.name = 'cost_center' AND ef.name IN (
          'business_unit_id'
      ))
   OR (e.name = 'chart_of_account' AND ef.name IN (
          'base_currency_id',
          'account_level_count',
          'is_default'
      ))
   OR (e.name = 'gl_account' AND ef.name IN (
          'account_type_id',
          'is_reconciling',
          'is_blocked',
          'posting_level',
          'currency_id'
      ))
   OR (e.name = 'customer' AND ef.name IN (
          'legal_name',
          'tax_identifier',
          'credit_limit',
          'credit_currency_id',
          'payment_term_id'
      ))
   OR (e.name = 'supplier' AND ef.name IN (
          'legal_name',
          'tax_identifier'
      ))
   OR (e.name = 'employee' AND ef.name IN (
          'legal_name',
          'date_of_birth',
          'national_identifier',
          'department_id',
          'position_title',
          'salary',
          'salary_currency_id'
      ))
   OR (e.name = 'bank_account_house_config' AND ef.name IN (
          'description'
      ))
  );

WITH field_updates(entity_name, field_name, data_type, ui_type, is_required, validation, enum_config) AS (
  VALUES
    ('bank_account_link'::text,'bank_account_id'::text,NULL::text,NULL::text,NULL::boolean,'{"ref_entity":"bank_account"}'::jsonb,NULL::jsonb),
    ('bank_account_link','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),

    ('bank_account','bank_party_id',NULL,NULL,NULL,'{"ref_entity":"bank_party"}'::jsonb,NULL),
    ('bank_account_house_config','bank_account_link_id',NULL,NULL,NULL,'{"ref_entity":"bank_account_link"}'::jsonb,NULL),
    ('bank_account_house_config','gl_account_id',NULL,NULL,NULL,'{"ref_entity":"gl_account"}'::jsonb,NULL),

    ('company_code','legal_entity_id',NULL,NULL,NULL,'{"ref_entity":"legal_entity"}'::jsonb,NULL),
    ('company_code','default_ledger_book_id',NULL,NULL,NULL,'{"ref_entity":"ledger_book"}'::jsonb,NULL),
    ('company_code','tax_jurisdiction_id',NULL,NULL,NULL,'{"ref_entity":"tax_jurisdiction"}'::jsonb,NULL),

    ('business_unit','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('business_unit','bu_head_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),
    ('business_unit','parent_id',NULL,NULL,NULL,'{"ref_entity":"business_unit"}'::jsonb,NULL),

    ('cost_center','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('cost_center','manager_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),
    ('cost_center','parent_id',NULL,NULL,NULL,'{"ref_entity":"cost_center"}'::jsonb,NULL),
    ('cost_center','profit_center_id',NULL,NULL,NULL,'{"ref_entity":"profit_center"}'::jsonb,NULL),
    ('cost_center','site_id',NULL,NULL,NULL,'{"ref_entity":"site"}'::jsonb,NULL),

    ('profit_center','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('profit_center','manager_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),
    ('profit_center','parent_id',NULL,NULL,NULL,'{"ref_entity":"profit_center"}'::jsonb,NULL),

    ('warehouse','site_id',NULL,NULL,NULL,'{"ref_entity":"site"}'::jsonb,NULL),
    ('warehouse','manager_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),

    ('customer','business_partner_id',NULL,NULL,NULL,'{"ref_entity":"business_partner"}'::jsonb,NULL),
    ('customer','account_manager_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),

    ('supplier','business_partner_id',NULL,NULL,NULL,'{"ref_entity":"business_partner"}'::jsonb,NULL),
    ('supplier','payment_term_id',NULL,NULL,NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),
    ('supplier','payment_method_id',NULL,NULL,NULL,'{"ref_entity":"payment_method"}'::jsonb,NULL),
    ('supplier','account_manager_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),
    ('supplier','commodity_category_id',NULL,NULL,NULL,'{"ref_entity":"commodity_category"}'::jsonb,NULL),

    ('employee','principal_id',NULL,NULL,NULL,'{"ref_entity":"principal"}'::jsonb,NULL),
    ('employee','manager_id',NULL,NULL,NULL,'{"ref_entity":"employee"}'::jsonb,NULL),
    ('employee','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),

    ('company_code_customer_profile','customer_id',NULL,NULL,NULL,'{"ref_entity":"customer"}'::jsonb,NULL),
    ('company_code_customer_profile','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('company_code_customer_profile','default_accounting_profile_id',NULL,NULL,NULL,'{"ref_entity":"accounting_profile"}'::jsonb,NULL),
    ('company_code_customer_profile','tax_group_id',NULL,NULL,NULL,'{"ref_entity":"tax_group"}'::jsonb,NULL),
    ('company_code_customer_profile','default_receipt_method_id',NULL,NULL,NULL,'{"ref_entity":"payment_method"}'::jsonb,NULL),
    ('company_code_customer_profile','default_dimension_set_id',NULL,NULL,NULL,'{"ref_entity":"dimension_set"}'::jsonb,NULL),
    ('company_code_customer_profile','payment_term_id',NULL,NULL,NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),

    ('company_code_supplier_profile','supplier_id',NULL,NULL,NULL,'{"ref_entity":"supplier"}'::jsonb,NULL),
    ('company_code_supplier_profile','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('company_code_supplier_profile','default_accounting_profile_id',NULL,NULL,NULL,'{"ref_entity":"accounting_profile"}'::jsonb,NULL),
    ('company_code_supplier_profile','payment_term_id',NULL,NULL,NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),
    ('company_code_supplier_profile','payment_method_id',NULL,NULL,NULL,'{"ref_entity":"payment_method"}'::jsonb,NULL),
    ('company_code_supplier_profile','preferred_remittance_bank_link_id',NULL,NULL,NULL,'{"ref_entity":"business_partner_bank_account"}'::jsonb,NULL),
    ('company_code_supplier_profile','tax_group_id',NULL,NULL,NULL,'{"ref_entity":"tax_group"}'::jsonb,NULL),
    ('company_code_supplier_profile','default_wht_tax_group_id',NULL,NULL,NULL,'{"ref_entity":"tax_group"}'::jsonb,NULL),
    ('company_code_supplier_profile','default_dimension_set_id',NULL,NULL,NULL,'{"ref_entity":"dimension_set"}'::jsonb,NULL),

    ('holiday_calendar','company_code_id',NULL,NULL,NULL,'{"ref_entity":"company_code"}'::jsonb,NULL),
    ('holiday_calendar_day','holiday_calendar_id',NULL,NULL,NULL,'{"ref_entity":"holiday_calendar"}'::jsonb,NULL),

    ('payment_term','due_days',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term','due_day_of_month',NULL,NULL,NULL,'{"min":1,"max":31}'::jsonb,NULL),
    ('payment_term','grace_days',NULL,NULL,false,'{"min":0}'::jsonb,NULL),
    ('payment_term','due_date_flexibility',NULL,NULL,false,NULL,NULL),
    ('payment_term','holiday_calendar_id',NULL,NULL,NULL,'{"ref_entity":"holiday_calendar"}'::jsonb,NULL),
    ('payment_term','month_offset',NULL,NULL,false,'{"min":0}'::jsonb,NULL),
    ('payment_term','term_category',NULL,NULL,false,NULL,NULL),
    ('payment_term','installment_count',NULL,NULL,NULL,'{"min":1}'::jsonb,NULL),
    ('payment_term','version',NULL,NULL,NULL,'{"min":1}'::jsonb,NULL),
    ('payment_term','supersedes_payment_term_id',NULL,'hidden',NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),
    ('payment_term','sort_order',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term','status_changed_at',NULL,'hidden',NULL,NULL,NULL),
    ('payment_term','status_changed_by',NULL,'hidden',NULL,'{"ref_entity":"principal"}'::jsonb,NULL),

    ('payment_term_clause','payment_term_id',NULL,NULL,NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),
    ('payment_term_clause','sequence_no',NULL,NULL,NULL,'{"min":1}'::jsonb,NULL),
    ('payment_term_clause','default_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','default_amount',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term_clause','currency_code',NULL,NULL,NULL,'{"max_length":3}'::jsonb,NULL),
    ('payment_term_clause','min_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','max_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','min_amount',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term_clause','max_amount',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term_clause','cumulative_cap_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','cumulative_cap_amount',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term_clause','release_delay_days',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),
    ('payment_term_clause','recovery_start_after_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','recovery_end_before_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','recovery_method','enum','select',NULL,NULL,NULL::jsonb),
    ('payment_term_clause','partial_release_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL),
    ('payment_term_clause','rounding_scale',NULL,NULL,NULL,'{"min":0}'::jsonb,NULL),

    ('payment_term_discount_tier','payment_term_id',NULL,NULL,NULL,'{"ref_entity":"payment_term"}'::jsonb,NULL),
    ('payment_term_discount_tier','tier_no',NULL,NULL,NULL,'{"min":1}'::jsonb,NULL),
    ('payment_term_discount_tier','qualify_within_days',NULL,NULL,NULL,'{"min":1}'::jsonb,NULL),
    ('payment_term_discount_tier','discount_pct',NULL,NULL,NULL,'{"min":0,"max":100}'::jsonb,NULL)
)
UPDATE control.entity_field ef
SET    data_type   = COALESCE(fu.data_type, ef.data_type),
       ui_type     = COALESCE(fu.ui_type, ef.ui_type),
       is_required = COALESCE(fu.is_required, ef.is_required),
       validation  = COALESCE(fu.validation, ef.validation),
       enum_config = COALESCE(fu.enum_config, ef.enum_config)
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
JOIN   field_updates fu ON fu.entity_name = e.name
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  ev.version_no = 1
  AND  ef.name = fu.field_name;

WITH cost_center_dimension_lookup(field_name, lookup_config) AS (
  VALUES
    ('profit_center_id'::text, '{"search_fields":["code","name"],"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"empty"}}'::jsonb),
    ('site_id'::text,          '{"search_fields":["code","name"],"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"empty"}}'::jsonb)
)
UPDATE control.entity_field ef
SET    lookup_config = ccd.lookup_config,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
JOIN   cost_center_dimension_lookup ccd ON true
WHERE  ef.entity_version_id = ev.id
  AND  e.tenant_id IS NULL
  AND  e.name = 'cost_center'
  AND  ev.version_no = 1
  AND  ef.name = ccd.field_name;

RAISE NOTICE '035_version_fields/099_fix_entity_field_column_mappings: done';


END $$;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/004_entity_engine/060_entity_operations.sql
-- ============================================================

-- 060_entity_operations/001_entity_operations.sql
-- Unified platform seed for control.entity_operation registrations.
-- Sources: 001_ops_iam.sql through 008_ops_master_schema_coverage.sql
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

-- === SOURCE: 001_ops_iam.sql ===

-- 060_entity_operations/001_ops_iam.sql
-- Entity operation registrations for IAM entities (1–26)
-- Covers: tenant, principal, auth_group, team, label, owner_type, address,
--         access_grant, delegation_grant, principal_persona
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING
-- Run AFTER: 010_system/entity_engine/020_entities/001_master_identity.sql

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- tenant  (Set C: create/update/delete/export/import/activate/deactivate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'tenant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/tenant/new',       false,10,v_su),
    (NULL,'tenant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/tenant/{id}/edit', true, 20,v_su),
    (NULL,'tenant','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'tenant','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 40,v_su),
    (NULL,'tenant','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal  (Set D: + import, bulk ops, share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'principal','create',      'LIST',  'PRIMARY', 'NAVIGATE','/app/principal/new',       false,10,v_su),
    (NULL,'principal','update',      'DETAIL','PRIMARY', 'NAVIGATE','/app/principal/{id}/edit', true, 20,v_su),
    (NULL,'principal','cancel',      'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'principal','reopen',      'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'principal','close',       'DETAIL','OVERFLOW','MODAL',   'close',                    true, 50,v_su),
    (NULL,'principal','delete',      'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 60,v_su),
    (NULL,'principal','export',      'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su),
    (NULL,'principal','import',      'LIST',  'TOOLBAR', 'API',     'import',                   false,80,v_su),
    (NULL,'principal','bulk_update', 'LIST',  'TOOLBAR', 'API',     'bulk_update',              false,90,v_su),
    (NULL,'principal','delegate',    'DETAIL','OVERFLOW','MODAL',   'delegate',                 true,100,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- auth_group  (Set C: create/update/delete/export/import/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'auth_group','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/auth_group/new',       false,10,v_su),
    (NULL,'auth_group','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/auth_group/{id}/edit', true, 20,v_su),
    (NULL,'auth_group','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'auth_group','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'auth_group','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'auth_group','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- team  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'team','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/team/new',       false,10,v_su),
    (NULL,'team','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/team/{id}/edit', true, 20,v_su),
    (NULL,'team','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'team','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',              true, 40,v_su),
    (NULL,'team','export',  'LIST',  'TOOLBAR', 'API',     'export',              false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- principal_persona  (Set A: create/update/delete/export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'principal_persona','create','LIST',  'PRIMARY', 'NAVIGATE','/app/principal_persona/new',       false,10,v_su),
    (NULL,'principal_persona','update','DETAIL','PRIMARY', 'NAVIGATE','/app/principal_persona/{id}/edit', true, 20,v_su),
    (NULL,'principal_persona','delete','DETAIL','OVERFLOW','MODAL',   'delete',                           true, 30,v_su),
    (NULL,'principal_persona','export','LIST',  'TOOLBAR', 'API',     'export',                           false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- access_grant  (Set A + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'access_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/access_grant/new',       false,10,v_su),
    (NULL,'access_grant','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/access_grant/{id}/edit', true, 20,v_su),
    (NULL,'access_grant','cancel',  'DETAIL','OVERFLOW','MODAL',   'revoke',                      true, 30,v_su),
    (NULL,'access_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 40,v_su),
    (NULL,'access_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- delegation_grant  (Set A + revoke)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'delegation_grant','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/delegation_grant/new',       false,10,v_su),
    (NULL,'delegation_grant','cancel',  'DETAIL','PRIMARY', 'MODAL',   'revoke',                          true, 20,v_su),
    (NULL,'delegation_grant','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 30,v_su),
    (NULL,'delegation_grant','export',  'LIST',  'TOOLBAR', 'API',     'export',                          false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- label  (Set B: create/update/delete/export/activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'label','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/label/new',       false,10,v_su),
    (NULL,'label','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/label/{id}/edit', true, 20,v_su),
    (NULL,'label','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 30,v_su),
    (NULL,'label','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',           true, 40,v_su),
    (NULL,'label','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',               true, 50,v_su),
    (NULL,'label','export', 'LIST',  'TOOLBAR', 'API',     'export',               false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- owner_type  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'owner_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/owner_type/new',       false,10,v_su),
    (NULL,'owner_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/owner_type/{id}/edit', true, 20,v_su),
    (NULL,'owner_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                    true, 30,v_su),
    (NULL,'owner_type','export','LIST',  'TOOLBAR', 'API',     'export',                    false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- address  (Set A + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'address','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/address/new',       false,10,v_su),
    (NULL,'address','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/address/{id}/edit', true, 20,v_su),
    (NULL,'address','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'address','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 40,v_su),
    (NULL,'address','export', 'LIST',  'TOOLBAR', 'API',     'export',                 false,50,v_su),
    (NULL,'address','import', 'LIST',  'TOOLBAR', 'API',     'import',                 false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities (Set G: update only — managed via parent entity UI)
-- principal_profile, principal_identity_binding, contact_link, contact_email,
-- contact_phone, address_link, tenant_module_subscription,
-- tenant_feature_entitlement, tenant_permission_override, company_code_access,
-- auth_group_role, auth_group_member, team_member,
-- group_feature_grant, principal_feature_grant
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'principal_profile',          'update','DETAIL','PRIMARY','MODAL','edit',false,10,v_su),
    (NULL,'principal_profile',          'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'principal_identity_binding', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'principal_identity_binding', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_email',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_email',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'contact_phone',              'create','LIST',  'PRIMARY','MODAL','create',false,10,v_su),
    (NULL,'contact_phone',              'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su),
    (NULL,'auth_group_member',          'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'auth_group_member',          'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'team_member',                'create','LIST',  'PRIMARY','MODAL','add_member',false,10,v_su),
    (NULL,'team_member',                'delete','DETAIL','OVERFLOW','MODAL','remove_member',true,20,v_su),
    (NULL,'tenant_module_subscription', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'tenant_feature_entitlement', 'delete','DETAIL','OVERFLOW','MODAL','delete',true,20,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: IAM entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;



-- === SOURCE: 002_ops_finance_org.sql ===

-- 060_entity_operations/002_ops_finance_org.sql
-- Entity operation registrations for Finance Org entities (49–64)
-- Covers: legal_entity, company_code, business_unit, cost_center, profit_center,
--         warehouse, chart_of_account, gl_account, project, project_item,
--         dimension_set, fiscal_period
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- legal_entity  (Set C: full CRUD + import + activate/deactivate/close)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'legal_entity','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/legal_entity/new',       false,10,v_su),
    (NULL,'legal_entity','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/legal_entity/{id}/edit', true, 20,v_su),
    (NULL,'legal_entity','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'legal_entity','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'legal_entity','close',   'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'legal_entity','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'legal_entity','export',  'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'legal_entity','import',  'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- company_code  (Set C)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'company_code','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/company_code/new',       false,10,v_su),
    (NULL,'company_code','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/company_code/{id}/edit', true, 20,v_su),
    (NULL,'company_code','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'company_code','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'company_code','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'company_code','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'company_code','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- business_unit / cost_center / profit_center  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'business_unit','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/business_unit/new',       false,10,v_su),
    (NULL,'business_unit','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/business_unit/{id}/edit', true, 20,v_su),
    (NULL,'business_unit','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'business_unit','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'business_unit','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'business_unit','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su),

    (NULL,'cost_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/cost_center/new',       false,10,v_su),
    (NULL,'cost_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/cost_center/{id}/edit', true, 20,v_su),
    (NULL,'cost_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'cost_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'cost_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'cost_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su),

    (NULL,'profit_center','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/profit_center/new',       false,10,v_su),
    (NULL,'profit_center','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/profit_center/{id}/edit', true, 20,v_su),
    (NULL,'profit_center','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'profit_center','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                   true, 40,v_su),
    (NULL,'profit_center','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                       true, 50,v_su),
    (NULL,'profit_center','export', 'LIST',  'TOOLBAR', 'API',     'export',                       false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- warehouse  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'warehouse','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/warehouse/new',       false,10,v_su),
    (NULL,'warehouse','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/warehouse/{id}/edit', true, 20,v_su),
    (NULL,'warehouse','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'warehouse','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',               true, 40,v_su),
    (NULL,'warehouse','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 50,v_su),
    (NULL,'warehouse','export', 'LIST',  'TOOLBAR', 'API',     'export',                   false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- chart_of_account  (Set C: + import, copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'chart_of_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/chart_of_account/new',       false,10,v_su),
    (NULL,'chart_of_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/chart_of_account/{id}/edit', true, 20,v_su),
    (NULL,'chart_of_account','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'chart_of_account','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'chart_of_account','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 50,v_su),
    (NULL,'chart_of_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 60,v_su),
    (NULL,'chart_of_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,70,v_su),
    (NULL,'chart_of_account','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,80,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account  (Set C + block/unblock via cancel/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'gl_account','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account/new',       false,10,v_su),
    (NULL,'gl_account','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account/{id}/edit', true, 20,v_su),
    (NULL,'gl_account','cancel',  'DETAIL','TOOLBAR', 'MODAL',   'block',                     true, 30,v_su),
    (NULL,'gl_account','reopen',  'DETAIL','TOOLBAR', 'MODAL',   'unblock',                   true, 40,v_su),
    (NULL,'gl_account','close',   'DETAIL','OVERFLOW','MODAL',   'close',                     true, 50,v_su),
    (NULL,'gl_account','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 60,v_su),
    (NULL,'gl_account','export',  'LIST',  'TOOLBAR', 'API',     'export',                    false,70,v_su),
    (NULL,'gl_account','import',  'LIST',  'TOOLBAR', 'API',     'import',                    false,80,v_su),
    (NULL,'gl_account','bulk_update','LIST','TOOLBAR','API',     'bulk_update',               false,90,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- project  (Set F: + submit/approve/close/reopen)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'project','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/project/new',       false,10,v_su),
    (NULL,'project','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/project/{id}/edit', true, 20,v_su),
    (NULL,'project','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                 true, 30,v_su),
    (NULL,'project','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                true, 40,v_su),
    (NULL,'project','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                   true, 50,v_su),
    (NULL,'project','close',   'DETAIL','OVERFLOW','MODAL',   'close',                  true, 60,v_su),
    (NULL,'project','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                 true, 70,v_su),
    (NULL,'project','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                 true, 80,v_su),
    (NULL,'project','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 90,v_su),
    (NULL,'project','export',  'LIST',  'TOOLBAR', 'API',     'export',                 false,100,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fiscal_period  (lifecycle: close/reopen + submit/approve)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'fiscal_period','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/fiscal_period/new',       false,10,v_su),
    (NULL,'fiscal_period','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/fiscal_period/{id}/edit', true, 20,v_su),
    (NULL,'fiscal_period','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_for_close',              true, 30,v_su),
    (NULL,'fiscal_period','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_close',                 true, 40,v_su),
    (NULL,'fiscal_period','close',   'DETAIL','TOOLBAR', 'MODAL',   'close',                         true, 50,v_su),
    (NULL,'fiscal_period','reopen',  'DETAIL','OVERFLOW','MODAL',   'reopen',                        true, 60,v_su),
    (NULL,'fiscal_period','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,70,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL entities under Finance Org (Set G)
-- gl_account_type, gl_account_hierarchy, company_code_gl_config,
-- company_code_book_assignment, dimension_set, project_item
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'gl_account_type',           'create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_type/new',       false,10,v_su),
    (NULL,'gl_account_type',           'update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_type/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_type',           'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su),
    (NULL,'gl_account_type',           'export','LIST',  'TOOLBAR', 'API',     'export',                         false,40,v_su),
    (NULL,'company_code_gl_config',    'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','update','DETAIL','PRIMARY','MODAL',  'edit',                           true, 10,v_su),
    (NULL,'company_code_book_assignment','delete','DETAIL','OVERFLOW','MODAL', 'delete',                         true, 20,v_su),
    (NULL,'project_item',              'create','LIST',  'PRIMARY', 'MODAL',   'create',                         false,10,v_su),
    (NULL,'project_item',              'update','DETAIL','PRIMARY', 'MODAL',   'edit',                           true, 20,v_su),
    (NULL,'project_item',              'delete','DETAIL','OVERFLOW','MODAL',   'delete',                         true, 30,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Finance org entities seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;


-- ============================================================
-- DOMAIN: Finance document operations from domain registrations
-- SOURCE: 005_domain_registrations/900_operations/001_entity_operations.sql
-- ============================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- Prerequisite: ensure permission codes used below exist in shared.permission.
-- hold / release_hold are workflow-hold operations; view_match is a utility read.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, pc.id, v.st, v.rl, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category pc
JOIN (VALUES
    ('hold',         'Hold',             'workflow', 'record', 'medium', 92),
    ('release_hold', 'Release Hold',     'workflow', 'record', 'medium', 93),
    ('view_match',   'View Match Case',  'utility',  'record', 'low',    75),
    ('extend',       'Extend Record',    'entity',   'record', 'medium', 76),
    ('ap.run_matching', 'Run Invoice Matching', 'finance', 'record', 'low', 780)
) AS v(code, name, cat, st, rl, so) ON pc.code = v.cat
ON CONFLICT (code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'purchase_invoice', 'create',          'LIST',   'PRIMARY',  'NAVIGATE', '/app/purchase_invoice/new',       false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'update',          'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/purchase_invoice/{id}/edit', true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'submit',          'DETAIL', 'PRIMARY',  'MODAL',    'flow:submit_for_approval',        true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'approve',         'DETAIL', 'PRIMARY',  'MODAL',    'approve',                        true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'deny',            'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                           true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'post',            'DETAIL', 'TOOLBAR',  'MODAL',    'flow:post_invoice',              true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'cancel',          'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                         true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'reverse',         'DETAIL', 'OVERFLOW', 'MODAL',    'flow:reverse_invoice',           true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'copy',            'DETAIL', 'OVERFLOW', 'API',      'copy',                           true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'export',          'LIST',   'TOOLBAR',  'API',      'export',                         false, 100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'hold',            'DETAIL', 'OVERFLOW', 'MODAL',    'hold',                           true,  110, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'release_hold',    'DETAIL', 'OVERFLOW', 'MODAL',    'release_hold',                   true,  120, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'amend',           'DETAIL', 'OVERFLOW', 'MODAL',    'amend',                          true,  130, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice', 'ap.promote_proforma','DETAIL', 'PRIMARY',  'MODAL',    'flow:promote_proforma',          true,  25,  '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- Idempotent correction: ensure submit and post use the flow handler_targets
-- (catches existing rows that were seeded with the generic 'submit'/'post' targets)
UPDATE control.entity_operation
   SET handler_target = CASE
       WHEN permission_code = 'submit'  THEN 'flow:submit_for_approval'
       WHEN permission_code = 'post'    THEN 'flow:post_invoice'
       WHEN permission_code = 'reverse' THEN 'flow:reverse_invoice'
   END
 WHERE tenant_id IS NULL
   AND entity_name = 'purchase_invoice'
   AND permission_code IN ('submit','post','reverse')
   AND handler_target NOT LIKE 'flow:%';


-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Order operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'purchase_order', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/app/purchase_order/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/purchase_order/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'close',    'DETAIL', 'TOOLBAR',  'MODAL',    'close',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'cancel',   'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                             false, 90, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- Journal Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'journal_entry', 'create',   'LIST',   'PRIMARY',  'NAVIGATE', '/app/journal_entry/new',       false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'update',   'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/journal_entry/{id}/edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'submit',   'DETAIL', 'PRIMARY',  'MODAL',    'submit',                            true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'approve',  'DETAIL', 'PRIMARY',  'MODAL',    'approve',                           true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'deny',     'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                              true,  50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'post',     'DETAIL', 'TOOLBAR',  'MODAL',    'post',                              true,  60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'reverse',  'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                           true,  70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'copy',     'DETAIL', 'OVERFLOW', 'API',      'copy',                              true,  80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'journal_entry', 'export',   'LIST',   'TOOLBAR',  'API',      'export',                            false, 90, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


UPDATE control.entity_operation
   SET placement = 'TOOLBAR',
       handler_type = 'API',
       handler_target = 'copy',
       is_record_required = true,
       sort_order = 65,
       label_override = 'Copy',
       icon_override = 'copy',
       is_enabled = true,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL
   AND entity_name = 'journal_entry'
   AND permission_code = 'copy';


-- ══════════════════════════════════════════════════════════════════════════════
-- Payment Entry operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'payment_entry', 'create',    'LIST',   'PRIMARY',  'NAVIGATE', '/app/payment_entry/new',        false, 10,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'update',    'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/payment_entry/{id}/edit',  true,  20,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'submit',    'DETAIL', 'PRIMARY',  'MODAL',    'submit',                             true,  30,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'approve',   'DETAIL', 'PRIMARY',  'MODAL',    'approve',                            true,  40,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'deny',      'DETAIL', 'TOOLBAR',  'MODAL',    'deny',                               true,  50,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'post',      'DETAIL', 'TOOLBAR',  'MODAL',    'post',                               true,  60,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'void',      'DETAIL', 'OVERFLOW', 'MODAL',    'void',                               true,  70,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'reverse',   'DETAIL', 'OVERFLOW', 'MODAL',    'reverse',                            true,  80,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'cancel',    'DETAIL', 'OVERFLOW', 'MODAL',    'cancel',                             true,  90,  '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'copy',      'DETAIL', 'OVERFLOW', 'API',      'copy',                               true,  100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry', 'export',    'LIST',   'TOOLBAR',  'API',      'export',                             false, 110, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- Purchase Invoice Line operations
-- create  → add a new line (only available when invoice is draft)
-- update  → edit an existing line (only available when invoice is draft/amend)
-- delete_draft → remove a line (only available when invoice is draft)
-- view_distribution → navigate to the accounting distributions for this line
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'purchase_invoice_line', 'create',              'LIST',   'PRIMARY',  'MODAL',    'add_line',                                               false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'update',              'DETAIL', 'PRIMARY',  'MODAL',    'edit_line',                                              true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'delete_draft',        'DETAIL', 'OVERFLOW', 'MODAL',    'delete_line',                                            true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'view_je',             'DETAIL', 'OVERFLOW', 'NAVIGATE', '/document/accounting_distribution?source_line_id={id}', true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice_line', 'view_match',          'DETAIL', 'OVERFLOW', 'NAVIGATE', '/document/invoice_match_case?invoice_line_id={id}',      true,  50, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ── Idempotent correction of NAVIGATE handler_targets ────────────────────────
-- Always sets canonical underscore-slug URLs. Catches both the old /document/...
-- prefix and any prior hyphenated form (/app/purchase-invoice/...).
UPDATE control.entity_operation
SET handler_target = CASE
    WHEN entity_name = 'purchase_invoice' AND permission_code = 'create' THEN '/app/purchase_invoice/new'
    WHEN entity_name = 'purchase_invoice' AND permission_code = 'update' THEN '/app/purchase_invoice/{id}/edit'
    WHEN entity_name = 'purchase_order'   AND permission_code = 'create' THEN '/app/purchase_order/new'
    WHEN entity_name = 'purchase_order'   AND permission_code = 'update' THEN '/app/purchase_order/{id}/edit'
    WHEN entity_name = 'journal_entry'    AND permission_code = 'create' THEN '/app/journal_entry/new'
    WHEN entity_name = 'journal_entry'    AND permission_code = 'update' THEN '/app/journal_entry/{id}/edit'
    WHEN entity_name = 'payment_entry'    AND permission_code = 'create' THEN '/app/payment_entry/new'
    WHEN entity_name = 'payment_entry'    AND permission_code = 'update' THEN '/app/payment_entry/{id}/edit'
END
WHERE tenant_id IS NULL
  AND entity_name IN ('purchase_invoice','purchase_order','journal_entry','payment_entry')
  AND permission_code IN ('create','update')
  AND handler_type = 'NAVIGATE';


-- === SOURCE: 065_entity_flows.sql (flow-bound operations) ===
-- §O1 — promote_proforma operation (from 019_promote_proforma_operation block)
INSERT INTO control.entity_operation (
  tenant_id, entity_name, permission_code,
  handler_type, handler_target, placement, surface,
  sort_order, label_override, icon_override, created_by)
SELECT
  NULL, 'purchase_invoice', 'ap.promote_proforma',
  'MODAL', 'flow:promote_proforma', 'PRIMARY', 'DETAIL',
  100, 'Promote to Invoice', 'file-check', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM control.entity_operation
   WHERE entity_name = 'purchase_invoice'
     AND permission_code = 'ap.promote_proforma'
     AND tenant_id IS NULL);


-- §O2 — run_matching operation (from 029_run_matching_operation block)
INSERT INTO control.entity_operation (
  tenant_id, entity_name, permission_code,
  handler_type, handler_target, placement, surface,
  is_record_required, sort_order,
  label_override, icon_override, created_by)
SELECT
  NULL, 'purchase_invoice', 'ap.run_matching',
  'API', 'flow:run_matching', 'TOOLBAR', 'DETAIL',
  true, 150,
  'Run Matching', 'git-compare', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM control.entity_operation
   WHERE entity_name     = 'purchase_invoice'
     AND permission_code = 'ap.run_matching'
     AND tenant_id IS NULL);



-- === SOURCE: 003_ops_coa_partners.sql ===

-- 060_entity_operations/003_ops_coa_partners.sql
-- Entity operation registrations for Business Partners + Assets (65–74)
-- Covers: customer, supplier, employee, company_code_customer_profile,
--         company_code_supplier_profile, asset_class, asset, asset_book,
--         asset_component, asset_assignment_history
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- customer  (Set D: + close/reopen for credit hold / suspend)
-- NOTE: existing 001_fin_operations.sql seeds customer with cancel+close.
--       This file adds the reopen + import + bulk_update ops.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'customer','reopen',      'DETAIL','OVERFLOW','MODAL','reactivate',  true, 45,v_su),
    (NULL,'customer','import',      'LIST',  'TOOLBAR', 'API',  'import',      false,55,v_su),
    (NULL,'customer','bulk_update', 'LIST',  'TOOLBAR', 'API',  'bulk_update', false,65,v_su),
    (NULL,'customer','copy',        'DETAIL','OVERFLOW','API',  'copy',        true, 35,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- supplier  (delta ops — base ops seeded by 001_fin_operations.sql)
-- NOTE: 001_fin_operations.sql seeds supplier with create/update/cancel/close/export.
--       This file adds the extended ops: reopen, copy, delete, import, bulk_update.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'supplier','reopen',      'DETAIL','OVERFLOW','MODAL','reactivate',  true, 45,v_su),
    (NULL,'supplier','copy',        'DETAIL','OVERFLOW','API',  'copy',        true, 55,v_su),
    (NULL,'supplier','delete',      'DETAIL','OVERFLOW','MODAL','delete',      true, 65,v_su),
    (NULL,'supplier','import',      'LIST',  'TOOLBAR', 'API',  'import',      false,75,v_su),
    (NULL,'supplier','bulk_update', 'LIST',  'TOOLBAR', 'API',  'bulk_update', false,85,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- employee  (Set C + delegate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'employee','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/employee/new',       false,10,v_su),
    (NULL,'employee','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/employee/{id}/edit', true, 20,v_su),
    (NULL,'employee','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'employee','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'employee','close',      'DETAIL','OVERFLOW','MODAL',   'terminate',               true, 50,v_su),
    (NULL,'employee','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                  true, 60,v_su),
    (NULL,'employee','export',     'LIST',  'TOOLBAR', 'API',     'export',                  false,70,v_su),
    (NULL,'employee','import',     'LIST',  'TOOLBAR', 'API',     'import',                  false,80,v_su),
    (NULL,'employee','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',             false,90,v_su),
    (NULL,'employee','delegate',   'DETAIL','OVERFLOW','MODAL',   'delegate',                true,100,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: company_code_customer_profile, company_code_supplier_profile (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'company_code_customer_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su),
    (NULL,'company_code_supplier_profile','update','DETAIL','PRIMARY','MODAL','edit',true,10,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset_class  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'asset_class','create','LIST',  'PRIMARY', 'NAVIGATE','/app/asset_class/new',       false,10,v_su),
    (NULL,'asset_class','update','DETAIL','PRIMARY', 'NAVIGATE','/app/asset_class/{id}/edit', true, 20,v_su),
    (NULL,'asset_class','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                 true, 30,v_su),
    (NULL,'asset_class','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',                 true, 40,v_su),
    (NULL,'asset_class','delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 50,v_su),
    (NULL,'asset_class','export','LIST',  'TOOLBAR', 'API',     'export',                     false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- asset  (Set C + dispose workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'asset','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/asset/new',       false,10,v_su),
    (NULL,'asset','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/asset/{id}/edit', true, 20,v_su),
    (NULL,'asset','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit_disposal',      true, 30,v_su),
    (NULL,'asset','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve_disposal',     true, 40,v_su),
    (NULL,'asset','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',           true, 50,v_su),
    (NULL,'asset','close',   'DETAIL','OVERFLOW','MODAL',   'dispose',              true, 60,v_su),
    (NULL,'asset','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',               true, 70,v_su),
    (NULL,'asset','export',  'LIST',  'TOOLBAR', 'API',     'export',               false,80,v_su),
    (NULL,'asset','import',  'LIST',  'TOOLBAR', 'API',     'import',               false,90,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: asset_book, asset_component, asset_assignment_history
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'asset_book',               'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_book',               'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_book',               'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_component',          'create','LIST',  'PRIMARY', 'MODAL','create', false,10,v_su),
    (NULL,'asset_component',          'update','DETAIL','PRIMARY', 'MODAL','edit',   true, 20,v_su),
    (NULL,'asset_component',          'delete','DETAIL','OVERFLOW','MODAL','delete', true, 30,v_su),
    (NULL,'asset_assignment_history', 'create','LIST',  'PRIMARY', 'MODAL','assign', false,10,v_su),
    (NULL,'asset_assignment_history', 'export','LIST',  'TOOLBAR', 'API',  'export', false,20,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Partners + Assets seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;


-- ============================================================
-- DOMAIN: Supplier / Customer / Business Partner base operations
-- SOURCE: 005_domain_registrations/900_operations/001_entity_operations.sql
-- ============================================================

-- Remove stale rows inserted under the old entity name (before supplier rename).
DELETE FROM control.entity_operation WHERE entity_name = 'vendor' AND tenant_id IS NULL;


-- ══════════════════════════════════════════════════════════════════════════════
-- Supplier base operations
-- permission_codes must reference shared.permission.code
-- Master lifecycle actions map to: cancel (deactivate/block), close (archive)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'supplier', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/app/business_partner/new?mode=supplier', false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'supplier', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/supplier/{id}?mode=edit', true, 20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'supplier', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',                 true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'supplier', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                    true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'supplier', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                     false, 50, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- Customer base operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'customer', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', '/app/business_partner/new?mode=customer', false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'update',  'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/customer/{id}?mode=edit', true,  20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'cancel',  'DETAIL', 'OVERFLOW', 'MODAL',    'deactivate',                 true,  30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'close',   'DETAIL', 'OVERFLOW', 'MODAL',    'archive',                    true,  40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'customer', 'export',  'LIST',   'TOOLBAR',  'API',      'export',                     false, 50, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


-- BP-first create entry points for supplier/customer role creation.
UPDATE control.entity_operation
SET handler_target = CASE
    WHEN entity_name = 'supplier' AND permission_code = 'create' THEN '/app/business_partner/new?mode=supplier'
    WHEN entity_name = 'customer' AND permission_code = 'create' THEN '/app/business_partner/new?mode=customer'
    WHEN entity_name = 'customer' AND permission_code = 'update' THEN '/app/customer/{id}?mode=edit'
    ELSE handler_target
END
WHERE tenant_id IS NULL
  AND entity_name IN ('supplier','customer')
  AND permission_code IN ('create','update')
  AND handler_type = 'NAVIGATE';


-- ══════════════════════════════════════════════════════════════════════════════
-- Business Partner base operations
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'business_partner', 'create', 'LIST', 'PRIMARY', 'NAVIGATE', '/app/business_partner/new', false, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner', 'extend', 'DETAIL', 'PRIMARY', 'NAVIGATE', '/app/business_partner/new?mode=extension&bp={id}', true, 20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner', 'export', 'LIST', 'TOOLBAR', 'API', 'export', false, 50, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;


UPDATE control.entity_operation
SET handler_target = CASE
    WHEN permission_code = 'create' THEN '/app/business_partner/new'
    WHEN permission_code = 'extend' THEN '/app/business_partner/new?mode=extension&bp={id}'
    ELSE handler_target
END
WHERE tenant_id IS NULL
  AND entity_name = 'business_partner'
  AND permission_code IN ('create','extend')
  AND handler_type = 'NAVIGATE';


-- ============================================================
-- DOMAIN: Taxonomy migration — permission_code renames
-- SOURCE: 005_domain_registrations/900_operations/001_entity_operations.sql
--         (originally 002_ops_taxonomy_migration.sql section)
-- ============================================================

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_wfl uuid;
    v_fin uuid;
    v_rows int;
BEGIN

SELECT id INTO v_wfl FROM shared.permission_category WHERE code = 'workflow';
SELECT id INTO v_fin  FROM shared.permission_category WHERE code = 'finance';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Ensure new permission codes exist in shared.permission
-- ══════════════════════════════════════════════════════════════════════════════

-- Edit-mode permissions (entity category, low risk, no plan restriction)
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, pc.id, 'record', 'low', false, v.so, v_su
FROM shared.permission_category pc
JOIN (VALUES
    ('edit', 'Edit', 'entity', 30),
    ('exit', 'Exit', 'entity', 35)
) AS v(code, name, cat, so) ON pc.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Business Partner identity is editable in-place; role and company-code growth
-- remains handled by the dedicated Extend flow.
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, icon_override, created_by)
VALUES
    (NULL, 'business_partner', 'edit', 'DETAIL', 'PRIMARY', 'NAVIGATE',
     '/app/business_partner/{id}?mode=edit', true, 10, 'edit', v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

UPDATE control.entity_operation
SET surface            = 'DETAIL',
    placement          = 'PRIMARY',
    handler_type       = 'NAVIGATE',
    handler_target     = '/app/business_partner/{id}?mode=edit',
    is_record_required = true,
    sort_order         = 10,
    icon_override      = 'edit',
    is_enabled         = true
WHERE tenant_id IS NULL
  AND entity_name = 'business_partner'
  AND permission_code = 'edit';

-- Document lifecycle permissions
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
VALUES
    ('cancel_document',  'Cancel Document',  v_wfl, 'record', 'high',     false, 96,  v_su),
    ('reject',           'Reject',           v_wfl, 'record', 'medium',   false, 91,  v_su),
    ('void_document',    'Void Document',    v_fin, 'record', 'high',     false, 25,  v_su),
    ('reverse_document', 'Reverse Document', v_fin, 'record', 'critical', true,  27,  v_su)
ON CONFLICT (code) DO NOTHING;

-- Supplier lifecycle permissions
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
VALUES
    ('block_supplier',      'Block Supplier',      v_wfl, 'record', 'high',   false, 201, v_su),
    ('unblock_supplier',    'Unblock Supplier',    v_wfl, 'record', 'medium', false, 202, v_su),
    ('deactivate_supplier', 'Deactivate Supplier', v_wfl, 'record', 'medium', false, 203, v_su),
    ('reactivate_supplier', 'Reactivate Supplier', v_wfl, 'record', 'medium', false, 204, v_su),
    ('archive_supplier',    'Archive Supplier',    v_wfl, 'record', 'high',   false, 205, v_su)
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2a. Edit-mode: rename update → edit across all platform entity operations
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = 'edit'
WHERE  tenant_id IS NULL
  AND  permission_code = 'update'
  AND  NOT EXISTS (
       SELECT 1 FROM control.entity_operation x
       WHERE  x.tenant_id IS NULL
         AND  x.entity_name     = eo.entity_name
         AND  x.permission_code = 'edit'
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'update → edit renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2c. Document operations — rename permission_code to taxonomy codes
--
-- Guard: skip any row where the target code already exists on that entity
-- (makes every UPDATE a no-op on re-run once the rename has landed).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = r.new_code
FROM (VALUES
    ('purchase_invoice', 'cancel',  'cancel_document'),
    ('purchase_invoice', 'deny',    'reject'),
    ('purchase_invoice', 'reverse', 'reverse_document'),
    ('purchase_order',   'cancel',  'cancel_document'),
    ('purchase_order',   'deny',    'reject'),
    ('journal_entry',    'deny',    'reject'),
    ('journal_entry',    'reverse', 'reverse_document'),
    ('payment_entry',    'cancel',  'cancel_document'),
    ('payment_entry',    'deny',    'reject'),
    ('payment_entry',    'void',    'void_document'),
    ('payment_entry',    'reverse', 'reverse_document')
) AS r(entity_name, old_code, new_code)
WHERE eo.tenant_id IS NULL
  AND eo.entity_name     = r.entity_name
  AND eo.permission_code = r.old_code
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_operation x
      WHERE x.tenant_id IS NULL
        AND x.entity_name     = r.entity_name
        AND x.permission_code = r.new_code
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'Document ops renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2d. Supplier lifecycle operations — rename permission_code to taxonomy codes
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = r.new_code
FROM (VALUES
    ('supplier', 'cancel', 'deactivate_supplier'),
    ('supplier', 'close',  'archive_supplier'),
    ('supplier', 'reopen', 'reactivate_supplier')
) AS r(entity_name, old_code, new_code)
WHERE eo.tenant_id IS NULL
  AND eo.entity_name     = r.entity_name
  AND eo.permission_code = r.old_code
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_operation x
      WHERE x.tenant_id IS NULL
        AND x.entity_name     = r.entity_name
        AND x.permission_code = r.new_code
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'Supplier ops renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Insert new supplier operations: block_supplier / unblock_supplier
--
-- Sort orders slot between deactivate_supplier (30) and archive_supplier (40).
-- handler_target maps to control.lifecycle_transition.operation_code:
--   'block'   → active → blocked  (seeded in 002_supplier_lifecycle.sql)
--   'unblock' → blocked → active  (seeded in 002_supplier_lifecycle.sql)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL, 'supplier', 'block_supplier',   'DETAIL', 'OVERFLOW', 'MODAL', 'block',   true, 32, v_su),
    (NULL, 'supplier', 'unblock_supplier', 'DETAIL', 'OVERFLOW', 'MODAL', 'unblock', true, 34, v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'Taxonomy migration complete. Platform entity_operation total: %',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);

END $$;



-- === SOURCE: 004_ops_budget_banking.sql ===

-- 060_entity_operations/004_ops_budget_banking.sql
-- Entity operation registrations for Budget, Banking, Payment Terms, Products (84–102)
-- Covers: budget_profile, budget_allocation, planning_model,
--         bank_party, bank_account, bank_account_mandate, bank_branch, payment_method,
--         holiday_calendar, holiday_calendar_day, payment_term, payment_term_clause,
--         payment_term_discount_tier, product, item, commodity_category,
--         commodity_classification, company_code_spend_policy
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_profile  (Set F + lock)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'budget_profile','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_profile/new',       false,10,v_su),
    (NULL,'budget_profile','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_profile/{id}/edit', true, 20,v_su),
    (NULL,'budget_profile','submit',  'DETAIL','PRIMARY', 'MODAL',   'submit',                        true, 30,v_su),
    (NULL,'budget_profile','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                       true, 40,v_su),
    (NULL,'budget_profile','deny',    'DETAIL','TOOLBAR', 'MODAL',   'deny',                          true, 50,v_su),
    (NULL,'budget_profile','close',   'DETAIL','OVERFLOW','MODAL',   'lock',                          true, 60,v_su),
    (NULL,'budget_profile','reopen',  'DETAIL','OVERFLOW','MODAL',   'unlock',                        true, 70,v_su),
    (NULL,'budget_profile','cancel',  'DETAIL','OVERFLOW','MODAL',   'cancel',                        true, 80,v_su),
    (NULL,'budget_profile','copy',    'DETAIL','OVERFLOW','API',     'copy',                          true, 90,v_su),
    (NULL,'budget_profile','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                        true,100,v_su),
    (NULL,'budget_profile','export',  'LIST',  'TOOLBAR', 'API',     'export',                        false,110,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- budget_allocation  (Set B + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'budget_allocation','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/budget_allocation/new',       false,10,v_su),
    (NULL,'budget_allocation','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/budget_allocation/{id}/edit', true, 20,v_su),
    (NULL,'budget_allocation','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 30,v_su),
    (NULL,'budget_allocation','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 40,v_su),
    (NULL,'budget_allocation','export',     'LIST',  'TOOLBAR', 'API',     'export',                           false,50,v_su),
    (NULL,'budget_allocation','import',     'LIST',  'TOOLBAR', 'API',     'import',                           false,60,v_su),
    (NULL,'budget_allocation','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                      false,70,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- planning_model  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'planning_model','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/planning_model/new',       false,10,v_su),
    (NULL,'planning_model','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/planning_model/{id}/edit', true, 20,v_su),
    (NULL,'planning_model','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'planning_model','copy',   'DETAIL','OVERFLOW','API',     'copy',                          true, 40,v_su),
    (NULL,'planning_model','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'planning_model','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_party  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'bank_party','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_party/new',       false,10,v_su),
    (NULL,'bank_party','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_party/{id}/edit', true, 20,v_su),
    (NULL,'bank_party','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                true, 30,v_su),
    (NULL,'bank_party','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                true, 40,v_su),
    (NULL,'bank_party','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 50,v_su),
    (NULL,'bank_party','export', 'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_account  (Set C + activate/deactivate)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'bank_account','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/bank_account/new',       false,10,v_su),
    (NULL,'bank_account','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/bank_account/{id}/edit', true, 20,v_su),
    (NULL,'bank_account','cancel', 'DETAIL','TOOLBAR', 'MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'bank_account','reopen', 'DETAIL','TOOLBAR', 'MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'bank_account','close',  'DETAIL','OVERFLOW','MODAL',   'close',                       true, 50,v_su),
    (NULL,'bank_account','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'bank_account','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- bank_branch / payment_method  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'bank_branch',  'create','LIST',  'PRIMARY', 'NAVIGATE','/app/bank_branch/new',       false,10,v_su),
    (NULL,'bank_branch',  'update','DETAIL','PRIMARY', 'NAVIGATE','/app/bank_branch/{id}/edit', true, 20,v_su),
    (NULL,'bank_branch',  'delete','DETAIL','OVERFLOW','MODAL',   'delete',                     true, 30,v_su),
    (NULL,'bank_branch',  'export','LIST',  'TOOLBAR', 'API',     'export',                     false,40,v_su),
    (NULL,'payment_method','create','LIST', 'PRIMARY', 'NAVIGATE','/app/payment_method/new',       false,10,v_su),
    (NULL,'payment_method','update','DETAIL','PRIMARY','NAVIGATE','/app/payment_method/{id}/edit', true, 20,v_su),
    (NULL,'payment_method','cancel','DETAIL','OVERFLOW','MODAL',  'deactivate',                   true, 30,v_su),
    (NULL,'payment_method','delete','DETAIL','OVERFLOW','MODAL',  'delete',                       true, 40,v_su),
    (NULL,'payment_method','export','LIST',  'TOOLBAR','API',     'export',                       false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- payment_term  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'payment_term','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/payment_term/new',       false,10,v_su),
    (NULL,'payment_term','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/payment_term/{id}/edit', true, 20,v_su),
    (NULL,'payment_term','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'payment_term','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'payment_term','copy',   'DETAIL','OVERFLOW','API',     'copy',                        true, 50,v_su),
    (NULL,'payment_term','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 60,v_su),
    (NULL,'payment_term','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,70,v_su),
    (NULL,'payment_term','import', 'LIST',  'TOOLBAR', 'API',     'import',                      false,80,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- holiday_calendar  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'holiday_calendar','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/holiday_calendar/new',       false,10,v_su),
    (NULL,'holiday_calendar','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/holiday_calendar/{id}/edit', true, 20,v_su),
    (NULL,'holiday_calendar','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'holiday_calendar','copy',   'DETAIL','OVERFLOW','API',     'copy',                            true, 40,v_su),
    (NULL,'holiday_calendar','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'holiday_calendar','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- product / item  (Set C: + archived lifecycle)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'product','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/product/new',       false,10,v_su),
    (NULL,'product','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/product/{id}/edit', true, 20,v_su),
    (NULL,'product','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',             true, 30,v_su),
    (NULL,'product','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',             true, 40,v_su),
    (NULL,'product','close',      'DETAIL','OVERFLOW','MODAL',   'archive',                true, 50,v_su),
    (NULL,'product','copy',       'DETAIL','OVERFLOW','API',     'copy',                   true, 60,v_su),
    (NULL,'product','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 70,v_su),
    (NULL,'product','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,80,v_su),
    (NULL,'product','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,90,v_su),
    (NULL,'product','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,100,v_su),

    (NULL,'item','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/item/new',       false,10,v_su),
    (NULL,'item','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/item/{id}/edit', true, 20,v_su),
    (NULL,'item','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',          true, 30,v_su),
    (NULL,'item','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',          true, 40,v_su),
    (NULL,'item','close',      'DETAIL','OVERFLOW','MODAL',   'archive',             true, 50,v_su),
    (NULL,'item','copy',       'DETAIL','OVERFLOW','API',     'copy',                true, 60,v_su),
    (NULL,'item','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',              true, 70,v_su),
    (NULL,'item','export',     'LIST',  'TOOLBAR', 'API',     'export',              false,80,v_su),
    (NULL,'item','import',     'LIST',  'TOOLBAR', 'API',     'import',              false,90,v_su),
    (NULL,'item','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',         false,100,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- commodity_category  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'commodity_category','create','LIST',  'PRIMARY', 'NAVIGATE','/app/commodity_category/new',       false,10,v_su),
    (NULL,'commodity_category','update','DETAIL','PRIMARY', 'NAVIGATE','/app/commodity_category/{id}/edit', true, 20,v_su),
    (NULL,'commodity_category','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 30,v_su),
    (NULL,'commodity_category','delete','DETAIL','OVERFLOW','MODAL',   'delete',                           true, 40,v_su),
    (NULL,'commodity_category','export','LIST',  'TOOLBAR', 'API',     'export',                           false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: bank_account_mandate, payment_term_clause,
--                     payment_term_discount_tier, commodity_classification,
--                     company_code_spend_policy, holiday_calendar_day
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'bank_account_mandate',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'bank_account_mandate',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'payment_term_clause',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_clause',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_clause',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'payment_term_discount_tier', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'payment_term_discount_tier', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'payment_term_discount_tier', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'holiday_calendar_day',       'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'holiday_calendar_day',       'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'holiday_calendar_day',       'import','LIST',  'TOOLBAR', 'API',  'import',false,30,v_su),
    (NULL,'commodity_classification',   'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'commodity_classification',   'update','DETAIL','PRIMARY', 'NAVIGATE','/app/commodity_classification/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_classification',   'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Budget/Banking/Products seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;



-- === SOURCE: 005_ops_templates_docs.sql ===

-- 060_entity_operations/005_ops_templates_docs.sql
-- Entity operation registrations for DOC/WFL entities (41–48)
-- Covers: document_template, document_template_clause, workflow_definition,
--         workflow_template, workflow_template_stage, workflow_template_rule,
--         trigger_rule, print_profile
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- document_template  (Set F: create/update/delete/export/submit/activate/copy)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'document_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/document_template/new',       false,10,v_su),
    (NULL,'document_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/document_template/{id}/edit', true, 20,v_su),
    (NULL,'document_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'document_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'document_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'document_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'document_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'document_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'document_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su),
    (NULL,'document_template','import',  'LIST',  'TOOLBAR', 'API',     'import',                           false,100,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_definition  (Set F: template-like workflow)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'workflow_definition','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_definition/new',       false,10,v_su),
    (NULL,'workflow_definition','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_definition/{id}/edit', true, 20,v_su),
    (NULL,'workflow_definition','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                             true, 30,v_su),
    (NULL,'workflow_definition','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                            true, 40,v_su),
    (NULL,'workflow_definition','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                         true, 50,v_su),
    (NULL,'workflow_definition','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                         true, 60,v_su),
    (NULL,'workflow_definition','copy',    'DETAIL','OVERFLOW','API',     'copy',                               true, 70,v_su),
    (NULL,'workflow_definition','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                             true, 80,v_su),
    (NULL,'workflow_definition','export',  'LIST',  'TOOLBAR', 'API',     'export',                             false,90,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- workflow_template  (Set F)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'workflow_template','create',  'LIST',  'PRIMARY', 'NAVIGATE','/app/workflow_template/new',       false,10,v_su),
    (NULL,'workflow_template','update',  'DETAIL','PRIMARY', 'NAVIGATE','/app/workflow_template/{id}/edit', true, 20,v_su),
    (NULL,'workflow_template','submit',  'DETAIL','TOOLBAR', 'MODAL',   'submit',                           true, 30,v_su),
    (NULL,'workflow_template','approve', 'DETAIL','TOOLBAR', 'MODAL',   'approve',                          true, 40,v_su),
    (NULL,'workflow_template','cancel',  'DETAIL','OVERFLOW','MODAL',   'deactivate',                       true, 50,v_su),
    (NULL,'workflow_template','reopen',  'DETAIL','OVERFLOW','MODAL',   'reactivate',                       true, 60,v_su),
    (NULL,'workflow_template','copy',    'DETAIL','OVERFLOW','API',     'copy',                             true, 70,v_su),
    (NULL,'workflow_template','delete',  'DETAIL','OVERFLOW','MODAL',   'delete',                           true, 80,v_su),
    (NULL,'workflow_template','export',  'LIST',  'TOOLBAR', 'API',     'export',                           false,90,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- trigger_rule  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'trigger_rule','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/trigger_rule/new',       false,10,v_su),
    (NULL,'trigger_rule','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/trigger_rule/{id}/edit', true, 20,v_su),
    (NULL,'trigger_rule','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                  true, 30,v_su),
    (NULL,'trigger_rule','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                  true, 40,v_su),
    (NULL,'trigger_rule','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 50,v_su),
    (NULL,'trigger_rule','export', 'LIST',  'TOOLBAR', 'API',     'export',                      false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- print_profile  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'print_profile','create','LIST',  'PRIMARY', 'NAVIGATE','/app/print_profile/new',       false,10,v_su),
    (NULL,'print_profile','update','DETAIL','PRIMARY', 'NAVIGATE','/app/print_profile/{id}/edit', true, 20,v_su),
    (NULL,'print_profile','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'print_profile','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'print_profile','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION: document_template_clause, workflow_template_stage,
--                     workflow_template_rule  (Set G)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'document_template_clause','create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'document_template_clause','update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'document_template_clause','delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_stage', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_stage', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_stage', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'workflow_template_rule',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'workflow_template_rule',  'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'workflow_template_rule',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Templates/Docs/Workflow seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;



-- === SOURCE: 006_ops_master_data.sql ===

-- 060_entity_operations/006_ops_master_data.sql
-- Entity operation registrations for Dimensions, Tax/FX, NTF, CMS/ACT (75–86 + 27–40)
-- Covers: dimension_type, dimension_value, cost_center_dimension_map,
--         profit_center_dimension_map, project_dimension_map,
--         company_code_dimension_default, tax_jurisdiction, tax_type, fx_rate,
--         notification, notification_default, attachment, comment, conversation,
--         reaction, draft, flag_submission, activity_event, comment_flag,
--         comment_draft, comment_feed_cursor
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_type / dimension_value  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'dimension_type','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_type/new',       false,10,v_su),
    (NULL,'dimension_type','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_type/{id}/edit', true, 20,v_su),
    (NULL,'dimension_type','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                    true, 30,v_su),
    (NULL,'dimension_type','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                    true, 40,v_su),
    (NULL,'dimension_type','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                        true, 50,v_su),
    (NULL,'dimension_type','export', 'LIST',  'TOOLBAR', 'API',     'export',                        false,60,v_su),

    (NULL,'dimension_value','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_value/new',       false,10,v_su),
    (NULL,'dimension_value','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_value/{id}/edit', true, 20,v_su),
    (NULL,'dimension_value','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',                     true, 30,v_su),
    (NULL,'dimension_value','reopen',     'DETAIL','OVERFLOW','MODAL',   'reactivate',                     true, 40,v_su),
    (NULL,'dimension_value','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                         true, 50,v_su),
    (NULL,'dimension_value','export',     'LIST',  'TOOLBAR', 'API',     'export',                         false,60,v_su),
    (NULL,'dimension_value','import',     'LIST',  'TOOLBAR', 'API',     'import',                         false,70,v_su),
    (NULL,'dimension_value','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',                    false,80,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- tax_jurisdiction / tax_type  (Set B + import)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'tax_jurisdiction','create', 'LIST',  'PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/new',       false,10,v_su),
    (NULL,'tax_jurisdiction','update', 'DETAIL','PRIMARY', 'NAVIGATE','/app/tax_jurisdiction/{id}/edit', true, 20,v_su),
    (NULL,'tax_jurisdiction','cancel', 'DETAIL','OVERFLOW','MODAL',   'deactivate',                      true, 30,v_su),
    (NULL,'tax_jurisdiction','reopen', 'DETAIL','OVERFLOW','MODAL',   'reactivate',                      true, 40,v_su),
    (NULL,'tax_jurisdiction','delete', 'DETAIL','OVERFLOW','MODAL',   'delete',                          true, 50,v_su),
    (NULL,'tax_jurisdiction','export', 'LIST',  'TOOLBAR', 'API',     'export',                          false,60,v_su),
    (NULL,'tax_jurisdiction','import', 'LIST',  'TOOLBAR', 'API',     'import',                          false,70,v_su),

    (NULL,'tax_type','create','LIST',  'PRIMARY', 'NAVIGATE','/app/tax_type/new',       false,10,v_su),
    (NULL,'tax_type','update','DETAIL','PRIMARY', 'NAVIGATE','/app/tax_type/{id}/edit', true, 20,v_su),
    (NULL,'tax_type','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',              true, 30,v_su),
    (NULL,'tax_type','reopen','DETAIL','OVERFLOW','MODAL',   'reactivate',              true, 40,v_su),
    (NULL,'tax_type','delete','DETAIL','OVERFLOW','MODAL',   'delete',                  true, 50,v_su),
    (NULL,'tax_type','export','LIST',  'TOOLBAR', 'API',     'export',                  false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- fx_rate  (Set A + import + bulk_update)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'fx_rate','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/fx_rate/new',       false,10,v_su),
    (NULL,'fx_rate','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/fx_rate/{id}/edit', true, 20,v_su),
    (NULL,'fx_rate','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                 true, 30,v_su),
    (NULL,'fx_rate','export',     'LIST',  'TOOLBAR', 'API',     'export',                 false,40,v_su),
    (NULL,'fx_rate','import',     'LIST',  'TOOLBAR', 'API',     'import',                 false,50,v_su),
    (NULL,'fx_rate','bulk_update','LIST',  'TOOLBAR', 'API',     'bulk_update',            false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- notification  (Set H: read + export)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'notification','read',   'LIST',  'TOOLBAR','NAVIGATE','/app/notification/{id}',false,10,v_su),
    (NULL,'notification','delete', 'DETAIL','OVERFLOW','MODAL',  'delete',                 true, 20,v_su),
    (NULL,'notification','export', 'LIST',  'TOOLBAR', 'API',    'export',                 false,30,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- attachment  (Set A + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'attachment','create',          'LIST',  'PRIMARY', 'MODAL','upload',              false,10,v_su),
    (NULL,'attachment','add_attachment',  'LIST',  'PRIMARY', 'MODAL','upload',              false,15,v_su),
    (NULL,'attachment','update',          'DETAIL','PRIMARY', 'MODAL','edit',                true, 20,v_su),
    (NULL,'attachment','delete',          'DETAIL','OVERFLOW','MODAL','delete',              true, 30,v_su),
    (NULL,'attachment','export',          'LIST',  'TOOLBAR', 'API',  'export',              false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- comment  (add_comment, flag, delete own)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'comment','create',              'LIST',  'PRIMARY', 'MODAL','add_comment',         false,10,v_su),
    (NULL,'comment','add_comment',         'LIST',  'PRIMARY', 'MODAL','add_comment',         false,15,v_su),
    (NULL,'comment','update',              'DETAIL','PRIMARY', 'MODAL','edit_comment',        true, 20,v_su),
    (NULL,'comment','delete',              'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 30,v_su),
    (NULL,'comment','del_others_comment',  'DETAIL','OVERFLOW','MODAL','delete_comment',      true, 35,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- conversation  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'conversation','create','LIST',  'PRIMARY', 'MODAL','create',  false,10,v_su),
    (NULL,'conversation','update','DETAIL','PRIMARY', 'MODAL','edit',    true, 20,v_su),
    (NULL,'conversation','close', 'DETAIL','OVERFLOW','MODAL','close',   true, 30,v_su),
    (NULL,'conversation','delete','DETAIL','OVERFLOW','MODAL','delete',  true, 40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL / RELATION dimension maps  (Set G)
-- cost_center_dimension_map, profit_center_dimension_map,
-- project_dimension_map, company_code_dimension_default
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'cost_center_dimension_map',    'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'cost_center_dimension_map',    'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'profit_center_dimension_map',  'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'profit_center_dimension_map',  'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'project_dimension_map',        'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'project_dimension_map',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'company_code_dimension_default','update','DETAIL','PRIMARY','MODAL','edit',  true, 10,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: Dimensions/Tax/NTF/CMS/ACT seeded (% total so far)',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;


-- === SOURCE: 300_control/001_control_rule_entities.sql ===
DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'commodity_classification_to_intent_rule',    'create','LIST',  'PRIMARY', 'NAVIGATE','/app/commodity_classification_to_intent_rule/new',false,10,v_su),
    (NULL,'commodity_classification_to_intent_rule',    'edit',  'DETAIL','PRIMARY', 'NAVIGATE','/app/commodity_classification_to_intent_rule/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_classification_to_intent_rule',    'export','LIST',  'TOOLBAR', 'API',  'export',false,40,v_su),
    (NULL,'commodity_classification',          'edit',  'DETAIL','PRIMARY', 'NAVIGATE','/app/commodity_classification/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_code_to_category_rule', 'create','LIST',  'PRIMARY', 'NAVIGATE','/app/commodity_code_to_category_rule/new',false,10,v_su),
    (NULL,'commodity_code_to_category_rule', 'edit',  'DETAIL','PRIMARY', 'NAVIGATE','/app/commodity_code_to_category_rule/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_code_to_category_rule', 'export','LIST',  'TOOLBAR', 'API',  'export',false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO UPDATE
   SET surface            = EXCLUDED.surface,
       placement          = EXCLUDED.placement,
       handler_type       = EXCLUDED.handler_type,
       handler_target     = EXCLUDED.handler_target,
       is_record_required = EXCLUDED.is_record_required,
       sort_order         = EXCLUDED.sort_order,
       is_enabled         = true,
       updated_at         = now(),
       updated_by         = v_su;

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'commodity_category_buy_policy',     'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_buy_policy/new',false,10,v_su),
    (NULL,'commodity_category_buy_policy',     'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_buy_policy/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_category_buy_policy',     'export','LIST',  'TOOLBAR','API','export',false,40,v_su),
    (NULL,'commodity_category_sell_policy',     'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_sell_policy/new',false,10,v_su),
    (NULL,'commodity_category_sell_policy',     'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_sell_policy/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_category_sell_policy',     'export','LIST',  'TOOLBAR','API','export',false,40,v_su),
    (NULL,'commodity_category_inventory_policy', 'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_inventory_policy/new',false,10,v_su),
    (NULL,'commodity_category_inventory_policy', 'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_inventory_policy/{id}?mode=edit',true,20,v_su),
    (NULL,'commodity_category_inventory_policy', 'export','LIST',  'TOOLBAR','API','export',false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO UPDATE
   SET surface            = EXCLUDED.surface,
       placement          = EXCLUDED.placement,
       handler_type       = EXCLUDED.handler_type,
       handler_target     = EXCLUDED.handler_target,
       is_record_required = EXCLUDED.is_record_required,
       sort_order         = EXCLUDED.sort_order,
       is_enabled         = true,
       updated_at         = now(),
       updated_by         = v_su;

END $$;



-- === SOURCE: 007_ops_ui_cms.sql ===

-- 060_entity_operations/007_ops_ui_cms.sql
-- Entity operation registrations for UI + CMS entities (103–111)
-- and remaining NTF / tenant_notification_profile CONTROL entities
-- Covers: principal_ui_profile, principal_ui_preference, saved_view, dashboard,
--         dashboard_widget, principal_notification_preference,
--         content_item, content_item_link, content_item_access_grant,
--         notification_default, tenant_notification_profile
-- Also seeds: dimension_set (75–80 group, missed in 006)
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING

DO $$
DECLARE v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- saved_view  (Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'saved_view','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/saved_view/new',       false,10,v_su),
    (NULL,'saved_view','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/saved_view/{id}/edit', true, 20,v_su),
    (NULL,'saved_view','cancel',     'DETAIL','OVERFLOW','MODAL',   'archive',                   true, 30,v_su),
    (NULL,'saved_view','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                    true, 40,v_su),
    (NULL,'saved_view','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                     true, 50,v_su),
    (NULL,'saved_view','export',     'LIST',  'TOOLBAR', 'API',     'export',                    false,60,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dashboard  (Set B + share)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'dashboard','create',     'LIST',  'PRIMARY', 'NAVIGATE','/app/dashboard/new',       false,10,v_su),
    (NULL,'dashboard','update',     'DETAIL','PRIMARY', 'NAVIGATE','/app/dashboard/{id}/edit', true, 20,v_su),
    (NULL,'dashboard','cancel',     'DETAIL','OVERFLOW','MODAL',   'deactivate',               true, 30,v_su),
    (NULL,'dashboard','delete',     'DETAIL','OVERFLOW','MODAL',   'delete',                   true, 40,v_su),
    (NULL,'dashboard','share_read', 'DETAIL','OVERFLOW','MODAL',   'share',                    true, 50,v_su),
    (NULL,'dashboard','copy',       'DETAIL','OVERFLOW','API',     'copy',                     true, 60,v_su),
    (NULL,'dashboard','export',     'LIST',  'TOOLBAR', 'API',     'export',                   false,70,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- content_item  (Set F + share + add_attachment)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'content_item','create',         'LIST',  'PRIMARY', 'NAVIGATE','/app/content_item/new',       false,10,v_su),
    (NULL,'content_item','update',         'DETAIL','PRIMARY', 'NAVIGATE','/app/content_item/{id}/edit', true, 20,v_su),
    (NULL,'content_item','submit',         'DETAIL','TOOLBAR', 'MODAL',   'submit',                      true, 30,v_su),
    (NULL,'content_item','approve',        'DETAIL','TOOLBAR', 'MODAL',   'approve',                     true, 40,v_su),
    (NULL,'content_item','cancel',         'DETAIL','OVERFLOW','MODAL',   'unpublish',                   true, 50,v_su),
    (NULL,'content_item','reopen',         'DETAIL','OVERFLOW','MODAL',   'republish',                   true, 60,v_su),
    (NULL,'content_item','close',          'DETAIL','OVERFLOW','MODAL',   'archive',                     true, 70,v_su),
    (NULL,'content_item','copy',           'DETAIL','OVERFLOW','API',     'copy',                        true, 80,v_su),
    (NULL,'content_item','delete',         'DETAIL','OVERFLOW','MODAL',   'delete',                      true, 90,v_su),
    (NULL,'content_item','share_read',     'DETAIL','OVERFLOW','MODAL',   'share',                       true,100,v_su),
    (NULL,'content_item','add_attachment', 'DETAIL','OVERFLOW','MODAL',   'attach',                      true,110,v_su),
    (NULL,'content_item','export',         'LIST',  'TOOLBAR', 'API',     'export',                      false,120,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROL: principal_ui_profile, principal_ui_preference,
--          principal_notification_preference, notification_default,
--          content_item_link, content_item_access_grant, dashboard_widget
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'principal_ui_profile',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 10,v_su),
    (NULL,'principal_ui_preference',        'delete','DETAIL','OVERFLOW','MODAL','delete',true, 20,v_su),
    (NULL,'principal_notification_preference','update','DETAIL','PRIMARY','MODAL','edit', true, 10,v_su),
    (NULL,'notification_default',           'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
    (NULL,'notification_default',           'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'notification_default',           'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'content_item_access_grant',      'create','LIST',  'PRIMARY', 'MODAL','grant', false,10,v_su),
    (NULL,'content_item_access_grant',      'cancel','DETAIL','PRIMARY', 'MODAL','revoke',true, 20,v_su),
    (NULL,'content_item_access_grant',      'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
    (NULL,'dashboard_widget',               'create','LIST',  'PRIMARY', 'MODAL','add_widget',false,10,v_su),
    (NULL,'dashboard_widget',               'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
    (NULL,'dashboard_widget',               'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- dimension_set  (missed in 006 — Set B)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'dimension_set','create','LIST',  'PRIMARY', 'NAVIGATE','/app/dimension_set/new',       false,10,v_su),
    (NULL,'dimension_set','update','DETAIL','PRIMARY', 'NAVIGATE','/app/dimension_set/{id}/edit', true, 20,v_su),
    (NULL,'dimension_set','cancel','DETAIL','OVERFLOW','MODAL',   'deactivate',                   true, 30,v_su),
    (NULL,'dimension_set','delete','DETAIL','OVERFLOW','MODAL',   'delete',                       true, 40,v_su),
    (NULL,'dimension_set','export','LIST',  'TOOLBAR', 'API',     'export',                       false,50,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- gl_account_hierarchy  (Set A)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id::uuid,
    v.entity_name::text,
    v.permission_code::text,
    v.surface::text,
    v.placement::text,
    v.handler_type::text,
    v.handler_target::text,
    v.is_record_required::boolean,
    v.sort_order::integer,
    v.created_by::uuid
FROM (VALUES
    (NULL,'gl_account_hierarchy','create','LIST',  'PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/new',       false,10,v_su),
    (NULL,'gl_account_hierarchy','update','DETAIL','PRIMARY', 'NAVIGATE','/app/gl_account_hierarchy/{id}/edit', true, 20,v_su),
    (NULL,'gl_account_hierarchy','delete','DETAIL','OVERFLOW','MODAL',   'delete',                              true, 30,v_su),
    (NULL,'gl_account_hierarchy','export','LIST',  'TOOLBAR', 'API',     'export',                              false,40,v_su)
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
WHERE EXISTS (
    SELECT 1
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.entity_code = v.entity_name
)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'entity_operation: UI/CMS + remaining entities seeded';
RAISE NOTICE 'entity_operation: TOTAL system-global operations = %',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);
END $$;



-- === SOURCE: 008_ops_master_schema_coverage.sql ===

-- Baseline UI/API operations for master-schema coverage entities.
-- Export is safe for read-only projections; write operations are limited to
-- table-backed, non-locked coverage entities so sensitive bindings stay guarded
-- by explicit domain permissions and policies.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000001';
    v_rows integer := 0;
BEGIN
    INSERT INTO control.entity_operation (
        tenant_id,
        entity_name,
        permission_code,
        surface,
        placement,
        handler_type,
        handler_target,
        is_record_required,
        sort_order,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        op.permission_code,
        op.surface,
        op.placement,
        op.handler_type,
        op.handler_target,
        op.is_record_required,
        op.sort_order,
        v_system_user
    FROM control.entity e
    CROSS JOIN LATERAL (
        VALUES
            ('export', 'LIST', 'TOOLBAR', 'API', 'export', false, 40)
    ) AS op(permission_code, surface, placement, handler_type, handler_target, is_record_required, sort_order)
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage export operations inserted %', v_rows;

    INSERT INTO control.entity_operation (
        tenant_id,
        entity_name,
        permission_code,
        surface,
        placement,
        handler_type,
        handler_target,
        is_record_required,
        sort_order,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        op.permission_code,
        op.surface,
        op.placement,
        op.handler_type,
        replace(op.handler_target, '{entity}', e.entity_code),
        op.is_record_required,
        op.sort_order,
        v_system_user
    FROM control.entity e
    CROSS JOIN LATERAL (
        VALUES
            ('create', 'LIST',   'PRIMARY',  'NAVIGATE', '/app/{entity}/new',       false, 10),
            ('update', 'DETAIL', 'PRIMARY',  'NAVIGATE', '/app/{entity}/{id}/edit', true,  20),
            ('delete', 'DETAIL', 'OVERFLOW', 'MODAL',    'delete',                 true,  30)
    ) AS op(permission_code, surface, placement, handler_type, handler_target, is_record_required, sort_order)
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.backing_type = 'table'
      AND e.entity_class <> 'LOG'
      AND e.mutability <> 'locked'
      AND COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) = false
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage write operations inserted %', v_rows;
END $$;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/100_master/015_partner_policies_and_flows.sql
-- ============================================================



-- === SOURCE: 019_company_code_supplier_spend_policy.sql ===
-- 100_master/019_company_code_supplier_spend_policy.sql
-- Retired metadata cleanup.
-- Supplier-scoped buy behavior is now registered by
-- control.commodity_category_buy_policy with commodity_category_id.

DELETE FROM control.entity_operation
 WHERE entity_name = 'company_code_supplier_spend_policy';


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/300_control/001_control_rule_entities.sql
-- ============================================================


-- === SOURCE: 001_spend_category_rule_apps.sql ===
-- 300_control/001_commodity_category_rule_apps.sql
-- Purpose: expose commodity-category rule tables through the generic entity app runtime.
-- Idempotent: upserts entity rows, version 1, fields, display config, and operations.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc uuid;
    v_rel uuid;
BEGIN
    SELECT id INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id INTO v_rel FROM shared.module WHERE code = 'REL';

    -- Entity registrations moved to 004_entity_engine/020_entities/006_domain_entities.sql

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, enum_domain_code, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, lookup_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.enum_domain_code, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.lookup_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('classification_source', 'classification_source', 'Classification Source', 'enum',       'select',    'one',         'control.classification_source'::text,       true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, '{"value_case":"upper"}'::jsonb,  10),
        ('classification_id',     'classification_id',     'Commodity Category',     'uuid',       'reference', 'one',         NULL::text,                                      true,  true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 20),
        ('condition_type',        'condition_type',        'Condition Type',         'enum',       'select',    'one',         'control.classification_condition_type'::text, true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, '{"value_case":"upper"}'::jsonb,  30),
        ('condition_config',      'condition_config',      'Condition Config',       'jsonb',      'json',      'one',         NULL::text,                                      true,  false, false, false, NULL::jsonb, NULL::jsonb, NULL::jsonb,  40),
        ('applies_to_flows',      'applies_to_flows',      'Applies To Flows',       'text_array', 'json',      'many',        NULL::text,                                      false, true,  false, false, NULL::jsonb, NULL::jsonb, NULL::jsonb,  50),
        ('resolved_intent_id',    'resolved_intent_id',    'Resolved Intent',        'uuid',       'reference', 'one',         NULL::text,                                      true,  true,  false, false, '{"ref_entity":"business_intent"}'::jsonb, '{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 60),
        ('resolved_domain',       'resolved_domain',       'Resolved Domain',        'enum',       'select',    'zero_or_one','control.accounting_domain'::text,             false, true,  true,  true,  NULL::jsonb, NULL::jsonb, '{"value_case":"upper"}'::jsonb,  70),
        ('direction',             'direction',             'Direction',              'enum',       'select',    'zero_or_one','control.classification_direction'::text,      false, true,  true,  false, NULL::jsonb, NULL::jsonb, '{"value_case":"upper"}'::jsonb,  80),
        ('explanation_template',  'explanation_template',  'Explanation',           'text',       'textarea',  'one',         NULL::text,                                      true,  false, false, true,  NULL::jsonb, NULL::jsonb, NULL::jsonb,  90),
        ('confidence',            'confidence',            'Confidence',            'decimal',    'number',    'one',         NULL::text,                                      true,  true,  true,  false, '{"min":0,"max":1}'::jsonb, NULL::jsonb, NULL::jsonb, 100),
        ('priority',              'priority',              'Priority',              'integer',    'number',    'one',         NULL::text,                                      true,  true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, NULL::jsonb, 110),
        ('effective_from',        'effective_from',        'Effective From',         'date',       'date',      'one',         NULL::text,                                      true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 120),
        ('effective_to',          'effective_to',          'Effective To',           'date',       'date',      'zero_or_one',NULL::text,                                      false, true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 130),
        ('status',                'status',                'Status',                 'lifecycle_state','select','one',       NULL::text,                                      true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 140)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, lookup_config, sort_order)
    WHERE e.entity_code = 'commodity_classification_to_intent_rule'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('commodity_domain_code', 'commodity_domain_code', 'Commodity Domain', 'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 10),
        ('match_mode',            'match_mode',            'Match Mode',       'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 20),
        ('code_from',             'code_from',             'Code From',        'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 30),
        ('code_to',               'code_to',               'Code To',          'string',  'text',      'zero_or_one',false, true,  true,  true,  NULL::jsonb, NULL::jsonb, 40),
        ('code_level',            'code_level',            'Code Level',       'integer', 'number',    'zero_or_one',false, true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, 50),
        ('commodity_category_id', 'commodity_category_id', 'Commodity Category','uuid',    'reference', 'one',         true,  true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, 60),
        ('priority',              'priority',              'Priority',         'integer', 'number',    'one',         true,  true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, 70),
        ('confidence',            'confidence',            'Confidence',       'decimal', 'number',    'one',         true,  true,  true,  false, '{"min":0,"max":100}'::jsonb, NULL::jsonb, 80),
        ('status',                'status',                'Status',           'lifecycle_state','select','one',      true,  true,  true,  false, NULL::jsonb, NULL::jsonb, 90)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, sort_order)
    WHERE e.entity_code = 'commodity_code_to_category_rule'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('classification_id','condition_type','resolved_intent_id','priority','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('classification_source','condition_type','resolved_domain','explanation_template'),
               'default_sort_field', 'priority',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['classification_source','classification_id','condition_type','resolved_intent_id','priority']::text[]), true)
     WHERE entity_code = 'commodity_classification_to_intent_rule'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_domain_code','match_mode','code_from','code_to','commodity_category_id','priority','status'),
               'search_fields',      jsonb_build_array('commodity_domain_code','match_mode','code_from','code_to'),
               'default_sort_field', 'priority',
               'default_sort_order', 'desc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['commodity_domain_code','code_from','priority']::text[]), true)
     WHERE entity_code = 'commodity_code_to_category_rule'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_computed, compute_mode, compute_expr,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.is_read_only, f.is_computed, f.compute_mode, f.compute_expr,
           f.validation, f.reference_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('code_id',      'code_id',      'Code Record', 'uuid',    'reference', 'one',         'standard', true,  false, false, false, true,  false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 170),
        ('confidence',   'confidence',   'Confidence',  'decimal', 'number',    'zero_or_one', 'standard', false, true,  true,  false, false, false, NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, NULL::jsonb, 180),
        ('provenance',   'provenance',   'Provenance',  'string',  'text',      'one',         'standard', true,  true,  true,  true,  false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 190),
        ('description',  'description',  'Description', 'text',    'textarea',  'zero_or_one', 'standard', false, false, false, true,  false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 200),
        ('status',       'status',       'Status',      'lifecycle_state','select','one',      'standard', true,  true,  true,  false, false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 210),
        ('system_code',  'system_code',  'Code',        'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 220),
        ('system_name',  'system_name',  'Code Name',   'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 230),
        ('system_label', 'system_label', 'Code Label',  'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 240)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, origin, is_required,
           is_filterable, is_sortable, is_searchable, is_read_only, is_computed,
           compute_mode, compute_expr, validation, reference_config, sort_order)
    WHERE e.entity_code = 'commodity_classification'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('system_code','system_name','domain_code','mapping_type','confidence','is_primary','status'),
               'search_fields',      jsonb_build_array('domain_code','mapping_type','provenance','description'),
               'default_sort_field', 'created_at',
               'default_sort_dir',   'desc',
               'default_sort_order', 'desc'
           ),
           feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object(
               'requires_owner_type_scope', true,
               'owner_type_column', 'owner_type',
               'default_owner_type_scope', 'commodity_category'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['owner_type','owner_id','classification_type','domain_code','code_id']::text[]), true)
     WHERE entity_code = 'commodity_classification'
       AND tenant_id IS NULL;

    -- entity_lifecycle binding moved to 004_entity_engine/050_lifecycle_and_field_bindings.sql

    UPDATE control.entity_field ef
       SET label            = COALESCE(ref_fix.label, ef.label),
           data_type        = 'uuid',
           ui_type          = 'reference',
           validation       = COALESCE(ef.validation, ref_fix.validation),
           reference_config = ref_fix.reference_config,
           updated_at       = now(),
           updated_by       = v_su
      FROM (VALUES
        ('supplier_commodity_category',              'supplier_id',                 NULL,       '{"ref_entity":"supplier"}'::jsonb,            '{"target_entity":"supplier","target_field":"id","display_field":"supplier_code","picker":{"code_field":"supplier_code","show_code":false}}'::jsonb),
        ('supplier_commodity_category',              'commodity_category_id',       NULL,       '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_classification_to_intent_rule',            'classification_id',           'Commodity Category', '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_classification_to_intent_rule',            'resolved_intent_id',          NULL,       '{"ref_entity":"business_intent"}'::jsonb,     '{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_code_to_category_rule',         'commodity_category_id',       NULL,       '{"ref_entity":"commodity_category"}'::jsonb,  '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_classification',                 'owner_id',                    'Commodity Category', '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb)
      ) AS ref_fix(entity_code, field_name, label, validation, reference_config),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.entity_code = ref_fix.entity_code
       AND e2.tenant_id IS NULL
       AND ev2.version_no = 1
       AND (
            ef.label IS DISTINCT FROM COALESCE(ref_fix.label, ef.label)
         OR ef.data_type IS DISTINCT FROM 'uuid'
         OR ef.ui_type IS DISTINCT FROM 'reference'
         OR ef.reference_config IS DISTINCT FROM ref_fix.reference_config
         OR (ef.validation IS NULL AND ref_fix.validation IS NOT NULL)
       );

    UPDATE control.entity_field ef
       SET data_type        = enum_fix.data_type,
           ui_type          = enum_fix.ui_type,
           enum_domain_code = enum_fix.enum_domain_code,
           enum_config      = NULL,
           lookup_config    = COALESCE(ef.lookup_config, '{}'::jsonb) || enum_fix.lookup_config,
           updated_at       = now(),
           updated_by       = v_su
      FROM (VALUES
        ('commodity_classification_to_intent_rule'::text, 'classification_source'::text, 'enum'::text, 'select'::text, 'control.classification_source'::text,       '{"value_case":"upper"}'::jsonb),
        ('commodity_classification_to_intent_rule',       'condition_type',              'enum',       'select',       'control.classification_condition_type', '{"value_case":"upper"}'::jsonb),
        ('commodity_classification_to_intent_rule',       'resolved_domain',             'enum',       'select',       'control.accounting_domain',             '{"value_case":"upper"}'::jsonb),
        ('commodity_classification_to_intent_rule',       'direction',                   'enum',       'select',       'control.classification_direction',      '{"value_case":"upper"}'::jsonb)
      ) AS enum_fix(entity_code, field_name, data_type, ui_type, enum_domain_code, lookup_config),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = enum_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.entity_code = enum_fix.entity_code
       AND e2.tenant_id IS NULL
       AND ev2.version_no = 1
       AND (
            ef.data_type IS DISTINCT FROM enum_fix.data_type
         OR ef.ui_type IS DISTINCT FROM enum_fix.ui_type
         OR ef.enum_domain_code IS DISTINCT FROM enum_fix.enum_domain_code
         OR ef.enum_config IS NOT NULL
         OR (COALESCE(ef.lookup_config, '{}'::jsonb) ->> 'value_case') IS DISTINCT FROM (enum_fix.lookup_config ->> 'value_case')
       );

    UPDATE control.entity_field ef
       SET is_read_only = false,
           updated_at   = now(),
           updated_by   = v_su
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
      JOIN (VALUES
        ('commodity_classification_to_intent_rule'::text, ARRAY[
            'classification_source','classification_id','condition_type','condition_config',
            'applies_to_flows','resolved_intent_id','resolved_domain','direction',
            'explanation_template','confidence','priority','effective_from','effective_to'
        ]::text[]),
        ('commodity_code_to_category_rule', ARRAY[
            'commodity_domain_code','match_mode','code_from','code_to','code_level',
            'commodity_category_id','priority','confidence'
        ]::text[]),
        ('commodity_classification', ARRAY[
            'owner_type','owner_id','classification_type','domain_code','code_id',
            'mapping_type','is_primary','confidence','provenance','description'
        ]::text[])
      ) AS editable(entity_code, field_names) ON editable.entity_code = e.entity_code
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = ANY(editable.field_names)
       AND ef.is_read_only = true;

    -- entity_operation inserts moved to 060_entity_operations/006_ops_master_data.sql

    DELETE FROM control.entity_operation
     WHERE tenant_id IS NULL
       AND (
           (entity_name IN ('commodity_classification_to_intent_rule', 'commodity_code_to_category_rule')
            AND permission_code IN ('update', 'delete'))
           OR
           (entity_name = 'commodity_classification'
            AND permission_code = 'update')
       );

    RAISE NOTICE '005_domain_registrations/300_control/001_commodity_category_rule_apps: done';
END $$;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/900_operations/001_entity_operations.sql
-- ============================================================

-- Entity operations moved to 004_entity_engine/060_entity_operations/
-- This file is retained as a placeholder.
--
-- Finance document operations (purchase_invoice, purchase_order, journal_entry,
-- payment_entry, purchase_invoice_line) have been consolidated into:
--   004_entity_engine/060_entity_operations/002_ops_finance_org.sql
--
-- Supplier / Customer / Business Partner base operations and the taxonomy
-- migration DO block (update→edit rename, document/supplier code renames,
-- block_supplier / unblock_supplier inserts) have been consolidated into:
--   004_entity_engine/060_entity_operations/003_ops_coa_partners.sql
