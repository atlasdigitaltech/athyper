-- Also writes: control.lifecycle_state, control.lifecycle_transition
--   (each DO block owns its lifecycle_id lookup so state/transition rows stay local).
-- System lifecycle codes are referenced by restrictive FKs â€” never rename or delete.

-- ## 01 lc_active_inactive
-- Used by: label, brand_profile, letterhead, ledger_book, holiday_calendar,
--          payment_term, payment_method, planning_model, commodity_category,
--          chart_of_account, tax_jurisdiction, tax_type, auth_group, team,
--          dimension_set, asset_class, print_profile, and others.
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive', 'Active / Inactive', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"toggle-right","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_active_inactive' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false,"label":"Deactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false,"label":"Reactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

-- ## 02 lc_active_inactive_archived
-- Used by: dimension_type, dimension_value
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive_archived', 'Active / Inactive / Archived', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"archive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle
WHERE code = 'lc_active_inactive_archived' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  30,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 03 lc_org_master
-- Used by: legal_entity, company_code, cost_center, profit_center, site, warehouse
-- States: draft â†’ active â‡Œ suspended â†’ closed
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_org_master', 'Org Master Record', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"building-2","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_org_master' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended', 'Suspended', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',    'Closed',    false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'active')::uuid,    'activate',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'suspended')::uuid, 'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'active')::uuid,    'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'closed')::uuid,    'close',      true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'closed')::uuid,    'close',      true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 04 lc_bp_master
-- Used by: customer, supplier, bank_party, product, item
-- States: draft â†’ active â‡Œ credit_hold â‡Œ suspended â†’ inactive
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bp_master', 'Business Partner', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"users","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bp_master' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',      'Active',      false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'credit_hold', 'Credit Hold', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"alert-triangle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',   'Suspended',   false, false, 40,
     '{"ui_color":"#C00000","icon_key":"pause-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive',    'Inactive',    false, true,  50,
     '{"ui_color":"#555555","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'active')::uuid,      'activate',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'credit_hold')::uuid, 'place_hold', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'credit_hold')::uuid, (v_s->>'active')::uuid,      'lift_hold',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'suspended')::uuid,   'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'active')::uuid,      'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 05 lc_tenant
-- Used by: master.tenant
-- States: provisioning â†’ active â‡Œ suspended â†’ terminated
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_tenant', 'Tenant', 1, true,
    '{"initial_state_code":"provisioning","allow_parallel_instances":false,
      "icon_key":"building-2","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_tenant' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'provisioning', 'Provisioning', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"loader","badge_variant":"info","sla_minutes":1440}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',       'Active',       false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',    'Suspended',    false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'terminated',   'Terminated',   false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-octagon","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'provisioning')::uuid, (v_s->>'active')::uuid,    'provision',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,       (v_s->>'suspended')::uuid, 'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,    (v_s->>'active')::uuid,    'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,       (v_s->>'terminated')::uuid,'terminate',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,    (v_s->>'terminated')::uuid,'terminate',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 06 lc_principal
-- Used by: master.principal
-- States: active(initial) â‡Œ suspended â‡Œ locked â†’ deactivated
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_principal', 'Principal Account', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"user","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_principal' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',      'Active',      true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',   'Suspended',   false, false, 20,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'locked',      'Locked',      false, false, 30,
     '{"ui_color":"#C00000","icon_key":"lock","badge_variant":"danger",
       "auto_trigger":"failed_login_threshold"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deactivated', 'Deactivated', false, true,  40,
     '{"ui_color":"#555555","icon_key":"user-x","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'suspended')::uuid,  'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'active')::uuid,     'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'locked')::uuid,     'lock',       true,
     '{"require_comment":false,"system_trigger":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'locked')::uuid,    (v_s->>'active')::uuid,     'unlock',     true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'deactivated')::uuid,'deactivate', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid, (v_s->>'deactivated')::uuid,'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 07 lc_employee
-- Used by: master.employee
-- States: onboarding â†’ active â‡Œ on_leave / suspended â†’ terminated
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_employee', 'Employee', 1, true,
    '{"initial_state_code":"onboarding","allow_parallel_instances":false,
      "icon_key":"user-check","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_employee' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'onboarding', 'Onboarding', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"user-plus","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',     'Active',     false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_leave',   'On Leave',   false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"calendar-off","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',  'Suspended',  false, false, 40,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'terminated', 'Terminated', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"user-x","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'onboarding')::uuid, (v_s->>'active')::uuid,     'activate',          true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'on_leave')::uuid,   'go_on_leave',       true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_leave')::uuid,   (v_s->>'active')::uuid,     'return_from_leave', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'suspended')::uuid,  'suspend',           true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'active')::uuid,     'reactivate',        true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'terminated')::uuid, 'terminate',         true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'terminated')::uuid, 'terminate',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 08 lc_gl_account
