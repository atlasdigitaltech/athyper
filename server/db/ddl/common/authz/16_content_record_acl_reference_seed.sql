-- Canonical exact-record content permissions used by authz.record_acl.
INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT permission.id, permission.code, 'entity_operation', module.id,
       permission.risk::authz.risk_tier_d, false, false, true, false, false,
       jsonb_build_object('content_access_level', permission.access_level, 'content_access_rank', permission.access_rank,
                          '_seed', jsonb_build_object('pack', 'common.content-record-acl', 'version', '1.0.0')),
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('9d66c90c-e450-55af-946f-4c15ef89e70e'::uuid, 'document.content_item.read',    'read',    1, 'low'),
    ('f1becff1-6212-51bb-85d7-7031d536e185'::uuid, 'document.content_item.write',   'write',   2, 'medium'),
    ('a93a3aaa-62cd-572d-985b-ff93b7e4aba1'::uuid, 'document.content_item.publish', 'publish', 3, 'high'),
    ('a2c31ba7-51ad-5df3-a2ba-83f3f987054c'::uuid, 'document.content_item.admin',   'admin',   4, 'high')
) AS permission(id, code, access_level, access_rank, risk)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    is_shareable = true,
    metadata = authz.permission.metadata || EXCLUDED.metadata,
    status = 'published';

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT id, 'resource', 'exact', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code LIKE 'document.content_item.%'
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active';
