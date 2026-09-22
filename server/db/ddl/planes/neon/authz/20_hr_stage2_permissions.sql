-- Stage 2 setup and User-app permissions. Self-service remains additionally
-- constrained by principal ownership in document.user_profile_update_request.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT definition.id,definition.code,'entity_operation',module.id,definition.risk::authz.risk_tier_d,definition.mfa,false,false,false,false,'{"_seed":{"pack":"neon.hr.stage2","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN (VALUES
 ('7b84b98f-6814-4ee6-a65c-4959ca51de09'::uuid,'neon.hr.setup.read','medium',false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0a'::uuid,'neon.hr.setup.write','high',true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0b'::uuid,'neon.user.directory.read','high',true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0c'::uuid,'neon.user.profile.request','low',false)
) definition(id,code,risk,mfa)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,CASE WHEN canonical_code IN('neon.hr.setup.read','neon.hr.setup.write') THEN 'company_code'::authz.scope_kind_d ELSE 'tenant'::authz.scope_kind_d END,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code IN('neon.hr.setup.read','neon.hr.setup.write','neon.user.directory.read','neon.user.profile.request')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