-- Used by: master.gl_account
-- States: draft â†’ active â‡Œ blocked â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_gl_account', 'GL Account', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"book-open","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_gl_account' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 30,
     '{"ui_color":"#C00000","icon_key":"ban","badge_variant":"danger",
       "description":"Blocked from new postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,   (v_s->>'active')::uuid,   'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'blocked')::uuid,  'block',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid, (v_s->>'active')::uuid,   'unblock',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid, (v_s->>'archived')::uuid, 'archive',  true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 09 lc_fiscal_period
-- Used by: master.fiscal_period
-- States: open â†’ posting_closed â‡Œ (reopen) â†’ period_closed â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_fiscal_period', 'Fiscal Period', 1, true,
    '{"initial_state_code":"open","allow_parallel_instances":false,
      "icon_key":"calendar","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_fiscal_period' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'open',           'Open',           true,  false, 10,
     '{"ui_color":"#217346","icon_key":"calendar","badge_variant":"success",
       "description":"Period open for journal postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posting_closed', 'Posting Closed', false, false, 20,
     '{"ui_color":"#E8A020","icon_key":"calendar-x","badge_variant":"warning",
       "description":"Journal postings closed; adjustment postings only"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'period_closed',  'Period Closed',  false, false, 30,
     '{"ui_color":"#C00000","icon_key":"lock","badge_variant":"danger",
       "description":"Period fully closed; no further postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',       'Archived',       false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'open')::uuid,           (v_s->>'posting_closed')::uuid, 'close_postings',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'open')::uuid,           'reopen_postings', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'period_closed')::uuid,  'close_period',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'period_closed')::uuid,  (v_s->>'archived')::uuid,       'archive',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 10 lc_attachment
-- Used by: master.attachment
-- States: uploading â†’ active â‡Œ flagged â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_attachment', 'Attachment', 1, true,
    '{"initial_state_code":"uploading","allow_parallel_instances":false,
      "icon_key":"paperclip","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_attachment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'uploading', 'Uploading', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"upload","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'flagged',   'Flagged',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"flag","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',  'Archived',  false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'uploading')::uuid, (v_s->>'active')::uuid,   'confirm', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'flagged')::uuid,  'flag',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'active')::uuid,   'unflag',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 11 lc_comment
-- Used by: master.comment
-- States: draft â†’ published â‡Œ flagged â†’ hidden â†’ deleted
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_comment', 'Comment', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"message-square","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_comment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'published', 'Published', false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'flagged',   'Flagged',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"flag","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'hidden',    'Hidden',    false, false, 40,
     '{"ui_color":"#888888","icon_key":"eye-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deleted',   'Deleted',   false, true,  50,
     '{"ui_color":"#C00000","icon_key":"trash","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'published')::uuid, 'publish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid, (v_s->>'flagged')::uuid,   'flag',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'published')::uuid, 'unflag',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'hidden')::uuid,    'hide',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'hidden')::uuid,    (v_s->>'published')::uuid, 'restore', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'hidden')::uuid,    (v_s->>'deleted')::uuid,   'delete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid, (v_s->>'deleted')::uuid,   'delete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 12 lc_conversation
-- Used by: master.conversation
-- States: open â‡Œ resolved â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_conversation', 'Conversation', 1, true,
    '{"initial_state_code":"open","allow_parallel_instances":false,
      "icon_key":"messages-square","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_conversation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'open',     'Open',     true,  false, 10,
     '{"ui_color":"#217346","icon_key":"message-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'resolved', 'Resolved', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"check","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  30,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'open')::uuid,     (v_s->>'resolved')::uuid, 'resolve', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'resolved')::uuid, (v_s->>'open')::uuid,     'reopen',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'resolved')::uuid, (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 13 lc_template
