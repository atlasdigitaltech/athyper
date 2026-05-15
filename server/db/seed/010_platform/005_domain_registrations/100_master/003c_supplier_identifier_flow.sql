-- =============================================================================
-- 100_master/003c_business_partner_identifier_flow.sql
-- New-record flow for business_partner_identifier -- single-step, no approval.
--
-- Fields:
--   scheme           → enum_select  (required)
--   value            → text         (required, max 100)
--   issuing_authority→ text         (optional)
--   issued_at        → date         (optional)
--   valid_until      → date         (optional)
--   is_verified      → boolean      (required, default false)
--   is_primary       → boolean      (required)
--   status           → chip/readonly (set to ACTIVE on create via lifecycle)
--
-- Depends on: 003_supplier_identifier.sql
-- Idempotent: WHERE NOT EXISTS for flow, ON CONFLICT DO UPDATE for step,
--             DELETE+INSERT for field bindings.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_id uuid;
BEGIN

  -- ── Resolve entity version ──────────────────────────────────────────────────
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.entity_code = 'business_partner_identifier'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE 'business_partner_identifier v1 not found -- new flow seed skipped';
    RETURN;
  END IF;

  -- ── 1. Flow header ──────────────────────────────────────────────────────────
  SELECT id INTO v_flow_id
    FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND tenant_id IS NULL
     AND flow_code = 'new_business_partner_identifier'
   ORDER BY version_no DESC
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    SELECT id INTO v_flow_id
      FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND tenant_id IS NULL
       AND trigger_context = 'new'
       AND is_default = true
       AND status = 'active'
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_flow_id IS NULL THEN
    INSERT INTO control.entity_flow (
      tenant_id, entity_version_id, flow_code, label, description, icon_key,
      trigger_context, is_default, config, version_no, status, effective_from, created_by)
    VALUES (
      NULL, v_ev_id, 'new_business_partner_identifier',
      'Add Identifier',
      'Record an official identifier (tax ID, DUNS, VAT, etc.) for this business partner.',
      'fingerprint',
      'new', true,
      '{"layout":"single_step","submit_label":"Save Identifier","auto_approve":true}'::jsonb,
      1, 'active', now(), v_su)
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE control.entity_flow
       SET flow_code      = 'new_business_partner_identifier',
           label          = 'Add Identifier',
           description    = 'Record an official identifier (tax ID, DUNS, VAT, etc.) for this business partner.',
           icon_key       = 'fingerprint',
           trigger_context= 'new',
           is_default     = true,
           config         = '{"layout":"single_step","submit_label":"Save Identifier","auto_approve":true}'::jsonb,
           version_no     = 1,
           status         = 'active',
           effective_from = COALESCE(effective_from, now()),
           updated_at     = now(),
           updated_by     = v_su
     WHERE id = v_flow_id;
  END IF;

  -- ── 2. Single step ──────────────────────────────────────────────────────────
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order, advance_rule, layout_hint, created_by)
  VALUES
    (NULL, v_flow_id, 'details', 'Identifier Details', 'fingerprint', 10,
     '{"required_fields":["scheme","value","is_verified","is_primary"]}'::jsonb,
     'two_column', v_su)
  ON CONFLICT (flow_id, step_key) DO UPDATE SET
    advance_rule = EXCLUDED.advance_rule;

  SELECT id INTO v_step_id FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'details';

  -- ── 3. Field bindings ───────────────────────────────────────────────────────
  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_id AND tenant_id IS NULL;

  -- Columns: fn, mode, dm, uv, ds, sr, ht, so  (span hardcoded 1)
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, ui_variant,
    visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_id, ef.id,
         v.mode, v.dm::text, v.uv::text,
         NULL::jsonb, NULL::jsonb,
         v.ds, NULL::text, NULL::text,
         v.sr, 1, v.ht, v.so, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('scheme',             'required', 'manual', 'enum_select', NULL,        NULL,      'Identifier type — e.g. TAX_ID, VAT_NO, DUNS.',     10),
    ('value',              'required', 'manual', NULL,          NULL,        NULL,      'The actual identifier string (max 100 characters).', 20),
    ('issuing_authority',  'editable', 'manual', NULL,          NULL,        NULL,      'Government body or agency that issued this ID.',     30),
    ('issued_at',          'editable', 'manual', NULL,          NULL,        NULL,      'Date this identifier was issued.',                   40),
    ('valid_until',        'editable', 'manual', NULL,          NULL,        NULL,      'Expiry date of this identifier, if applicable.',     50),
    ('is_primary',         'required', 'manual', 'toggle',      NULL,        NULL,      'Mark as the primary identifier for this business partner.',  60),
    ('is_verified',        'required', 'manual', 'toggle',      'const:false',NULL,     'Has this identifier been independently verified?',   70),
    ('status',             'hidden',   'manual', NULL,          'const:ACTIVE', NULL,   NULL,                                                 80)
  ) AS v(fn, mode, dm, uv, ds, sr, ht, so)
     ON ef.name = v.fn AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE 'business_partner_identifier new flow seeded: flow_id=%, step_id=%', v_flow_id, v_step_id;

END $$;
