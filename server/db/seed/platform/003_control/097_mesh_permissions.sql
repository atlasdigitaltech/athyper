-- ============================================================================
-- seed/platform/003_control/097_mesh_permissions.sql
-- Seed: mesh-plane permission codes + category.
-- Schema: shared | Tables: permission_category, permission
-- Depends on: 015_permission_category.sql, 017_permission.sql, 01z_three_plane_extensions.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  Section 8.1
--
-- Mesh permissions are scoped to record-level partner actions (view, respond,
-- upload, withdraw, accept, reject) plus self-service binding revocation and
-- notification subscription. All rows carry plane_eligibility = ['mesh'].
-- ============================================================================

-- §1  Mesh category
INSERT INTO shared.permission_category (code, name, sort_order, created_by)
VALUES
    ('mesh_collab', 'Mesh Collaboration', 110, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO NOTHING;


-- §2  Mesh permission codes
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted,
     plane_eligibility, sort_order, created_by)
SELECT v.code, v.name, c.id, v.scope, v.risk, false,
       ARRAY['mesh']::text[], v.so,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM   shared.permission_category c
JOIN  (VALUES
    ('mesh.document.view',         'View Shared Document',          'record', 'low',    10),
    ('mesh.document.respond',      'Respond to Document',           'record', 'medium', 20),
    ('mesh.document.upload',       'Upload Document/Attachment',    'record', 'medium', 30),
    ('mesh.document.withdraw',     'Withdraw Submitted Document',   'record', 'high',   40),
    ('mesh.document.accept',       'Accept Document',               'record', 'medium', 50),
    ('mesh.document.reject',       'Reject Document',               'record', 'medium', 60),
    ('mesh.thread.comment',        'Comment on Document Thread',    'record', 'low',    70),
    ('mesh.attachment.upload',     'Upload Attachment',             'record', 'low',    80),
    ('mesh.binding.self_revoke',   'Revoke Own Binding',            'tenant', 'medium', 90),
    ('mesh.notification.subscribe','Manage Notification Channels',  'tenant', 'low',    100)
) AS v(code, name, scope, risk, so) ON c.code = 'mesh_collab'
ON CONFLICT (code) DO NOTHING;