-- Used by: master.template
-- States: draft â†’ active â‡Œ deprecated â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_template', 'Template', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"layout-template","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_template' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',      'Draft',      true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',     'Active',     false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'deprecated', 'Deprecated', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"alert-triangle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',   'Archived',   false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,      (v_s->>'active')::uuid,     'publish',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'deprecated')::uuid, 'deprecate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'deprecated')::uuid, (v_s->>'active')::uuid,     'restore',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'deprecated')::uuid, (v_s->>'archived')::uuid,   'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 14 lc_master_doc
-- Used by: master.document, master.brand_profile, master.letterhead, master.print_profile
-- States: draft â†’ active â†’ void / archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_master_doc', 'Master Document', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"file-text","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_master_doc' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'void',     'Void',     false, true,  30,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,  (v_s->>'active')::uuid,   'publish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid, (v_s->>'void')::uuid,     'void',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid, (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,  (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 15 lc_project
-- Used by: master.project
-- States: draft â†’ active â‡Œ on_hold â†’ completed / cancelled
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_project', 'Project', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"folder-kanban","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_project' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"play-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',   'On Hold',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'completed', 'Completed', false, true,  40,
     '{"ui_color":"#0F6CBD","icon_key":"check-circle-2","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled', 'Cancelled', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,   (v_s->>'active')::uuid,    'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'on_hold')::uuid,   'pause',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'active')::uuid,    'resume',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'completed')::uuid, 'complete', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'cancelled')::uuid, 'cancel',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'cancelled')::uuid, 'cancel',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 16 lc_asset
-- Used by: master.asset
-- States: draft â†’ in_service â‡Œ under_maintenance â†’ disposed
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_asset', 'Fixed Asset', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"hard-drive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_asset' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',             'Draft',             true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'in_service',        'In Service',        false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'under_maintenance', 'Under Maintenance', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"wrench","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'disposed',          'Disposed',          false, true,  40,
     '{"ui_color":"#C00000","icon_key":"trash-2","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,             (v_s->>'in_service')::uuid,        'commission',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'under_maintenance')::uuid,  'put_in_maintenance', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'in_service')::uuid,         'return_to_service',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 17 lc_budget_profile
-- Used by: master.budget_profile
-- States: draft â†’ approved â†’ active â‡Œ closed â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_budget_profile', 'Budget Profile', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"pie-chart","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_budget_profile' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved', 'Approved', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"check","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 30,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',   'Closed',   false, false, 40,
     '{"ui_color":"#555555","icon_key":"lock","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50,
     '{"ui_color":"#333333","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'approved')::uuid, 'approve',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid, (v_s->>'active')::uuid,   'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'closed')::uuid,   'close',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'active')::uuid,   'reopen',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'archived')::uuid, 'archive',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 18 lc_budget_allocation
-- Used by: master.budget_allocation
-- States: draft â†’ submitted â†’ approved / rejected
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_budget_allocation', 'Budget Allocation', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"bar-chart-3","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_budget_allocation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'submitted', 'Submitted', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"send","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',  'Approved',  false, true,  30,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',  'Rejected',  false, true,  40,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,     (v_s->>'submitted')::uuid, 'submit',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'draft')::uuid,     'withdraw', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'approved')::uuid,  'approve',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid, (v_s->>'rejected')::uuid,  'reject',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 19 lc_bank_account
-- Used by: master.bank_account
-- States: pending_verification â†’ active â‡Œ frozen â†’ closed
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bank_account', 'Bank Account', 1, true,
    '{"initial_state_code":"pending_verification","allow_parallel_instances":false,
      "icon_key":"landmark","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bank_account' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending_verification', 'Pending Verification', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',               'Active',               false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'frozen',               'Frozen',               false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"snowflake","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',               'Closed',               false, true,  40,
     '{"ui_color":"#555555","icon_key":"x-circle","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending_verification')::uuid, (v_s->>'active')::uuid,  'verify',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'frozen')::uuid,  'freeze',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'active')::uuid,  'unfreeze', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 20 lc_content
-- Used by: master.content_item
-- States: draft â†’ published â‡Œ unpublished â†’ archived
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_content', 'Content Item', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"file-text","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_content' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'published',   'Published',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"globe","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'unpublished', 'Unpublished', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"eye-off","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',    'Archived',    false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'published')::uuid,   'publish',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid,   (v_s->>'unpublished')::uuid, 'unpublish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'published')::uuid,   'republish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## 21 lc_delegation
-- Used by: master.delegation_grant
-- States: pending â†’ active â†’ expired (auto) / revoked
DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_delegation', 'Delegation Grant', 1, true,
    '{"initial_state_code":"pending","allow_parallel_instances":false,
      "icon_key":"share-2","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_delegation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending', 'Pending', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',  'Active',  false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'expired', 'Expired', false, true,  30,
     '{"ui_color":"#888888","icon_key":"timer-off","badge_variant":"neutral",
       "auto_trigger":"effective_to_passed"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revoked', 'Revoked', false, true,  40,
     '{"ui_color":"#C00000","icon_key":"shield-off","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'active')::uuid,  'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'expired')::uuid, 'expire',   true,
     '{"require_comment":false,"system_trigger":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


