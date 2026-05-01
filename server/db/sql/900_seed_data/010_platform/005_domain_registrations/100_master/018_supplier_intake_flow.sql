-- =============================================================================
-- 100_master/018_supplier_intake_flow.sql
-- Composite 5-step supplier request intake flow.
--
-- Architecture:
--   - persistence_mode: composite_supplier_intake
--   - 5 steps: identify → classify → tax → relationships → review
--   - Type=fields sections use entity_flow_field rows for flat supplier fields
--   - Type=repeater sections reference child entity_code for field resolution
--   - Driver fields: is_payment_ready (shows banking) + anticipated_risk_tier (shows governance)
--
-- Also seeds:
--   - entity_field rows for is_payment_ready + anticipated_risk_tier on supplier
--   (numbering_series is tenant+company scoped — seeded per tenant, not here)
--
-- Depends on:
--   001_vendor.sql, control/01g_tables_flow_engine_ext.sql,
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
  v_step_2    uuid;  -- Classify & Cover
  v_step_3    uuid;  -- Tax & Identifiers
  v_step_4    uuid;  -- Relationships
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

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  -- Note: master.numbering_series is tenant+company scoped (NOT NULL constraints).
  -- Supplier codes are seeded per-tenant by the onboarding process. The intake
  -- route falls back to SUP-{timestamp} when no series row exists.
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id,
    'supplier_intake',
    'New Supplier Request',
    'Five-step composite onboarding wizard: identity, coverage, tax, relationships, review.',
    'building-store',
    'new', false,
    jsonb_build_object(
      'persistence_mode', 'composite_supplier_intake',
      'layout',           'wizard_with_summary',
      'submit_label',     'Submit Supplier Request',
      'success_redirect', '/app/supplier/{supplier_id}'
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

  -- ── 3. Steps ────────────────────────────────────────────────────────────────

  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'identify',      'Identify',           'id-badge',      10,
     '{"required_fields":["name"]}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'classify',      'Classify & Cover',   'layers',        20,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'tax',           'Tax & Identifiers',  'receipt-tax',   30,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'relationships', 'Relationships',      'users',         40,
     '{}'::jsonb, 'two_column', v_su),
    (NULL, v_flow_id, 'review',        'Review & Submit',    'check-circle',  50,
     '{}'::jsonb, 'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    advance_rule = EXCLUDED.advance_rule;

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'classify';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'tax';
  SELECT id INTO v_step_4 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'relationships';
  SELECT id INTO v_step_5 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- ── 4. Sections ─────────────────────────────────────────────────────────────
  -- STEP 1: Identify
  --   identify_core  (type=fields)  — supplier identity fields
  --   intake_flags   (type=fields)  — driver fields (is_payment_ready, anticipated_risk_tier)

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_1, 'identify_core', 'Supplier Identity', 10,
     'fields', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su),
    (NULL, v_step_1, 'intake_flags', 'Intake Configuration', 20,
     'fields', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type;

  -- STEP 2: Classify & Cover
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_2, 'service_coverage', 'Service Coverage', 10,
     'repeater', 'supplier_service_coverage', 'service_coverage', NULL,
     0, NULL, NULL, NULL, false, false, v_su),
    (NULL, v_step_2, 'certifications', 'Certifications', 20,
     'repeater', 'supplier_certification', 'certifications', NULL,
     0, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type, entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key;

  -- STEP 3: Tax & Identifiers
  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     collapse_default, created_by)
  VALUES
    (NULL, v_step_3, 'tax_profiles', 'Tax Profiles', 10,
     'repeater', 'supplier_tax_profile', 'tax_profiles', NULL,
     0, NULL, NULL, 'supplier.tax.submit', false, false, v_su),
    (NULL, v_step_3, 'identifiers', 'Identifiers', 20,
     'repeater', 'supplier_identifier', 'identifiers', NULL,
     0, NULL, NULL, NULL, false, false, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    section_type = EXCLUDED.section_type, entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key, permission_code = EXCLUDED.permission_code;

  -- STEP 4: Relationships
  --   bank_accounts visible_when is_payment_ready=true
  --   governance    visible_when anticipated_risk_tier in [high,critical,elevated]

  INSERT INTO control.entity_flow_section
    (tenant_id, flow_step_id, section_key, label, sort_order,
     section_type, entity_code, payload_key, field_codes,
     min_rows, max_rows, default_row, permission_code, restricted_view_only,
     visible_when, collapse_default, created_by)
  VALUES
    (NULL, v_step_4, 'contacts', 'Contact Persons', 10,
     'repeater', 'supplier_contact_person', 'contacts', NULL,
     0, NULL, '{"is_primary": false}'::jsonb, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_4, 'addresses', 'Addresses', 20,
     'repeater', 'address', 'addresses',
     '["address_type","line1","line2","city","region","postal_code","country_code"]'::jsonb,
     0, NULL, NULL, NULL, false,
     NULL, false, v_su),

    (NULL, v_step_4, 'bank_accounts', 'Bank Accounts', 30,
     'repeater', 'supplier_bank_account', 'bank_accounts',
     '["bank_name","account_number","currency_code","account_holder_name","account_id_type","is_primary"]'::jsonb,
     0, NULL, '{"is_primary": false}'::jsonb, 'supplier.banking.submit', false,
     '{"==":[{"var":"is_payment_ready"},true]}'::jsonb, false, v_su),

    (NULL, v_step_4, 'governance', 'Governance & Ownership', 40,
     'repeater', 'supplier_governance', 'governance', NULL,
     0, NULL, NULL, 'supplier.governance.write', false,
     '{"in":[{"var":"anticipated_risk_tier"},["high","critical","elevated"]]}'::jsonb, false, v_su)
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
    ('identify_core', 'name',                      'required', NULL,      1, 'Trading name as known to your organisation.',           10),
    ('identify_core', 'display_name',              'editable', NULL,      1, 'Short display name used in lists and dropdowns.',        20),
    ('identify_core', 'legal_name',                'editable', NULL,      1, 'Full registered legal name for contracts.',              30),
    ('identify_core', 'supplier_type',             'editable', 'select',  1, NULL,                                                     40),
    ('identify_core', 'legal_form',                'editable', 'select',  1, NULL,                                                     50),
    ('identify_core', 'registration_no',           'editable', NULL,      1, 'Company registration or business number.',               60),
    ('identify_core', 'registration_country_code', 'editable', 'select',  1, 'Country of company registration.',                      70),
    ('identify_core', 'website_url',               'editable', NULL,      1, NULL,                                                     80),
    ('identify_core', 'description',               'editable', NULL,      2, NULL,                                                     90),
    ('identify_core', 'external_ref',              'editable', NULL,      1, 'Optional reference ID from an external system.',        100),
    ('intake_flags',  'is_payment_ready',          'editable', 'toggle',  1, 'Enable if the supplier should be set up for payment.',  110),
    ('intake_flags',  'anticipated_risk_tier',     'editable', 'select',  1, 'Suggested risk classification for compliance review.', 120)
  ) AS v(sk, fn, mode, uv, sp, ht, so) ON ef.name = v.fn
  WHERE e.entity_code = 'supplier' AND e.tenant_id IS NULL AND ev.version_no = 1;

END $$;
