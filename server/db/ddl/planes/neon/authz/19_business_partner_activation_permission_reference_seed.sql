INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT 'ec73bb07-5bb4-5343-a5b4-8e99e22b54dc'::uuid,
       'neon.relationship.business_partner.activate', 'entity_operation', module.id,
       'high', true, true, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-activation","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier = EXCLUDED.risk_tier,
    requires_mfa = EXCLUDED.requires_mfa,
    requires_sod = EXCLUDED.requires_sod,
    metadata = authz.permission.metadata || EXCLUDED.metadata,
    status = 'published';

INSERT INTO authz.permission_scope_kind (
    permission_id, scope_kind, propagation_mode, status, created_by
)
SELECT id, 'operating_organization', 'subtree', 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code = 'neon.relationship.business_partner.activate'
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active';