DO $$
DECLARE
  v_su          constant uuid := '00000000-0000-0000-0000-000000000000';
  v_lc_id       uuid;
  v_s           jsonb;    -- state id map { code: uuid }
BEGIN
  -- Resolve the purchase_invoice lifecycle
  SELECT lc.id INTO v_lc_id
    FROM control.lifecycle lc
    JOIN control.entity_lifecycle el ON el.lifecycle_id = lc.id
   WHERE el.entity_name = 'purchase_invoice'
     AND el.tenant_id IS NULL
   LIMIT 1;

  IF v_lc_id IS NULL THEN
    RAISE NOTICE '017_purchase_invoice_proforma: purchase_invoice lifecycle not found â€” skipped';
    RETURN;
  END IF;

  -- Â§P1 â€” proforma lifecycle state
  -- sort_order=5 places it before draft (sort_order=10).
  -- config flags suppress GL posting, aging, dedup, and make budget advisory-only.
  INSERT INTO control.lifecycle_state (
    lifecycle_id, tenant_id, code, name, description,
    is_initial, is_terminal, sort_order, config, created_by)
  VALUES (
    v_lc_id, NULL,
    'proforma',
    'Proforma',
    'Preview or indicative invoice. Posting, aging, and duplicate detection are '
    'suppressed. Budget precheck is advisory only. Transitions to draft on '
    'promotion (dedup probe runs at that point).',
    false, false, 5,
    jsonb_build_object(
      'is_posting_suppressed', true,
      'is_aging_excluded',     true,
      'is_dedup_excluded',     true,
      'is_budget_advisory',    true,
      'ui_color',              '#94A3B8',
      'icon_key',              'file-plus'),
    v_su)
  ON CONFLICT (lifecycle_id, code) DO NOTHING;

  -- Build / refresh state id map (includes the newly inserted proforma row)
  SELECT jsonb_object_agg(code, id) INTO v_s
    FROM control.lifecycle_state
   WHERE lifecycle_id = v_lc_id;

  -- Â§P2 â€” proforma â†’ draft (promote_proforma operation)
  -- operation_code maps to shared.permission.code = 'ap.promote_proforma'
  -- Dedup probe + FX/fiscal lock happen in the server handler before the transition.
  INSERT INTO control.lifecycle_transition (
    lifecycle_id, tenant_id, from_state_id, to_state_id,
    operation_code, is_active, config, created_by)
  VALUES (
    v_lc_id, NULL,
    (v_s->>'proforma')::uuid,
    (v_s->>'draft')::uuid,
    'promote_proforma',
    true,
    jsonb_build_object(
      'handler',                 'MODAL',
      'handler_target',          'flow:promote_proforma',
      'require_comment',         false,
      'dedup_on_transition',     true,
      'lock_fx_on_transition',   true,
      'lock_fiscal_on_transition', true),
    v_su)
  ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

  -- Â§P3 â€” proforma â†’ cancelled
  -- operation_code = 'cancel' (same as existing cancel transitions)
  INSERT INTO control.lifecycle_transition (
    lifecycle_id, tenant_id, from_state_id, to_state_id,
    operation_code, is_active, config, created_by)
  VALUES (
    v_lc_id, NULL,
    (v_s->>'proforma')::uuid,
    (v_s->>'cancelled')::uuid,
    'cancel',
    true,
    jsonb_build_object('require_comment', false),
    v_su)
  ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

  RAISE NOTICE '017_purchase_invoice_proforma: proforma state and transitions seeded for lifecycle %', v_lc_id;
END $$;


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/100_master/002_supplier_lifecycle.sql
-- ============================================================

-- 100_master/002_supplier_lifecycle.sql
-- Purpose: control.lifecycle + 5 states + 7 transitions + entity_lifecycle binding
--          for the Supplier (master.supplier) entity
-- Depends on: 001_supplier.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- â”€â”€ 1. control.lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Rename old lifecycle code 'supplier' (was 'vendor') on already-seeded rows
UPDATE control.lifecycle
SET code = 'supplier', name = 'Supplier Lifecycle'
WHERE code = 'vendor'
  AND tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1
        FROM control.lifecycle existing
       WHERE existing.code = 'supplier'
         AND existing.tenant_id IS NULL
  );

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'supplier', 'Supplier Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"building-2","ui_color":"#1D4ED8","entity_types":["supplier"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'supplier' AND tenant_id IS NULL;

