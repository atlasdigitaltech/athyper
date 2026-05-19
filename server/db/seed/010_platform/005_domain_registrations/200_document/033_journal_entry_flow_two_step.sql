-- 010_platform/005_domain_registrations/200_document/033_journal_entry_flow_two_step.sql
-- Purpose: collapse manual Journal Entry create flow to Header -> Journal Lines.

DO $$
DECLARE
    v_su             uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id          uuid;
    v_flow_id        uuid;
    v_lines_step_id  uuid;
    v_review_step_id uuid;
    v_deleted_steps  integer := 0;
BEGIN
    SELECT ev.id INTO v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
    WHERE e.entity_code = 'journal_entry'
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: entity version not found';
        RETURN;
    END IF;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    IF v_flow_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: create flow not found';
        RETURN;
    END IF;

    SELECT id INTO v_lines_step_id
    FROM control.entity_flow_step
    WHERE flow_id = v_flow_id
      AND tenant_id IS NULL
      AND step_key = 'journal_lines';

    IF v_lines_step_id IS NULL THEN
        RAISE NOTICE '033_journal_entry_flow_two_step skipped: journal_lines step not found';
        RETURN;
    END IF;

    SELECT id INTO v_review_step_id
    FROM control.entity_flow_step
    WHERE flow_id = v_flow_id
      AND tenant_id IS NULL
      AND step_key = 'review';

    UPDATE control.entity_flow
       SET description = 'Manual journal entry create flow with posting header and balanced lines.',
           updated_at = now(),
           updated_by = v_su
     WHERE id = v_flow_id;

    UPDATE control.entity_flow_step
       SET label = 'Journal Lines',
           icon_key = 'list-plus',
           sort_order = 20,
           advance_rule = '{"required_sections":["lines"],"min_rows":{"lines":2},"balance_rule":"debit_equals_credit","pre_submit_checks":["line_count_min_2","debits_equal_credits","period_open","posting_controls"]}'::jsonb,
           layout_hint = 'line_editor',
           updated_at = now(),
           updated_by = v_su
     WHERE id = v_lines_step_id;

    INSERT INTO control.entity_flow_section (
        tenant_id, flow_step_id, section_key, label, description, sort_order,
        collapse_default, visible_when, reveal_behavior,
        section_type, entity_code, payload_key, field_codes, min_rows, default_row,
        created_by)
    VALUES (
        NULL, v_lines_step_id, 'summary', 'Summary', NULL, 20,
        false, NULL, 'honor_default',
        'summary', NULL, NULL, NULL, NULL, NULL, v_su
    )
    ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        collapse_default = EXCLUDED.collapse_default,
        visible_when = EXCLUDED.visible_when,
        reveal_behavior = EXCLUDED.reveal_behavior,
        section_type = EXCLUDED.section_type,
        entity_code = EXCLUDED.entity_code,
        payload_key = EXCLUDED.payload_key,
        field_codes = EXCLUDED.field_codes,
        min_rows = EXCLUDED.min_rows,
        default_row = EXCLUDED.default_row,
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_lines_step_id, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('total_debit',   'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.sum(base_debit)', NULL::text, 'total', 'money_big', 1, 'prominent', NULL::text, 10),
        ('total_credit',  'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.sum(base_credit)', NULL::text, 'total', 'money_big', 1, 'prominent', NULL::text, 20),
        ('line_count',    'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'lines.count()', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 30),
        ('fiscal_year',   'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'fiscal.year_from(posting_date, company_code_id)', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 40),
        ('period_number', 'summary', 'summary_only', 'derived_locked', NULL::text, NULL::text, NULL::text, 'fiscal.period_from(posting_date, company_code_id)', NULL::text, 'meta', 'chip', 1, 'compact', NULL::text, 50)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id
    ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
        section_key = EXCLUDED.section_key,
        mode = EXCLUDED.mode,
        derivation_mode = EXCLUDED.derivation_mode,
        visible_when = EXCLUDED.visible_when,
        required_when = EXCLUDED.required_when,
        default_source = EXCLUDED.default_source,
        derive_expression = EXCLUDED.derive_expression,
        override_permission = EXCLUDED.override_permission,
        summary_role = EXCLUDED.summary_role,
        ui_variant = EXCLUDED.ui_variant,
        span = EXCLUDED.span,
        display_size = EXCLUDED.display_size,
        help_text = EXCLUDED.help_text,
        sort_order = EXCLUDED.sort_order,
        updated_at = now(),
        updated_by = v_su;

    IF v_review_step_id IS NOT NULL THEN
        DELETE FROM control.entity_flow_field
        WHERE flow_step_id = v_review_step_id
          AND tenant_id IS NULL;

        DELETE FROM control.entity_flow_section
        WHERE flow_step_id = v_review_step_id
          AND tenant_id IS NULL;

        DELETE FROM control.entity_flow_step
        WHERE id = v_review_step_id
          AND tenant_id IS NULL;

        GET DIAGNOSTICS v_deleted_steps = ROW_COUNT;
    END IF;

    RAISE NOTICE '033_journal_entry_flow_two_step completed: removed % review step(s)', v_deleted_steps;
END $$;
