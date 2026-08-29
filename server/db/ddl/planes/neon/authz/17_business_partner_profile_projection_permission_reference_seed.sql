INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT permission.id, permission.code, 'entity_operation', module.id,
       permission.risk::authz.risk_tier_d, permission.mfa, false, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-profile-projection","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('c8fc15f7-82fc-5d55-9c9a-1fa67680c4c1'::uuid, 'neon.business_partner_profile_projection.receive', 'medium', false),
    ('b9663a43-b8aa-506f-882d-5210e861cfbd'::uuid, 'neon.business_partner_profile_projection.read', 'low', false),
    ('1af763bc-5615-51da-93ba-b339e065af44'::uuid, 'neon.business_partner_profile_projection.replay', 'high', true)
) AS permission(id, code, risk, mfa)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier = EXCLUDED.risk_tier,
    requires_mfa = EXCLUDED.requires_mfa,
    metadata = authz.permission.metadata || EXCLUDED.metadata,
    status = 'published';

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT id, 'tenant', 'exact', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code IN (
    'neon.business_partner_profile_projection.receive',
    'neon.business_partner_profile_projection.read',
    'neon.business_partner_profile_projection.replay'
)
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active';