-- â”€â”€ 2. control.lifecycle_state (5 states) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 30, '{"ui_color":"#888888","icon_key":"pause-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 40, '{"ui_color":"#C00000","icon_key":"ban"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50, '{"ui_color":"#666666","icon_key":"archive"}'::jsonb,      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- â”€â”€ 3. control.lifecycle_transition (7 edges) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'active')::uuid,   'activate',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'blocked')::uuid,  'block',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid,  (v_s->>'active')::uuid,   'unblock',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- â”€â”€ 4. control.entity_lifecycle binding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Idempotency fix: migrate old binding if it was inserted as 'supplier' (was 'vendor')
UPDATE control.entity_lifecycle
SET entity_name = 'supplier'
WHERE entity_name = 'vendor' AND lifecycle_id = v_lc_id AND tenant_id IS NULL;

END $$;


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/100_master/004_customer_lifecycle.sql
-- ============================================================

-- 100_finance/100_master/004_customer_lifecycle.sql
-- Purpose: control.lifecycle + 5 states + 7 transitions + entity_lifecycle binding
--          for the Customer (master.customer) entity
-- Depends on: 003_customer.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- â”€â”€ 1. control.lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'customer', 'Customer Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"users","ui_color":"#0D9488","entity_types":["customer"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'customer' AND tenant_id IS NULL;

-- â”€â”€ 2. control.lifecycle_state (5 states) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 20, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 30, '{"ui_color":"#888888","icon_key":"pause-circle"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'blocked',  'Blocked',  false, false, 40, '{"ui_color":"#C00000","icon_key":"ban"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50, '{"ui_color":"#666666","icon_key":"archive"}'::jsonb,      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- â”€â”€ 3. control.lifecycle_transition (7 edges) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'active')::uuid,   'activate',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'blocked')::uuid,  'block',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'blocked')::uuid,  (v_s->>'active')::uuid,   'unblock',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/200_document/002_document_lifecycles.sql
-- ============================================================


