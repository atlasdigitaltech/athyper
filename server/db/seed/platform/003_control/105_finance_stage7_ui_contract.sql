-- Stage 7 finance UI contract
-- Simple masters use the canonical Entity List/Record runtime. Aggregate
-- members retain canonical forms, but are entered through their governed
-- aggregate workbench so parent scope and dependency context stay visible.

DO $$
DECLARE
    v_system uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    -- Repair rows from an interrupted Stage 7 run against the v2 operation
    -- contract. A v2 operation must always bind to an effective version.
    DELETE FROM control.entity_operation eo
     WHERE eo.tenant_id IS NULL
       AND eo.entity_version_id IS NULL
       AND eo.entity_name = ANY (ARRAY[
         'ledger_book','company_code_gl_account','bank_account_link','dimension_type','dimension_value',
         'tax_jurisdiction','tax_type','payment_term_clause','payment_term_discount_tier',
         'accounting_profile','acct_profile_config','acct_profile_event','acct_profile_entry_template',
         'acct_profile_book_rule','acct_profile_commitment_config','acct_profile_dimension_rule',
         'acct_profile_revenue_config','acct_profile_settlement_config','fiscal_calendar_config',
         'fiscal_calendar_period_rule','company_fiscal_calendar_assignment','dimension_policy',
         'dimension_policy_allowed_value','tax_group','tax_group_component','tax_rate_schedule',
         'tax_resolution_rule','payment_method_company_policy','bank_interface_profile',
         'payment_method_interface_binding','payment_settlement_rule','bank_format_rule'
       ]::text[]);

    -- Generic `delete` is compiled as retirement for master/configuration
    -- entities.  Remove Stage 7 delete actions when the effective metadata has
    -- no retirement storage; temporal/child rows are ended or removed by their
    -- owning aggregate instead of pretending they support a status lifecycle.
    DELETE FROM control.entity_operation eo
     USING control.entity e, control.entity_version ev
     WHERE eo.tenant_id IS NULL
       AND eo.operation_code = 'delete'
       AND eo.entity_name = e.entity_code
       AND e.tenant_id IS NULL
       AND e.entity_code = ANY (ARRAY[
         'ledger_book','company_code_gl_account','bank_account_link','dimension_type','dimension_value',
         'tax_jurisdiction','tax_type','payment_term_clause','payment_term_discount_tier',
         'accounting_profile','acct_profile_config','acct_profile_event','acct_profile_entry_template',
         'acct_profile_book_rule','acct_profile_commitment_config','acct_profile_dimension_rule',
         'acct_profile_revenue_config','acct_profile_settlement_config','fiscal_calendar_config',
         'fiscal_calendar_period_rule','company_fiscal_calendar_assignment','dimension_policy',
         'dimension_policy_allowed_value','tax_group','tax_group_component','tax_rate_schedule',
         'tax_resolution_rule','payment_method_company_policy','bank_interface_profile',
         'payment_method_interface_binding','payment_settlement_rule','bank_format_rule'
       ]::text[])
       AND ev.id = eo.entity_version_id
       AND ev.entity_id = e.id
       AND NOT EXISTS (
         SELECT 1
           FROM control.entity_field ef
          WHERE ef.entity_version_id = ev.id
            AND ef.tenant_id IS NULL
            AND ef.is_active
            AND ef.column_name = ANY (ARRAY['retired_at','status','is_active']::text[])
       );

    INSERT INTO control.entity_operation
        (tenant_id, entity_name, entity_version_id, permission_code, operation_code, label,
         surface, placement, handler_type, handler_target,
         is_record_required, record_required, sort_order, created_by)
    SELECT NULL, entity_set.entity_code, ev.id, operation_set.operation_code,
           operation_set.operation_code, initcap(replace(operation_set.operation_code, '_', ' ')),
           surface, placement,
           handler_type, replace(target_template, '{entity}', entity_set.entity_code),
           record_required, record_required, sort_order, v_system
      FROM (
        VALUES
          -- Canonical Entity App masters and simple configuration records.
          ('ledger_book', 'simple'),
          ('company_code_gl_account', 'simple'),
          ('bank_account_link', 'simple'),
          ('dimension_type', 'simple'),
          ('dimension_value', 'simple'),
          ('tax_jurisdiction', 'simple'),
          ('tax_type', 'simple'),
          ('payment_term_clause', 'simple'),
          ('payment_term_discount_tier', 'simple'),

          -- Aggregate-owned records. Forms are canonical; navigation and
          -- relationship context are supplied by Finance Workbench.
          ('accounting_profile', 'aggregate'),
          ('acct_profile_config', 'aggregate'),
          ('acct_profile_event', 'aggregate'),
          ('acct_profile_entry_template', 'aggregate'),
          ('acct_profile_book_rule', 'aggregate'),
          ('acct_profile_commitment_config', 'aggregate'),
          ('acct_profile_dimension_rule', 'aggregate'),
          ('acct_profile_revenue_config', 'aggregate'),
          ('acct_profile_settlement_config', 'aggregate'),
          ('fiscal_calendar_config', 'aggregate'),
          ('fiscal_calendar_period_rule', 'aggregate'),
          ('company_fiscal_calendar_assignment', 'aggregate'),
          ('dimension_policy', 'aggregate'),
          ('dimension_policy_allowed_value', 'aggregate'),
          ('tax_group', 'aggregate'),
          ('tax_group_component', 'aggregate'),
          ('tax_rate_schedule', 'aggregate'),
          ('tax_resolution_rule', 'aggregate'),
          ('payment_method_company_policy', 'aggregate'),
          ('bank_interface_profile', 'aggregate'),
          ('payment_method_interface_binding', 'aggregate'),
          ('payment_settlement_rule', 'aggregate'),
          ('bank_format_rule', 'aggregate')
      ) entity_set(entity_code, ownership)
      CROSS JOIN LATERAL (
        VALUES
          ('create', 'LIST', 'PRIMARY', 'NAVIGATE', '/app/{entity}/new', false, 10),
          ('update', 'DETAIL', 'PRIMARY', 'NAVIGATE', '/app/{entity}/{id}/edit', true, 20),
          ('delete', 'DETAIL', 'OVERFLOW', 'MODAL', 'delete', true, 30),
          ('export', 'LIST', 'TOOLBAR', 'API', 'export', false, 40)
      ) operation_set(operation_code, surface, placement, handler_type, target_template, record_required, sort_order)
      JOIN control.entity e ON e.tenant_id IS NULL AND e.entity_code = entity_set.entity_code
      JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL AND ev.status = 'EFFECTIVE'
     WHERE operation_set.operation_code <> 'delete'
        OR EXISTS (
          SELECT 1
            FROM control.entity_field ef
           WHERE ef.entity_version_id = ev.id
             AND ef.tenant_id IS NULL
             AND ef.is_active
             AND ef.column_name = ANY (ARRAY['retired_at','status','is_active']::text[])
        )
    ON CONFLICT DO NOTHING;

    -- High-signal list/record labels for Stage 7 entities. Preserve every
    -- unrelated display setting generated by the metadata pipeline.
    UPDATE control.entity e
       SET display_config = coalesce(e.display_config, '{}'::jsonb) || contract.display_config,
           updated_at = now(), updated_by = v_system
      FROM (
        VALUES
          ('ledger_book', jsonb_build_object('title_field','name','subtitle_field','code','list_columns',jsonb_build_array('code','name','book_type','status'))),
          ('company_code_gl_account', jsonb_build_object('title_field','gl_account_id','subtitle_field','company_code_id','list_columns',jsonb_build_array('company_code_id','gl_account_id','posting_allowed','status'))),
          ('bank_account_link', jsonb_build_object('title_field','bank_account_id','subtitle_field','purpose','list_columns',jsonb_build_array('owner_type','owner_id','company_code_id','bank_account_id','purpose','is_primary','effective_until'))),
          ('dimension_type', jsonb_build_object('title_field','name','subtitle_field','code','list_columns',jsonb_build_array('code','name','value_type','status'))),
          ('dimension_value', jsonb_build_object('title_field','name','subtitle_field','code','list_columns',jsonb_build_array('code','name','dimension_type_id','status'))),
          ('dimension_policy', jsonb_build_object('title_field','policy_code','subtitle_field','behavior','list_columns',jsonb_build_array('policy_code','dimension_type_id','company_code_id','behavior','priority','status'))),
          ('tax_rate_schedule', jsonb_build_object('title_field','description','subtitle_field','tax_direction','list_columns',jsonb_build_array('jurisdiction_id','tax_type_id','tax_direction','rate_value','effective_from','effective_to','status'))),
          ('payment_method_company_policy', jsonb_build_object('title_field','payment_method_id','subtitle_field','direction','list_columns',jsonb_build_array('company_code_id','payment_method_id','direction','currency_code','is_default','status'))),
          ('payment_method_interface_binding', jsonb_build_object('title_field','payment_method_id','subtitle_field','bank_interface_profile_id','list_columns',jsonb_build_array('company_code_id','payment_method_id','bank_interface_profile_id','direction','priority','status'))),
          ('payment_settlement_rule', jsonb_build_object('title_field','payment_method_id','subtitle_field','book_code','list_columns',jsonb_build_array('company_code_id','payment_method_id','direction','book_code','status')))
      ) contract(entity_code, display_config)
     WHERE e.tenant_id IS NULL AND e.entity_code = contract.entity_code;

    -- Provider secrets may not pass through generic Entity forms until an
    -- encrypted credential mutation contract is installed.
    UPDATE control.entity_field ef
       SET is_read_only = true,
           editability = coalesce(ef.editability, '{}'::jsonb)
             || '{"reason":"encrypted_provider_credentials_required"}'::jsonb,
           updated_at = now(), updated_by = v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL
       AND e.entity_code = 'bank_interface_profile'
       AND ev.status = 'EFFECTIVE'
       AND ef.entity_version_id = ev.id
       AND ef.name = 'config';
END $$;
