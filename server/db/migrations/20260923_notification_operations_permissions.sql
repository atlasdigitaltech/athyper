BEGIN;
SET LOCAL lock_timeout='5s';
SELECT set_config('app.database_plane','neon',true);
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon database required'; END IF; END $$;
-- Notification operations are explicit tenant capabilities, never subscriber privileges.
DO $$ BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN RAISE EXCEPTION 'Neon notification permission catalog required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN RAISE EXCEPTION 'Active foundation module required'; END IF;
END $$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT md5('athyper:permission:'||definition.code)::uuid,definition.code,definition.kind::authz.permission_kind_d,module.id,definition.risk::authz.risk_tier_d,false,false,false,false,false,'{"_seed":{"pack":"neon.notification-operations","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN (VALUES ('notifications.delivery.read','capability','medium'),('notifications.delivery.replay','system_action','high')) definition(code,kind,risk)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant'::authz.scope_kind_d,'exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN ('notifications.delivery.read','notifications.delivery.replay')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
-- No user, group, role, or tenant grant is created here.

COMMIT;