-- === SOURCE: 002_invoice_lifecycle.sql ===
-- 100_finance/200_document/002_invoice_lifecycle.sql
-- Purpose: control.lifecycle + 10 states + transitions + entity_lifecycle binding
--          for Purchase Invoice (document.purchase_invoice)
-- Depends on: 001_invoice.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- â”€â”€ 1. control.lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_invoice', 'Purchase Invoice Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"file-text","ui_color":"#7C3AED","entity_types":["purchase_invoice"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_invoice' AND tenant_id IS NULL;

-- â”€â”€ 2. control.lifecycle_state (9 states) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',             true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval',  false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',          false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',            false, false, 40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_paid',   'Partially Paid',    false, false, 50, '{"ui_color":"#E8A020","icon_key":"banknote"}'::jsonb,                                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',          'On Hold',           false, false, 55, '{"ui_color":"#B45309","icon_key":"pause-circle"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_paid',       'Fully Paid',        false, true,  60, '{"ui_color":"#217346","icon_key":"circle-check"}'::jsonb,                                     '00000000-0000-0000-0000-000000000000'),
    -- Rejected invoices return to draft through `amend`, so this state is
    -- editable and must not be terminal. Terminal + is_mutable is rejected
    -- by the capability compiler.
    (v_lc_id, NULL, 'rejected',         'Rejected',          false, false, 70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',        'Cancelled',         false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',          false, true,  90, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                                      '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- â”€â”€ 3. control.lifecycle_transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'partially_paid')::uuid,   'pay',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_paid')::uuid,   (v_s->>'fully_paid')::uuid,       'pay',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'draft')::uuid,            'amend',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- on_hold: approved/posted/partially_paid can be held; release_hold returns to prior state
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'on_hold')::uuid,          'hold',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,            (v_s->>'on_hold')::uuid,          'hold',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_paid')::uuid,    (v_s->>'on_hold')::uuid,          'hold',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,           (v_s->>'approved')::uuid,         'release_hold',true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,           (v_s->>'posted')::uuid,           'release_hold',true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,           (v_s->>'partially_paid')::uuid,   'release_hold',true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- === SOURCE: 005_purchase_order_lifecycle.sql ===
-- 100_finance/200_document/005_purchase_order_lifecycle.sql
-- Purpose: control.lifecycle + 9 states + transitions + entity_lifecycle binding
--          for Purchase Order (document.purchase_order)
-- Depends on: 004_purchase_order.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- â”€â”€ 1. control.lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_order', 'Purchase Order Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"shopping-cart","ui_color":"#EA580C","entity_types":["purchase_order"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_order' AND tenant_id IS NULL;

-- â”€â”€ 2. control.lifecycle_state (9 states) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',              true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',   'Pending Approval',   false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',           'Approved',           false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'sent_to_supplier',    'Sent to Supplier',   false, false, 40, '{"ui_color":"#0891B2","icon_key":"send"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_received', 'Partially Received', false, false, 50, '{"ui_color":"#E8A020","icon_key":"package-open"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_received',     'Fully Received',     false, false, 60, '{"ui_color":"#217346","icon_key":"package-check"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',            'On Hold',            false, false, 65, '{"ui_color":"#D97706","icon_key":"pause-circle","projects_from":"commitment.status=suspended"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',             'Closed',             false, true,  70, '{"ui_color":"#217346","icon_key":"lock"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',           'Rejected',           false, true,  80, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',          'Cancelled',          false, true,  90, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,           '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- â”€â”€ 3. control.lifecycle_transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'pending_approval')::uuid,   'submit',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'approved')::uuid,           'approve',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'rejected')::uuid,           'deny',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'sent_to_supplier')::uuid,   'send',         true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'sent_to_supplier')::uuid,     (v_s->>'partially_received')::uuid, 'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'fully_received')::uuid,     'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'fully_received')::uuid,     (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,           (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Hold transitions (approved/sent_to_supplier/partially_received -> on_hold; on_hold -> sent_to_supplier; on_hold -> cancelled/closed)
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'sent_to_supplier')::uuid,     (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'sent_to_supplier')::uuid,     'release_hold', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- === SOURCE: 008_journal_entry_lifecycle.sql ===
-- 100_finance/200_document/008_journal_entry_lifecycle.sql
-- Purpose: lifecycle states, transitions, and entity binding for Journal Entry.
-- The state codes intentionally match action-dispatcher.route.ts and the DB
-- journal_entry status guard.

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'journal_entry', 'Journal Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"book-open","ui_color":"#475569","entity_types":["journal_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id
FROM control.lifecycle
WHERE code = 'journal_entry' AND tenant_id IS NULL;

-- Older seeds used pending_review. Rename it when possible so generic actions
-- using pending_approval resolve to the same state row.
UPDATE control.lifecycle_state ls
   SET code = 'pending_approval',
       name = 'Pending Approval',
       is_terminal = false,
       sort_order = 30,
       config = '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb
 WHERE ls.lifecycle_id = v_lc_id
   AND ls.code = 'pending_review'
   AND NOT EXISTS (
       SELECT 1 FROM control.lifecycle_state x
        WHERE x.lifecycle_id = v_lc_id AND x.code = 'pending_approval'
   );

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',            true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                   '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'created',          'Ready',            false, false, 20, '{"ui_color":"#64748B","icon_key":"file-check"}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval', false, false, 30, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',         false, false, 40, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',           false, true,  50, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',         false, true,  60, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',         false, false, 70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

UPDATE control.lifecycle_state
   SET is_terminal = false, sort_order = 70
 WHERE lifecycle_id = v_lc_id AND code = 'rejected';

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state
WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'created')::uuid,          'complete', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'created')::uuid,          (v_s->>'pending_approval')::uuid, 'submit',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'created')::uuid,          'amend',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'created')::uuid,          'amend',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- === SOURCE: 011_payment_entry_lifecycle.sql ===
-- 100_finance/200_document/011_payment_entry_lifecycle.sql
-- Purpose: control.lifecycle + states + transitions + entity_lifecycle binding
--          for Payment Entry (document.payment_entry)
-- Depends on: 010_payment_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- â”€â”€ 1. control.lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'payment_entry', 'Payment Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"banknote","ui_color":"#059669","entity_types":["payment_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'payment_entry' AND tenant_id IS NULL;

