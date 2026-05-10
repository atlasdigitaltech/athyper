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
            numbering_active, feature_flags, display_config, natural_key_fields,
            status, created_by
        )
        VALUES (
            v_module_id, r.table_name, r.entity_short, r.table_name, r.entity_class,
            'system', 'ent', 'table', 'full',
            r.security_tier, r.mutability, r.table_schema, r.table_name,
            r.label_singular, r.label_plural, r.icon_key, r.color_token,
            true, jsonb_build_object('workspace', 'PPL', 'phase', 'phase1'),
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
            v_natural_key_fields,
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
            natural_key_fields = EXCLUDED.natural_key_fields,
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
