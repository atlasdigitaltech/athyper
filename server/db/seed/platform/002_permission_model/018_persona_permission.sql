-- seed/platform/002_permission_model/018_persona_permission.sql
-- Seed: Persona by permission category + plane grants.
-- Schema: shared | Table: persona_permission
-- Depends on: 010_persona.sql, 015_permission_category.sql, 017_permission.sql
-- Idempotent: ON CONFLICT (persona_id, permission_id) DO UPDATE
--
-- Design:
--  1) plane_eligibility gates persona reachability (neon / mesh / admin).
--  2) Persona grants are derived per cluster:
--       viewer < reporter < requester < agent < manager < owner < admin
--  3) owner/admin include admin-plane permissions.

WITH permission_catalog AS (
  SELECT p.id AS permission_id, p.code, p.plane_eligibility, pc.code AS category_code
  FROM shared.permission p
  JOIN shared.permission_category pc
    ON pc.id = p.category_id
  WHERE p.status = 'active'
),
viewer_permissions AS (
  SELECT permission_id
  FROM permission_catalog
  WHERE 'neon' = ANY(plane_eligibility)
    AND (
      (category_code = 'entity' AND code IN ('read'))
      OR (category_code = 'collaboration' AND code IN ('follow', 'tag'))
      OR (category_code = 'utility' AND code IN ('report', 'print', 'export'))
    )
),
reporter_permissions AS (
  SELECT permission_id FROM viewer_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'neon' = ANY(plane_eligibility)
    AND category_code IN ('collaboration', 'special')
    AND code IN ('add_comment', 'add_attachment', 'approve', 'deny')
),
requester_permissions AS (
  SELECT permission_id FROM reporter_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'neon' = ANY(plane_eligibility)
    AND category_code IN ('entity', 'workflow', 'utility')
    AND code IN (
      'create',
      'update',
      'edit',
      'delete_draft',
      'submit',
      'amend',
      'cancel',
      'withdraw',
      'escalate',
      'copy',
      'report',
      'print',
      'export',
      'follow',
      'tag',
      'add_comment',
      'add_attachment',
      'delegate',
      'share_read'
    )
),
agent_permissions AS (
  SELECT permission_id FROM requester_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'neon' = ANY(plane_eligibility)
    AND category_code IN ('entity', 'workflow', 'finance')
    AND code IN (
      'delete',
      'close',
      'reopen',
      'post',
      'reconcile',
      'return',
      'import'
    )
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE code LIKE 'MESH.BUYER.%'
),
manager_permissions AS (
  SELECT permission_id FROM agent_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'neon' = ANY(plane_eligibility)
    AND category_code IN ('workflow', 'finance', 'collaboration')
    AND code IN (
      'reverse',
      'merge',
      'share_edit',
      'del_others_comment',
      'del_others_attach',
      'approve'
    )
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE code LIKE 'MESH.PARTNER.%'
),
owner_permissions AS (
  SELECT permission_id FROM manager_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'admin' = ANY(plane_eligibility)
),
admin_permissions AS (
  SELECT permission_id FROM owner_permissions
),
persona_permission_rows AS (
  SELECT 'viewer'::text AS persona_code, permission_id FROM viewer_permissions
  UNION ALL
  SELECT 'reporter', permission_id FROM reporter_permissions
  UNION ALL
  SELECT 'requester', permission_id FROM requester_permissions
  UNION ALL
  SELECT 'agent', permission_id FROM agent_permissions
  UNION ALL
  SELECT 'manager', permission_id FROM manager_permissions
  UNION ALL
  SELECT 'owner', permission_id FROM owner_permissions
  UNION ALL
  SELECT 'admin', permission_id FROM admin_permissions
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT p.id AS persona_id, e.permission_id, true, '00000000-0000-0000-0000-000000000000'::uuid
FROM persona_permission_rows e
JOIN shared.persona p
  ON p.code = e.persona_code
ON CONFLICT (persona_id, permission_id) DO UPDATE
  SET is_granted = EXCLUDED.is_granted;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.persona_permission;
  RAISE NOTICE '[018_persona_permission] shared.persona_permission: % rows', cnt;
END $$;