-- â”€â”€ 2. control.lifecycle_state (11 states) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',            true,  false,  10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval', false, false,  20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',         false, false,  30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',           false, false,  40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'transmitted',      'Transmitted',      false, false,  50, '{"ui_color":"#0284C7","icon_key":"send"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'printed',          'Printed',          false, false,  60, '{"ui_color":"#0284C7","icon_key":"printer"}'::jsonb,                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cleared',          'Cleared',          false, true,   70, '{"ui_color":"#217346","icon_key":"circle-check"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',         false, true,   80, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'voided',           'Voided',           false, true,   90, '{"ui_color":"#6B7280","icon_key":"slash"}'::jsonb,                               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',        'Cancelled',        false, true,  100, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',         false, true,  110, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                            '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- â”€â”€ 3. control.lifecycle_transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Submission flow
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Approval flow
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Posting
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Post-posting
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'transmitted')::uuid,      'transmit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'printed')::uuid,          'print',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'voided')::uuid,           'void',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Clearance
    (v_lc_id, NULL, (v_s->>'transmitted')::uuid,      (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'printed')::uuid,          (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Re-draft from rejected
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- === SOURCE: 020_commitment_lifecycle.sql (P4) ================================
-- Purpose: commitment header lifecycle. Mirrors document.commitment.cmt_status_chk
--   ('draft','pending_approval','approved','active','partially_fulfilled',
--    'fully_fulfilled','closed','cancelled','expired','suspended','rejected')
--
-- Referenced by control.entity(entity_code='purchase_order').lifecycle_code
-- so descriptors resolving to a valid lifecycle now find one. state_flags
-- carries the P4 behavioural markers that services read via
-- getLifecycleStatesWithFlag â€” replacing hardcoded status IN (...) lists.
--
-- is_transactable_source=true  â†’ downstream receipt / SES / invoice creation
--                                 accepts this commitment as source.
-- is_mutable=true              â†’ generic advisory that non-status field edits
--                                 are permitted (field-level rules from the
--                                 write descriptor still apply).

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'commitment', 'Commitment Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"handshake","ui_color":"#0891B2","entity_types":["commitment","purchase_order"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'commitment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, state_flags, created_by)
VALUES
    (v_lc_id, NULL, 'draft',                'Draft',                true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,
     '{"is_mutable":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',     'Pending Approval',     false, false, 20,
     '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,
     '{"is_mutable":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',             'Approved',             false, false, 30,
     '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,
     '{"is_transactable_source":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',             'Rejected',             false, false, 35,
     '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,
     '{"is_mutable":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',               'Active',               false, false, 40,
     '{"ui_color":"#0891B2","icon_key":"send"}'::jsonb,
     '{"is_transactable_source":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_fulfilled',  'Partially Fulfilled',  false, false, 50,
     '{"ui_color":"#E8A020","icon_key":"package-open"}'::jsonb,
     '{"is_transactable_source":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_fulfilled',      'Fully Fulfilled',      false, false, 60,
     '{"ui_color":"#217346","icon_key":"package-check"}'::jsonb,
     '{}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',            'Suspended',            false, false, 65,
     '{"ui_color":"#D97706","icon_key":"pause-circle"}'::jsonb,
     '{}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',               'Closed',               false, true,  70,
     '{"ui_color":"#217346","icon_key":"lock"}'::jsonb,
     '{}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'expired',              'Expired',              false, true,  80,
     '{"ui_color":"#B45309","icon_key":"clock-off"}'::jsonb,
     '{}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',            'Cancelled',            false, true,  90,
     '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,
     '{}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state
WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'pending_approval')::uuid, 'submit',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'cancelled')::uuid,        'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'approved')::uuid,         'approve',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'rejected')::uuid,         'reject',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'draft')::uuid,            'return',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'cancelled')::uuid,        'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,            (v_s->>'draft')::uuid,            'revise',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'active')::uuid,           'PO.PLACE_ORDER', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'suspended')::uuid,        'PO.HOLD',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,           (v_s->>'approved')::uuid,         'PO.RELEASE_HOLD', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'closed')::uuid,           'PO.SHORT_CLOSE', true, '{"require_comment":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'expired')::uuid,          'PO.EXPIRE',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'suspended')::uuid,        'PO.HOLD',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,           (v_s->>'active')::uuid,           'PO.RELEASE_HOLD', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'closed')::uuid,           'PO.SHORT_CLOSE', true, '{"require_comment":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'cancelled')::uuid,        'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'expired')::uuid,          'PO.EXPIRE',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Fulfilment is system-derived from posted receipt/service-sheet totals.
    -- The public permission remains create_receipt; the command identity is
    -- preserved in lifecycle/audit/outbox payloads by the orchestrator.
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'partially_fulfilled')::uuid, 'create_receipt', true, '{"require_comment":false,"system_derived":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,              (v_s->>'fully_fulfilled')::uuid,     'create_receipt', true, '{"require_comment":false,"system_derived":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_fulfilled')::uuid, (v_s->>'fully_fulfilled')::uuid,     'create_receipt', true, '{"require_comment":false,"system_derived":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_fulfilled')::uuid, (v_s->>'suspended')::uuid,        'PO.HOLD',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,           (v_s->>'partially_fulfilled')::uuid, 'PO.RELEASE_HOLD', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_fulfilled')::uuid, (v_s->>'closed')::uuid,           'PO.SHORT_CLOSE', true, '{"require_comment":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_fulfilled')::uuid, (v_s->>'cancelled')::uuid,        'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'fully_fulfilled')::uuid,     (v_s->>'closed')::uuid,           'close',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO UPDATE
SET operation_code = EXCLUDED.operation_code,
    is_active = true,
    config = EXCLUDED.config,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000';

