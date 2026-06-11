-- ============================================================================
-- seed/platform/003_control/097_mesh_permissions.sql
-- Seed: mesh-plane permission codes + category.
-- Schema: shared | Tables: permission_category, permission
-- Depends on: 015_permission_category.sql, 017_permission.sql, 01z_three_plane_extensions.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  Section 8.1
--
-- Mesh permissions are scoped to buyer/partner actions and partner management
-- entry points. All rows carry plane_eligibility = ['mesh'].
-- ============================================================================

-- §1 Mesh category
INSERT INTO shared.permission_category (code, name, sort_order, created_by)
VALUES
    ('mesh_collaboration', 'Mesh Collaboration', 110, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO NOTHING;


-- §2 Mesh permission codes
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted,
     plane_eligibility, sort_order, created_by)
SELECT v.code, v.name, c.id, v.scope, v.risk, false,
       ARRAY['mesh']::text[], v.so,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM   shared.permission_category c
JOIN  (VALUES
    ('MESH.BUYER.VIEW',      'View Buyer',        'record', 'low',     10),
    ('MESH.BUYER.CONNECT',    'Connect Buyer',      'record', 'medium',  20),
    ('MESH.BUYER.RESPOND',    'Respond as Buyer',   'record', 'medium',  30),
    ('MESH.BUYER.MANAGE',     'Manage Buyer',       'tenant', 'high',    40),
    ('MESH.PARTNER.VIEW',     'View Partner',       'record', 'low',     50),
    ('MESH.PARTNER.RESPOND',  'Respond as Partner', 'record', 'medium',  60),
    ('MESH.PARTNER.MANAGE',   'Manage Partner',     'tenant', 'high',    70)
) AS v(code, name, scope, risk, so) ON c.code = 'mesh_collaboration'
ON CONFLICT (code) DO NOTHING;
