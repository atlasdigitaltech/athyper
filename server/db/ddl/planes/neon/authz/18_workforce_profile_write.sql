-- Govern non-sensitive structured profile maintenance by employee company scope.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT '7b84b98f-6814-4ee6-a65c-4959ca51de08'::uuid,'neon.workforce.profile.write','entity_operation',module.id,'high',false,false,false,false,false,'{"_seed":{"pack":"neon.workforce.profile.write","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'company_code','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.workforce.profile.write'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