END $$;

UPDATE control.lifecycle
   SET is_active = false,
       config = COALESCE(config, '{}'::jsonb)
                || jsonb_build_object('retired_by', 'commitment', 'retired_reason', 'purchase_order facade binds to commitment lifecycle'),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL
   AND code = 'purchase_order';


-- === Purchase Invoice â€” retro-fit state_flags (P4) ===========================
-- The purchase_invoice lifecycle is already seeded above; this UPDATE writes
-- the P4 behavioural flags without disturbing the existing rows. Only the
-- flag targets referenced by runtime services are set.
--
-- is_payable_source=true â†’ an invoice in this state is eligible to appear in
--                          the payment-allocation grid (open payables list).
-- is_transactable_source=true (approved/posted) â†’ downstream reversal /
--                          payment operations accept this invoice.
-- is_mutable=true â†’ the field write descriptor is the source of truth; the
--                   flag mirrors the state's own editable_in_status posture
--                   for callers that want a lifecycle-level advisory.

-- Repair the older rejected-state definition before canonical flags are
-- normalized below. This keeps reruns deterministic when the row already
-- exists from an earlier seed revision.
UPDATE control.lifecycle_state ls
   SET is_terminal = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.code = 'purchase_invoice'
   AND lc.tenant_id IS NULL
   AND ls.code = 'rejected';

UPDATE control.lifecycle_state ls
   SET state_flags = ls.state_flags || jsonb_build_object('is_mutable', true),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.code = 'purchase_invoice'
   AND lc.tenant_id IS NULL
   AND ls.code IN ('draft','rejected');

UPDATE control.lifecycle_state ls
   SET state_flags = ls.state_flags
                     || jsonb_build_object('is_payable_source', true)
                     || jsonb_build_object('is_transactable_source', true),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.code = 'purchase_invoice'
   AND lc.tenant_id IS NULL
   AND ls.code IN ('posted','partially_paid');

UPDATE control.lifecycle_state ls
   SET state_flags = ls.state_flags || jsonb_build_object('is_transactable_source', true),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.code = 'purchase_invoice'
   AND lc.tenant_id IS NULL
   AND ls.code = 'approved';

-- Canonical lifecycle behavior flags consumed by the capability compiler.
-- Existing domain-specific flags remain intact; these keys replace runtime
-- status-name allowlists with conservative state behavior.
UPDATE control.lifecycle_state ls
   SET state_flags = COALESCE(ls.state_flags, '{}'::jsonb) || jsonb_build_object(
         'is_editable',   COALESCE((ls.state_flags ->> 'is_editable')::boolean,
                                  (ls.state_flags ->> 'is_mutable')::boolean, false),
         'is_committed',  COALESCE((ls.state_flags ->> 'is_committed')::boolean,
                                  NOT ls.is_initial
                                  AND NOT COALESCE((ls.state_flags ->> 'is_mutable')::boolean, false)),
         'is_terminal',   ls.is_terminal,
         'is_deletable',  COALESCE((ls.state_flags ->> 'is_deletable')::boolean,
                                  ls.is_initial AND NOT ls.is_terminal),
         'is_reversible', COALESCE((ls.state_flags ->> 'is_reversible')::boolean, false)
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.tenant_id IS NULL;

UPDATE control.lifecycle_state ls
   SET state_flags = ls.state_flags || jsonb_build_object('is_reversible', true),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.lifecycle lc
 WHERE ls.lifecycle_id = lc.id
   AND lc.tenant_id IS NULL
   AND lc.code IN ('purchase_invoice', 'journal_entry', 'payment_entry')
   AND COALESCE((ls.state_flags ->> 'is_committed')::boolean, false)
   AND NOT ls.is_terminal;
