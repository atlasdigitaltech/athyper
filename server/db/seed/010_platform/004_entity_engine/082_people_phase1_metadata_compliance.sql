-- entity_engine/082_people_phase1_metadata_compliance.sql
-- Purpose: Repair Phase 1 People Management entity metadata on databases where
-- the original PPL entity seed ran before display_config/natural_key_fields were
-- mandatory for runtime routing compliance.

WITH ppl_entities AS (
    SELECT
        e.id AS entity_id,
        e.name AS entity_name,
        e.table_schema,
        e.table_name,
        e.display_config,
        e.identity_config,
        ev.id AS entity_version_id
    FROM control.entity e
    JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.status = 'EFFECTIVE'
    WHERE e.tenant_id IS NULL
      AND e.status = 'ACTIVE'
      AND (
          e.feature_flags->>'workspace' = 'PPL'
          OR e.name IN (
              'formula_expression', 'formula_expression_version', 'rate_table', 'rate_table_row',
              'person', 'person_sensitive_profile', 'external_reference', 'org_unit',
              'job_family', 'job_function', 'career_band', 'career_level', 'pay_grade',
              'designation', 'job', 'position', 'employment', 'work_assignment',
              'work_pattern', 'work_pattern_day', 'shift_type', 'leave_type', 'leave_plan',
              'leave_plan_rule', 'employee_leave_enrollment', 'pay_group', 'pay_component',
              'pay_structure', 'pay_structure_line', 'statutory_scheme',
              'employee_statutory_enrollment', 'shift_assignment', 'time_punch',
              'attendance_day', 'attendance_adjustment_request', 'leave_request',
              'leave_balance_entry', 'compensation_assignment', 'compensation_change',
              'payroll_period', 'payroll_run', 'payroll_run_employee', 'payroll_result',
              'payroll_result_line', 'employee_tax_declaration',
              'employee_tax_declaration_line', 'hr_case', 'onboarding_case',
              'offboarding_case', 'policy_acknowledgment', 'people_request'
          )
      )
),
field_rank AS (
    SELECT
        p.entity_id,
        ef.name,
        row_number() OVER (
            PARTITION BY p.entity_id
            ORDER BY
                CASE ef.name
                    WHEN 'code' THEN 1
                    WHEN 'person_number' THEN 2
                    WHEN 'display_name' THEN 3
                    WHEN 'name' THEN 4
                    WHEN 'employee_id' THEN 5
                    WHEN 'person_id' THEN 6
                    WHEN 'pay_group_id' THEN 7
                    WHEN 'payroll_run_id' THEN 8
                    WHEN 'payroll_period_id' THEN 9
                    WHEN 'payroll_result_id' THEN 10
                    WHEN 'line_no' THEN 11
                    WHEN 'pay_component_id' THEN 12
                    WHEN 'leave_type_id' THEN 13
                    WHEN 'leave_plan_id' THEN 14
                    WHEN 'work_date' THEN 15
                    WHEN 'attendance_date' THEN 16
                    WHEN 'start_date' THEN 17
                    WHEN 'end_date' THEN 18
                    WHEN 'period_year' THEN 19
                    WHEN 'period_number' THEN 20
                    WHEN 'amount' THEN 21
                    WHEN 'net_amount' THEN 22
                    WHEN 'status' THEN 23
                    ELSE 100
                END,
                ef.sort_order,
                ef.name
        ) AS rn
    FROM ppl_entities p
    JOIN control.entity_field ef
      ON ef.entity_version_id = p.entity_version_id
     AND ef.is_active = true
    WHERE ef.name NOT IN (
        'tenant_id', 'metadata', 'tags',
        'created_at', 'created_by', 'updated_at', 'updated_by',
        'deleted_at', 'deleted_by', 'status_changed_at', 'status_changed_by'
    )
),
display_columns AS (
    SELECT
        entity_id,
        COALESCE(array_agg(name ORDER BY rn) FILTER (WHERE rn <= 6), ARRAY['id']::text[]) AS list_columns
    FROM field_rank
    GROUP BY entity_id
),
natural_candidates(entity_name, fields) AS (
    VALUES
        ('formula_expression', ARRAY['code']::text[]),
        ('formula_expression_version', ARRAY['formula_expression_id','version_no']::text[]),
        ('rate_table', ARRAY['code']::text[]),
        ('rate_table_row', ARRAY['rate_table_id','effective_from','sequence_no']::text[]),
        ('person', ARRAY['code']::text[]),
        ('person_sensitive_profile', ARRAY['person_id']::text[]),
        ('external_reference', ARRAY['source_system','external_identifier']::text[]),
        ('org_unit', ARRAY['code']::text[]),
        ('job_family', ARRAY['code']::text[]),
        ('job_function', ARRAY['code']::text[]),
        ('career_band', ARRAY['code']::text[]),
        ('career_level', ARRAY['code']::text[]),
        ('pay_grade', ARRAY['code']::text[]),
        ('designation', ARRAY['code']::text[]),
        ('job', ARRAY['code']::text[]),
        ('position', ARRAY['code']::text[]),
        ('employment', ARRAY['code']::text[]),
        ('work_assignment', ARRAY['code']::text[]),
        ('work_pattern', ARRAY['code']::text[]),
        ('work_pattern_day', ARRAY['work_pattern_id','day_no']::text[]),
        ('shift_type', ARRAY['code']::text[]),
        ('leave_type', ARRAY['code']::text[]),
        ('leave_plan', ARRAY['code']::text[]),
        ('leave_plan_rule', ARRAY['leave_plan_id','rule_code']::text[]),
        ('employee_leave_enrollment', ARRAY['employee_id','leave_plan_id','effective_from']::text[]),
        ('pay_group', ARRAY['code']::text[]),
        ('pay_component', ARRAY['code']::text[]),
        ('pay_structure', ARRAY['code']::text[]),
        ('pay_structure_line', ARRAY['pay_structure_id','line_no']::text[]),
        ('statutory_scheme', ARRAY['code']::text[]),
        ('employee_statutory_enrollment', ARRAY['employee_id','statutory_scheme_id','effective_from']::text[]),
        ('shift_assignment', ARRAY['code']::text[]),
        ('time_punch', ARRAY['id']::text[]),
        ('attendance_day', ARRAY['employee_id','attendance_date']::text[]),
        ('attendance_adjustment_request', ARRAY['code']::text[]),
        ('leave_request', ARRAY['code']::text[]),
        ('leave_balance_entry', ARRAY['id']::text[]),
        ('compensation_assignment', ARRAY['code']::text[]),
        ('compensation_change', ARRAY['code']::text[]),
        ('payroll_period', ARRAY['code']::text[]),
        ('payroll_run', ARRAY['code']::text[]),
        ('payroll_run_employee', ARRAY['payroll_run_id','employee_id']::text[]),
        ('payroll_result', ARRAY['payroll_run_id','employee_id']::text[]),
        ('payroll_result_line', ARRAY['payroll_result_id','line_no']::text[]),
        ('employee_tax_declaration', ARRAY['code']::text[]),
        ('employee_tax_declaration_line', ARRAY['employee_tax_declaration_id','line_no']::text[]),
        ('hr_case', ARRAY['code']::text[]),
        ('onboarding_case', ARRAY['code']::text[]),
        ('offboarding_case', ARRAY['code']::text[]),
        ('policy_acknowledgment', ARRAY['employee_id','policy_code','policy_version']::text[]),
        ('people_request', ARRAY['code']::text[])
),
candidate_validation AS (
    SELECT
        p.entity_id,
        array_agg(c.field_name ORDER BY c.ord) FILTER (WHERE ef.id IS NOT NULL) AS present_fields,
        count(*) AS candidate_count,
        count(ef.id) AS present_count
    FROM ppl_entities p
    JOIN natural_candidates nc
      ON nc.entity_name = p.entity_name
    CROSS JOIN LATERAL unnest(nc.fields) WITH ORDINALITY AS c(field_name, ord)
    LEFT JOIN control.entity_field ef
      ON ef.entity_version_id = p.entity_version_id
     AND ef.is_active = true
     AND ef.name = c.field_name
    GROUP BY p.entity_id
),
natural_keys AS (
    SELECT
        p.entity_id,
        CASE
            WHEN cv.present_count = cv.candidate_count AND cv.present_count > 0 THEN cv.present_fields
            WHEN EXISTS (
                SELECT 1
                FROM control.entity_field ef
                WHERE ef.entity_version_id = p.entity_version_id
                  AND ef.is_active = true
                  AND ef.name = 'code'
            ) THEN ARRAY['code']::text[]
            ELSE ARRAY['id']::text[]
        END AS natural_key_fields
    FROM ppl_entities p
    LEFT JOIN candidate_validation cv
      ON cv.entity_id = p.entity_id
)
UPDATE control.entity e
SET display_config = CASE
        WHEN e.display_config IS NULL OR e.display_config = '{}'::jsonb THEN
            jsonb_build_object(
                'detail_renderer', CASE WHEN p.table_schema = 'document' THEN 'document' ELSE 'master' END,
                'list_columns', to_jsonb(COALESCE(d.list_columns, ARRAY['id']::text[])),
                'code_field', n.natural_key_fields[1],
                'title_field', CASE
                    WHEN 'name' = ANY (COALESCE(d.list_columns, ARRAY['id']::text[])) THEN 'name'
                    WHEN 'display_name' = ANY (COALESCE(d.list_columns, ARRAY['id']::text[])) THEN 'display_name'
                    ELSE (COALESCE(d.list_columns, ARRAY['id']::text[]))[1]
                END,
                'default_sort_field', n.natural_key_fields[1],
                'default_sort_order', 'asc'
            )
        ELSE e.display_config
    END,
    identity_config = CASE
        WHEN COALESCE(jsonb_array_length(
            CASE
                WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
                THEN COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields'
                ELSE '[]'::jsonb
            END
        ), 0) = 0
        THEN jsonb_set(COALESCE(e.identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(n.natural_key_fields::text[]), true)
        ELSE e.identity_config
    END,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'::uuid
FROM ppl_entities p
LEFT JOIN display_columns d
  ON d.entity_id = p.entity_id
JOIN natural_keys n
  ON n.entity_id = p.entity_id
WHERE e.id = p.entity_id
  AND (
      e.display_config IS NULL
      OR e.display_config = '{}'::jsonb
      OR COALESCE(jsonb_array_length(
          CASE
              WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
              THEN COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields'
              ELSE '[]'::jsonb
          END
      ), 0) = 0
  );
