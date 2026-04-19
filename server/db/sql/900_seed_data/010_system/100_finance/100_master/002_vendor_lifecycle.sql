-- 100_finance/100_master/002_vendor_lifecycle.sql
-- Purpose: control.lifecycle + 5 states + 7 transitions + entity_lifecycle binding
--          for the Vendor (master.supplier) entity
-- Depends on: 001_vendor.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'vendor', 'Vendor Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"building-2","ui_color":"#1D4ED8","entity_types":["vendor"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'vendor' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (5 states) ────────────────────────────────────
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

-- ── 3. control.lifecycle_transition (7 edges) ────────────────────────────────
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

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
-- Idempotency fix: migrate old binding if it was inserted as 'supplier'
UPDATE control.entity_lifecycle
SET entity_name = 'vendor'
WHERE entity_name = 'supplier' AND lifecycle_id = v_lc_id AND tenant_id IS NULL;

INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('vendor', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

END $$;
