-- =============================================================================
-- 100_master/024_business_partner_customer_extension_flows.sql
-- Metadata flows for BP-first customer intake and BP extension.
--
-- These flows are rendered by the generic EntityModeFlow controller.
-- Persistence is selected by entity_flow.config.persistence_mode and handled by
-- /api/records/business_partner/intake or /api/records/business_partner/extend.
-- =============================================================================

DO $$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
  v_bp_ev uuid;
  v_customer_ev uuid;
  v_customer_flow uuid;
  v_extension_flow uuid;
  v_customer_step_identity uuid;
  v_customer_step_tax uuid;
  v_customer_step_review uuid;
  v_extension_step_select uuid;
  v_extension_step_company uuid;
  v_extension_step_review uuid;
BEGIN
  SELECT ev.id INTO v_bp_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'business_partner'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1;

  SELECT ev.id INTO v_customer_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'customer'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1;

  IF v_bp_ev IS NULL OR v_customer_ev IS NULL THEN
    RAISE NOTICE 'business_partner/customer entity v1 not found -- BP customer/extension flow seed skipped';
    RETURN;
  END IF;

  -- UI-only selector used by the extension flow. It is intentionally marked
  -- system-origin so normal BP detail/list rendering remains governed by
  -- display_config while Meta Studio can still manage the flow binding.
  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_computed, compute_mode, validation, sort_order, created_by)
  VALUES (
    v_bp_ev, 'extension_type', 'extension_type', 'Extension Type', 'enum', 'select',
    'one', 'system', 'master.business_partner_extension_type', false, false,
    true, 'flow', NULL::jsonb, 530, v_su)
  ON CONFLICT DO NOTHING;

  UPDATE control.entity_field
     SET data_type = 'enum',
         ui_type = 'select',
         enum_domain_code = 'master.business_partner_extension_type',
         origin = 'system',
         is_filterable = false,
         is_searchable = false,
         is_sortable = false,
         is_groupable = false,
         is_aggregatable = false,
         is_computed = true,
         compute_mode = 'flow'
   WHERE entity_version_id = v_bp_ev
     AND name = 'extension_type';

  -- Customer intake flow
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_customer_ev,
    'customer_intake',
    'Create Business Partner as Customer',
    'BP-first AR onboarding flow: identity, customer role, identifiers, and tax reference.',
    'user-round-plus',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'business_partner_intake',
      'role',             'customer',
      'layout',           'wizard',
      'submit_label',     'Create Customer',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_customer_ev
       AND flow_code = 'customer_intake'
       AND tenant_id IS NULL);

  SELECT id INTO v_customer_flow
    FROM control.entity_flow
   WHERE entity_version_id = v_customer_ev
     AND flow_code = 'customer_intake'
     AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Create Business Partner as Customer',
         description = 'BP-first AR onboarding flow: identity, customer role, identifiers, and tax reference.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'business_partner_intake',
           'role',             'customer',
           'layout',           'wizard',
           'submit_label',     'Create Customer',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         ),
         status = 'active'
   WHERE id = v_customer_flow;

  WITH parked AS (
    SELECT id,
           (-31000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_customer_flow
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_customer_flow, 'identity', 'Identity & Role', 'id-badge', 10,
     '{"required_fields":["name","customer_type"]}'::jsonb, 'two_column', v_su),
    (NULL, v_customer_flow, 'tax_identifier', 'Identifiers & Tax', 'fingerprint', 20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_customer_flow, 'review', 'Review & Submit', 'check-circle', 30,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_customer_step_identity FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'identity';
  SELECT id INTO v_customer_step_tax      FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'tax_identifier';
  SELECT id INTO v_customer_step_review   FROM control.entity_flow_step WHERE flow_id = v_customer_flow AND step_key = 'review';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_customer_step_identity, v_customer_step_tax, v_customer_step_review)
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v.step_id, ef.id,
         NULL, v.mode, v.derivation_mode, v.ui_variant,
         v.visible_when, v.required_when, v.default_source,
         v.summary_role, v.span::smallint, v.help_text, v.sort_order::smallint, v_su
    FROM (VALUES
      (v_customer_step_identity, 'business_partner', 'name',                      'required', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Trading name as known to your organisation.',         10),
      (v_customer_step_identity, 'business_partner', 'legal_name',                'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Registered legal name for contracts and AR.',         20),
      (v_customer_step_identity, 'business_partner', 'registration_country_code', 'editable', 'manual', 'country',       NULL::jsonb, NULL::jsonb, NULL::text,                                 'meta'::text, 1, 'Country of registration.',                            30),
      (v_customer_step_identity, 'business_partner', 'registration_no',           'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Company registration or business number.',            40),
      (v_customer_step_identity, 'business_partner', 'website_url',               'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, NULL::text,                                             50),
      (v_customer_step_identity, 'customer',         'customer_type',             'required', 'manual', 'select',        NULL::jsonb, NULL::jsonb, 'lookup.master.customer_type.corporate',     'meta'::text, 1, NULL::text,                                             60),
      (v_customer_step_identity, 'customer',         'is_key_account',            'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, 'const:false',                              NULL::text,   1, NULL::text,                                             70),
      (v_customer_step_identity, 'customer',         'risk_rating',               'editable', 'manual', 'select',        NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, NULL::text,                                             80),
      (v_customer_step_tax,      'business_partner_identifier', 'scheme',         'editable', 'manual', 'select',        NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Optional external identifier type.',                   10),
      (v_customer_step_tax,      'business_partner_identifier', 'value',          'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Identifier value exactly as issued.',                  20),
      (v_customer_step_tax,      'business_partner_tax_profile', 'tax_number',    'editable', 'manual', NULL::text,      NULL::jsonb, NULL::jsonb, NULL::text,                                 NULL::text,   1, 'Primary tax registration number.',                     30)
    ) AS v(step_id, entity_code, field_name, mode, derivation_mode, ui_variant,
           visible_when, required_when, default_source, summary_role, span, help_text, sort_order)
    JOIN control.entity e ON e.entity_code = v.entity_code AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.name = v.field_name;

  -- Business partner extension flow
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_bp_ev,
    'business_partner_extension',
    'Business Partner Extension',
    'Add supplier/customer role or company-code scope to an existing business partner.',
    'receipt-text',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'business_partner_extension',
      'layout',           'wizard',
      'submit_label',     'Save Extension',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_bp_ev
       AND flow_code = 'business_partner_extension'
       AND tenant_id IS NULL);

  SELECT id INTO v_extension_flow
    FROM control.entity_flow
   WHERE entity_version_id = v_bp_ev
     AND flow_code = 'business_partner_extension'
     AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Business Partner Extension',
         description = 'Add supplier/customer role or company-code scope to an existing business partner.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'business_partner_extension',
           'layout',           'wizard',
           'submit_label',     'Save Extension',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         ),
         status = 'active'
   WHERE id = v_extension_flow;

  WITH parked AS (
    SELECT id,
           (-32000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_extension_flow
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_extension_flow, 'select_extension', 'Select Extension', 'receipt-text', 10,
     '{"required_fields":["code","extension_type"]}'::jsonb, 'two_column', v_su),
    (NULL, v_extension_flow, 'company_scope', 'Company Code Scope', 'building-2', 20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_extension_flow, 'review', 'Review & Submit', 'check-circle', 30,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_extension_step_select  FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'select_extension';
  SELECT id INTO v_extension_step_company FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'company_scope';
  SELECT id INTO v_extension_step_review  FROM control.entity_flow_step WHERE flow_id = v_extension_flow AND step_key = 'review';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id IN (v_extension_step_select, v_extension_step_company, v_extension_step_review)
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v.step_id, ef.id,
         NULL, v.mode, v.derivation_mode, v.ui_variant,
         v.visible_when, v.required_when, v.default_source,
         v.summary_role, v.span::smallint, v.help_text, v.sort_order::smallint, v_su
    FROM (VALUES
      (v_extension_step_select,  'business_partner',              'code',           'required', 'manual', NULL::text,          NULL::jsonb, NULL::jsonb, NULL::text,                              'meta'::text, 1, 'Enter the BP code or UUID to extend.', 10),
      (v_extension_step_select,  'business_partner',              'extension_type', 'required', 'manual', 'select',            NULL::jsonb, NULL::jsonb, 'lookup.master.business_partner_extension_type.supplier_role', 'meta'::text, 1, NULL::text, 20),
      (v_extension_step_company, 'company_code_supplier_profile', 'company_code_id','required', 'manual', 'inline_search',     '{"in":[{"var":"extension_type"},["supplier_company_code","customer_company_code"]]}'::jsonb, NULL::jsonb, NULL::text, 'meta'::text, 1, NULL::text, 10),
      (v_extension_step_company, 'company_code_supplier_profile', 'currency_code',  'editable', 'manual', 'currency',          '{"in":[{"var":"extension_type"},["supplier_company_code","customer_company_code"]]}'::jsonb, NULL::jsonb, NULL::text, NULL::text,   1, NULL::text, 20)
    ) AS v(step_id, entity_code, field_name, mode, derivation_mode, ui_variant,
           visible_when, required_when, default_source, summary_role, span, help_text, sort_order)
    JOIN control.entity e ON e.entity_code = v.entity_code AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.name = v.field_name;

  RAISE NOTICE 'BP customer and extension metadata flows seeded';
END $$;
