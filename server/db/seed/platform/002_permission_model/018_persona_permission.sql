-- Persona × permission grants. Depends on 010 / 015 / 017.
-- Persona ladder: viewer < reporter < requester < agent < manager < owner < admin.
-- Each tier UNIONs the prior; owner/admin pick up everything tagged 'admin' in plane_eligibility.

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
      OR (category_code = 'collaboration' AND code IN ('follow', 'tag', 'attachment.read'))
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
    AND code IN ('add_comment', 'add_attachment', 'attachment.create', 'attachment.update', 'approve', 'deny')
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
      'attachment.delete',
      'attachment.reindex',
      'approve',
      'deny',
      'request_info'
    )
  UNION
  -- Draft session discard — manager-tier op. Common revision flow; not as
  -- destructive as snapshot restore (only reverts to the last submitted
  -- baseline, never an arbitrary historical snapshot).
  SELECT permission_id
  FROM permission_catalog
  WHERE code IN ('PI.DISCARD_SESSION', 'PI.REVERT_TO_BASELINE')
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE code LIKE 'MESH.PARTNER.%'
  UNION
  -- Finance managers may maintain operational address/contact configuration;
  -- assignment scope still limits them to their Legal Entity/Company Codes.
  SELECT permission_id
  FROM permission_catalog
  WHERE code = 'ADDRESS_CONTACT.COMPANY_CODE.MANAGE'
),
owner_permissions AS (
  SELECT permission_id FROM manager_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE 'admin' = ANY(plane_eligibility)
  UNION
  -- Snapshot restore is destructive replay of an arbitrary historical
  -- graph. Owner+ only; never granted to manager/agent. Wired in
  -- snapshots.route.ts:restoreHandler via checkPermission + requireAllow.
  SELECT permission_id
  FROM permission_catalog
  WHERE code IN ('PI.SNAPSHOT_RESTORE')
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE code = 'ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE'
),
admin_permissions AS (
  SELECT permission_id FROM owner_permissions
  UNION
  SELECT permission_id
  FROM permission_catalog
  WHERE code = 'ADDRESS_CONTACT.TENANT.MANAGE'
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
