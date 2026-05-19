-- 100_finance/200_document/030_journal_entry_flow.sql
-- Purpose: default create flow for manual Journal Entry with line repeater.
-- Header controls live in entity_flow_field; journal lines are described as a
-- composite repeater section backed by the journal_line child entity.

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_id   uuid;
    v_flow_id uuid;
    v_step_1  uuid;
    v_step_2  uuid;
BEGIN
    SELECT ev.id INTO v_ev_id
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id
    WHERE e.entity_code = 'journal_entry'
      AND e.tenant_id IS NULL
      AND ev.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev_id IS NULL THEN
        RAISE NOTICE 'journal_entry create flow skipped: entity version not found';
        RETURN;
    END IF;

    INSERT INTO control.entity_flow (
        tenant_id, entity_version_id, flow_code, label, description, icon_key,
        trigger_context, is_default, config, version_no, status, effective_from, created_by)
    SELECT
        NULL, v_ev_id, 'create',
        'Create Journal Entry',
        'Manual journal entry create flow with posting header and balanced lines.',
        'book-plus',
        'new', true,
        jsonb_build_object(
            'layout', 'wizard_with_summary',
            'intake_variant', 'minimal_header_then_lines',
            'input_modes', jsonb_build_array('manual','source_adjustment','import'),
            'line_reference_strategy', 'none',
            'summary', jsonb_build_object(
                'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
                'line_collection', 'journal_line',
                'balance_rule', 'debit_equals_credit'
            ),
            'controls', jsonb_build_object(
                'submit_requires_balance', true,
                'submit_requires_min_lines', 2,
                'post_requires_approval', true
            )
        ),
        1, 'active', now(), v_su
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_flow
        WHERE entity_version_id = v_ev_id
          AND flow_code = 'create'
          AND tenant_id IS NULL
          AND version_no = 1
    );

    UPDATE control.entity_flow
       SET config = jsonb_build_object(
           'layout', 'wizard_with_summary',
           'intake_variant', 'minimal_header_then_lines',
           'input_modes', jsonb_build_array('manual','source_adjustment','import'),
           'line_reference_strategy', 'none',
           'summary', jsonb_build_object(
               'fields', jsonb_build_array('company_code_id','posting_date','transaction_currency','exchange_rate','total_debit','total_credit','line_count'),
               'line_collection', 'journal_line',
               'balance_rule', 'debit_equals_credit'
           ),
           'controls', jsonb_build_object(
               'submit_requires_balance', true,
               'submit_requires_min_lines', 2,
               'post_requires_approval', true
           )
       )
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'create'
       AND tenant_id IS NULL
       AND version_no = 1;

    SELECT id INTO v_flow_id
    FROM control.entity_flow
    WHERE entity_version_id = v_ev_id
      AND flow_code = 'create'
      AND tenant_id IS NULL
      AND version_no = 1;

    INSERT INTO control.entity_flow_step
        (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
    VALUES
        (NULL, v_flow_id, 'posting_header', 'Posting Header', 'landmark', 10,
         '{"required_fields":["company_code_id","posting_date","document_date","transaction_currency","description"]}'::jsonb,
         'summary_side', v_su),
        (NULL, v_flow_id, 'journal_lines', 'Journal Lines', 'list-plus', 20,
         '{"required_sections":["lines"],"min_rows":{"lines":2},"balance_rule":"debit_equals_credit","pre_submit_checks":["line_count_min_2","debits_equal_credits","period_open","posting_controls"]}'::jsonb,
         'line_editor', v_su)
    ON CONFLICT (flow_id, step_key) DO UPDATE SET
        label = EXCLUDED.label,
        icon_key = EXCLUDED.icon_key,
        sort_order = EXCLUDED.sort_order,
        advance_rule = EXCLUDED.advance_rule,
        layout_hint = EXCLUDED.layout_hint;

    SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'posting_header';
    SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'journal_lines';

    DELETE FROM control.entity_flow_field
    WHERE flow_step_id IN (v_step_1, v_step_2)
      AND tenant_id IS NULL;

    INSERT INTO control.entity_flow_section (
        tenant_id, flow_step_id, section_key, label, description, sort_order,
        collapse_default, visible_when, reveal_behavior,
        section_type, entity_code, payload_key, field_codes, min_rows, default_row,
        created_by)
    VALUES
        (NULL, v_step_1, 'identity', 'Identity', NULL, 10,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'posting', 'Posting', NULL, 20,
         false, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_1, 'source', 'Source', NULL, 30,
         true, NULL, 'honor_default',
         'fields', NULL, NULL, NULL, NULL, NULL, v_su),
        (NULL, v_step_2, 'lines', 'Lines',
         'Debit and credit lines. The DB validates polarity, balance, dimensions, posting controls, and budget.',
         10, false, NULL, 'auto_expand',
         'repeater', 'journal_line', 'lines',
         '["line_no","gl_account_id","description","transaction_debit","transaction_credit","exchange_rate","cost_center_id","profit_center_id","project_id","party_type","party_id"]'::jsonb,
         2,
         '{"transaction_debit":0,"transaction_credit":0}'::jsonb,
         v_su),
        (NULL, v_step_2, 'summary', 'Summary', NULL, 20,
         false, NULL, 'honor_default',
         'summary', NULL, NULL, NULL, NULL, NULL, v_su)
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
        default_row = EXCLUDED.default_row;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_1, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, COALESCE(v.sort_order, ef.sort_order), v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('status',               'identity', 'chip',     'derived_locked', NULL, NULL, NULL, 'const:draft', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('company_code_id',      'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'ctx.user.default_company_code', 'je.override_company_code', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('book_id',              'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.default_manual_ledger_book(company_code_id)', 'je.override_book', NULL, 'inline_search', 1, 'standard', NULL, NULL::smallint),
        ('posting_date',         'posting',  'required', 'manual', NULL, NULL, 'today()', NULL, NULL, NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('document_date',        'posting',  'required', 'derived_overrideable', NULL, NULL, 'field.posting_date', 'field.posting_date', 'je.override_document_date', NULL, NULL, 1, 'standard', NULL, NULL::smallint),
        ('transaction_currency', 'posting',  'required', 'derived_overrideable', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', 'je.override_currency', NULL, 'currency', 1, 'standard', NULL, NULL::smallint),
        ('base_currency',        'posting',  'readonly', 'derived_locked', NULL, NULL, NULL, 'company_code.base_currency(company_code_id)', NULL, 'meta', 'currency', 1, 'compact', NULL, NULL::smallint),
        ('source_type',          'source',   'chip',     'derived_locked', NULL, NULL, NULL, 'const:manual', NULL, 'meta', 'chip', 1, 'compact', NULL, NULL::smallint),
        ('description',          'source',   'required', 'manual', NULL, NULL, NULL, NULL, NULL, NULL, 'textarea', 3, 'standard', NULL, NULL::smallint)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    INSERT INTO control.entity_flow_field (
        tenant_id, flow_step_id, entity_field_id,
        section_key, mode, derivation_mode, visible_when, required_when,
        default_source, derive_expression, override_permission,
        summary_role, ui_variant, span, display_size,
        help_text, sort_order, created_by)
    SELECT NULL, v_step_2, ef.id,
           v.section_key, v.mode, v.derivation_mode,
           v.visible_when::jsonb, v.required_when::jsonb,
           v.default_source, v.derive_expression, v.override_permission,
           v.summary_role, v.ui_variant, v.span, v.display_size,
           v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
        ('total_debit',            'summary',  'summary_only', 'derived_locked', NULL::text, NULL::text, NULL, 'lines.sum(base_debit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 10),
        ('total_credit',           'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.sum(base_credit)', NULL, 'total', 'money_big', 1, 'prominent', NULL, 20),
        ('line_count',             'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'lines.count()', NULL, 'meta', 'chip', 1, 'compact', NULL, 30),
        ('fiscal_year',            'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.year_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 40),
        ('period_number',          'summary',  'summary_only', 'derived_locked', NULL, NULL, NULL, 'fiscal.period_from(posting_date, company_code_id)', NULL, 'meta', 'chip', 1, 'compact', NULL, 50)
    ) AS v(field_name, section_key, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, display_size, help_text, sort_order)
      ON ef.name = v.field_name
    WHERE ef.entity_version_id = v_ev_id;

    RAISE NOTICE 'journal_entry create flow seeded: flow=%, steps=%',
        v_flow_id,
        (SELECT count(*) FROM control.entity_flow_step WHERE flow_id = v_flow_id);
END $$;
