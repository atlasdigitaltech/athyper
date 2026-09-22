-- Policy publication and User/profile review are separate from draft creation.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT definition.id,definition.code,'entity_operation',module.id,definition.risk::authz.risk_tier_d,definition.mfa,definition.sod,false,false,false,'{"_seed":{"pack":"neon.hr.stage2.followup","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN (VALUES
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0d'::uuid,'neon.hr.policy.country.write','high',true,false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0e'::uuid,'neon.hr.policy.publish','high',true,true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de0f'::uuid,'neon.user.admin.write','high',true,true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de10'::uuid,'neon.user.profile.review','high',true,true)
) definition(id,code,risk,mfa,sod)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,CASE WHEN canonical_code IN('neon.hr.policy.country.write','neon.user.admin.write','neon.user.profile.review') THEN 'tenant'::authz.scope_kind_d ELSE 'company_code'::authz.scope_kind_d END,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code IN('neon.hr.policy.country.write','neon.hr.policy.publish','neon.user.admin.write','neon.user.profile.review')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code='neon.hr.policy.publish'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
