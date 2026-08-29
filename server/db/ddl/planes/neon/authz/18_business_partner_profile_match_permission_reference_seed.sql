INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT permission.id, permission.code, 'entity_operation', module.id,
       permission.risk::authz.risk_tier_d, permission.mfa, false, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-profile-match","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('a8185d65-1eb9-5b58-96be-19fef76634b0'::uuid, 'neon.business_partner_profile_match.create', 'medium', false),
    ('f948f032-5e54-55d6-b0f0-048942353677'::uuid, 'neon.business_partner_profile_match.read', 'low', false),
    ('488c0f90-ca12-5fa3-9e73-e4c65886977e'::uuid, 'neon.business_partner_profile_match.request', 'high', true)
) AS permission(id, code, risk, mfa)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier=EXCLUDED.risk_tier, requires_mfa=EXCLUDED.requires_mfa,
    metadata=authz.permission.metadata || EXCLUDED.metadata, status='published';

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT id, 'operating_organization', 'subtree', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code IN (
    'neon.business_partner_profile_match.create',
    'neon.business_partner_profile_match.read',
    'neon.business_partner_profile_match.request'
)
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status='active';
