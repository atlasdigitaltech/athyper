INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT definition.id,definition.code,'entity_operation',module.id,'high'::authz.risk_tier_d,true,definition.sod,false,false,false,'{"_seed":{"pack":"neon.hr.setup.governance","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN (VALUES
 ('7b84b98f-6814-4ee6-a65c-4959ca51de11'::uuid,'neon.hr.setup.catalog.write',false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de12'::uuid,'neon.hr.setup.catalog.publish',true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de13'::uuid,'neon.hr.setup.publish',true)
) definition(id,code,sod)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,CASE WHEN canonical_code='neon.hr.setup.publish' THEN 'company_code'::authz.scope_kind_d ELSE 'tenant'::authz.scope_kind_d END,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code IN('neon.hr.setup.catalog.write','neon.hr.setup.catalog.publish','neon.hr.setup.publish')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
