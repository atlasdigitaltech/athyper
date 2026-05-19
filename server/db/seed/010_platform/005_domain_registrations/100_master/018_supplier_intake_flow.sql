-- =============================================================================
-- 100_master/018_supplier_intake_flow.sql
-- Composite 5-step supplier request intake flow.
--
-- Architecture:
--   - persistence_mode: composite_supplier_intake
--   - 5 steps: identify → relationships → tax → classify → review
--   - Type=fields sections use entity_flow_field rows for flat BP/supplier fields
--   - Type=repeater sections reference child entity_code for field resolution
--   - Driver fields: is_payment_ready (shows banking) + anticipated_risk_tier (shows governance)
--
-- Also seeds:
--   - entity_field rows for is_payment_ready + anticipated_risk_tier on supplier
--
-- Depends on:
--   001_supplier.sql, control/01g_tables_flow_engine_ext.sql,
--   control/01h_tables_composite_intake.sql, 017_supplier_permissions.sql
--
-- Idempotent:
--   WHERE NOT EXISTS for flow/steps, ON CONFLICT DO NOTHING for fields,
--   ON CONFLICT (flow_step_id, section_key) DO UPDATE for sections,
--   DELETE+INSERT for entity_flow_field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su        constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id     uuid;
  v_flow_id   uuid;
  v_step_1    uuid;  -- Identify
  v_step_2    uuid;  -- Governance & Trust
  v_step_3    uuid;  -- Tax & Identifiers
  v_step_4    uuid;  -- Contacts & Addresses
  v_step_5    uuid;  -- Review & Submit
BEGIN

  -- ── Resolve supplier entity version ────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'supplier'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'supplier entity v1 not found — intake flow seed skipped';
    RETURN;
  END IF;

  -- ── 0. Driver fields — add if not already present ─────────────────────────
  -- is_payment_ready: UI-only boolean toggle — shows/hides banking section.
  -- anticipated_risk_tier: text enum — shows/hides governance section.
  -- Both are stripped by PROTECTED_SUPPLIER_FIELDS before the DB insert.
  -- Boolean fields must start with is_/has_/can_/allow_/enable_ (ef_bool_naming_chk).

  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label,
    data_type, ui_type, cardinality, origin,
    is_required, is_filterable, is_sortable, is_searchable,
    sort_order, created_by)
  VALUES
    (v_ev_id, 'is_payment_ready', 'is_payment_ready',
     'Payment Ready', 'boolean', 'toggle', 'zero_or_one', 'standard',
     false, false, false, false, 500, v_su),
    (v_ev_id, 'anticipated_risk_tier', 'anticipated_risk_tier',
     'Anticipated Risk Tier', 'text', 'select', 'zero_or_one', 'standard',
     false, false, false, false, 510, v_su)
  ON CONFLICT DO NOTHING;

  -- Header-only signals: available to the header builder/intake flow, but not
  -- shown as editable Profile fields in the supplier detail page.
  UPDATE control.entity_field
     SET origin = 'system'
   WHERE entity_version_id = v_ev_id
     AND name IN ('is_payment_ready', 'anticipated_risk_tier')
     AND origin IS DISTINCT FROM 'system';

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  -- Supplier codes are seeded per-tenant by the onboarding process. The intake
  -- route falls back to SUP-{timestamp} when no series row exists.
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id,
    'supplier_intake',
    'Create Business Partner as Supplier',
    'Five-step BP-first onboarding wizard: profile and role, contacts, tax identifiers, governance and trust, review.',
    'building-store',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'composite_supplier_intake',
      'layout',           'wizard_with_summary',
      'submit_label',     'Submit Supplier Request',
      'success_redirect', '/app/business_partner/{business_partner_id}'
    ),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'supplier_intake' AND tenant_id IS NULL);

  SELECT id INTO v_flow_id
    FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'supplier_intake' AND tenant_id IS NULL;

  UPDATE control.entity_flow
     SET label = 'Create Business Partner as Supplier',
         description = 'Five-step BP-first onboarding wizard: profile and role, contacts, tax identifiers, governance and trust, review.',
         config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
           'persistence_mode', 'composite_supplier_intake',
           'layout',           'wizard_with_summary',
           'submit_label',     'Submit Supplier Request',
           'success_redirect', '/app/business_partner/{business_partner_id}'
         )
   WHERE id = v_flow_id;

  -- ── 3. Steps ────────────────────────────────────────────────────────────────

  -- Re-sequencing existing steps can otherwise collide with
  -- efs_flow_order_uq (flow_id, sort_order), e.g. moving relationships from
  -- 40 to 20 while classify still owns 20. Park all existing steps first, then
  -- upsert the target order below.
  WITH parked AS (
    SELECT id,
           (-30000 + row_number() OVER (ORDER BY sort_order, step_key))::smallint AS parked_sort
      FROM control.entity_flow_step
     WHERE flow_id = v_flow_id
  )
  UPDATE control.entity_flow_step s
     SET sort_order = parked.parked_sort
    FROM parked
   WHERE s.id = parked.id;

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'identify',      'Profile & Role',     'id-badge',      10,
     '{"required_fields":["name"]}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'relationships', 'Contacts & Addresses', 'users',       20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'tax',           'Tax & Identifiers',  'receipt-tax',   30,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'classify',      'Governance & Trust', 'shield-check',  40,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'review',        'Review & Submit',    'check-circle',  50,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    label = EXCLUDED.label,
    icon_key = EXCLUDED.icon_key,
    sort_order = EXCLUDED.sort_order,
    advance_rule = EXCLUDED.advance_rule,
    layout_hint = EXCLUDED.layout_hint;

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'classify';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'tax';
  SELECT id INTO v_step_4 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'relationships';
  SELECT id INTO v_step_5 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- ── 4. Sections ─────────────────────────────────────────────────────────────
  -- Clean moved/retired sections before re-inserting. ON CONFLICT is scoped
  -- to (flow_step_id, section_key), so moved section keys must be removed from
  -- their old step.
  DELETE FROM control.entity_flow_section
   WHERE flow_step_id IN (v_step_2, v_step_4)
     AND section_key IN ('service_coverage','certifications','contacts','addresses','bank_accounts','governance');

  -- STEP 1: Identify
  --   identify_core  (type=fields)  — business_partner identity fields
  --   intake_flags   (type=fields)  — driver fields (is_payment_ready, anticipated_risk_tier)

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_1, 'identify_core', 'Business Partner Profile', 10,
     'fields', 'business_partner', NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su),
    (NULL, v_step_1, 'intake_flags', 'Supplier Role Setup', 20,
     'fields', 'supplier', NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type,
    entity_code = EXCLUDED.entity_code;

  -- STEP 4: Governance & Trust
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     visible_when, collapse_default, created_by)
  VALUES
    (NULL, v_step_2, 'certifications', 'Certifications', 10,
     'repeater', 'business_partner_certification', 'certifications',
     '["certification_type_id","custom_name","certificate_number","certified_by","certified_location","effective_from","effective_until","additional_info","document_attachment_id"]'::jsonb,
     0, NULL, NULL, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_2, 'bank_accounts', 'Payment Bank Accounts', 20,
     'repeater', 'business_partner_bank_account', 'bank_accounts',
     '["bank_name","account_number","currency_code","account_holder_name","account_id_type","is_primary"]'::jsonb,
     0, NULL, '{"is_primary": false}'::jsonb, 'supplier.banking.submit', false,
     '{"==":[{"var":"is_payment_ready"},true]}'::jsonb, false, v_su),

    (NULL, v_step_2, 'governance', 'Governance Disclosures', 30,
     'repeater', 'business_partner_governance', 'governance',
     '["relation_type","member_name","member_type","company_name","member_country_code","business_title","ownership_pct","voting_pct","beneficial_ownership_pct","directness","control_nature","share_class","authority_scope","authority_limit_amount","authority_limit_currency_code","appointed_date","end_of_term","notes"]'::jsonb,
     0, NULL, NULL, 'supplier.governance.write', false,
     NULL, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label           = EXCLUDED.label,
    sort_order      = EXCLUDED.sort_order,
    section_type    = EXCLUDED.section_type,
    entity_code     = EXCLUDED.entity_code,
    payload_key     = EXCLUDED.payload_key,
    field_codes     = EXCLUDED.field_codes,
    permission_code = EXCLUDED.permission_code,
    visible_when    = EXCLUDED.visible_when,
    default_row     = EXCLUDED.default_row;

  -- STEP 3: Tax & Identifiers
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_3, 'tax_profiles', 'Tax Profiles', 10,
     'repeater', 'business_partner_tax_profile', 'tax_profiles',
     '["country_code","tax_classification","taxation_type","tax_number","state_tax_number","sales_tax_number","service_tax_number","regional_tax_number","vat_number","is_vat_registered","has_tax_clearance","tax_clearance_number","tax_clearance_expiry_date","global_location_number","penalty_information","discount_information"]'::jsonb,
     0, NULL, '{"is_vat_registered": false, "has_tax_clearance": false}'::jsonb, 'supplier.tax.submit', false, false, v_su),
    (NULL, v_step_3, 'identifiers', 'Identifiers', 20,
     'repeater', 'business_partner_identifier', 'identifiers',
     '["scheme","value","issuing_authority","issued_at","valid_until","is_primary","is_verified"]'::jsonb,
     0, NULL, '{"is_primary": false, "is_verified": false}'::jsonb, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type, entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key, permission_code = EXCLUDED.permission_code;

  -- STEP 2: Contacts & Addresses

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     visible_when, collapse_default, created_by)
  VALUES
    (NULL, v_step_4, 'contacts', 'Contact Persons', 10,
     'repeater', 'business_partner_contact_person', 'contacts',
     '["contact_name","business_title","contact_role","is_primary","contact_email","contact_phone","contact_fax"]'::jsonb,
     0, NULL, '{"is_primary": false}'::jsonb, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_4, 'addresses', 'Addresses', 20,
     'repeater', 'address', 'addresses',
     '["address_type","line1","line2","city","region","postal_code","country_code","address_email","address_phone","address_fax"]'::jsonb,
     0, NULL, NULL, NULL, false,
     NULL, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label           = EXCLUDED.label,
    sort_order      = EXCLUDED.sort_order,
    section_type    = EXCLUDED.section_type,
    entity_code     = EXCLUDED.entity_code,
    payload_key     = EXCLUDED.payload_key,
    field_codes     = EXCLUDED.field_codes,
    permission_code = EXCLUDED.permission_code,
    visible_when    = EXCLUDED.visible_when,
    default_row     = EXCLUDED.default_row;

  -- STEP 5: Review & Submit
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_5, 'review_summary', 'Review & Submit', 10,
     'summary', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, section_type = EXCLUDED.section_type;

  -- ── 5. Flat field bindings (Step 1 type=fields sections) ────────────────────
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_1 AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    section_key, mode, derivation_mode, ui_variant,
    visible_when, required_when, default_source,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.sk, v.mode::text, 'manual', v.uv::text,
         NULL::jsonb, NULL::jsonb, NULL::text,
         NULL::text, v.sp::smallint, v.ht::text, v.so::smallint, v_su
  FROM control.entity_field ef
  JOIN control.entity_version ev ON ev.id = ef.entity_version_id
  JOIN control.entity e ON e.id = ev.entity_id
  JOIN (VALUES
    ('business_partner', 'identify_core', 'name',                      'required', NULL,      1, 'Trading name as known to your organisation.',           10),
    ('business_partner', 'identify_core', 'display_name',              'editable', NULL,      1, 'Short display name used in lists and dropdowns.',        20),
    ('business_partner', 'identify_core', 'legal_name',                'editable', NULL,      1, 'Full registered legal name for contracts.',              30),
    ('business_partner', 'identify_core', 'legal_form',                'editable', 'select',  1, NULL,                                                     40),
    ('business_partner', 'identify_core', 'registration_no',           'editable', NULL,      1, 'Company registration or business number.',               50),
    ('business_partner', 'identify_core', 'registration_country_code', 'editable', 'country', 1, 'Country of company registration.',                      60),
    ('business_partner', 'identify_core', 'website_url',               'editable', NULL,      1, NULL,                                                     70),
    ('business_partner', 'identify_core', 'description',               'editable', NULL,      2, NULL,                                                     80),
    ('business_partner', 'identify_core', 'external_ref',              'editable', NULL,      1, 'Optional reference ID from an external system.',         90),
    ('supplier',         'intake_flags',  'supplier_type',             'editable', 'select',  1, NULL,                                                    100),
    ('supplier',         'intake_flags',  'is_payment_ready',          'editable', 'toggle',  1, 'Enable if the supplier should be set up for payment.',  110),
    ('supplier',         'intake_flags',  'anticipated_risk_tier',     'editable', 'select',  1, 'Suggested risk classification for compliance review.', 120)
  ) AS v(entity_code, sk, fn, mode, uv, sp, ht, so) ON ef.name = v.fn
  WHERE e.entity_code = v.entity_code
    AND e.tenant_id IS NULL
    AND ev.version_no = 1;

END $$;
