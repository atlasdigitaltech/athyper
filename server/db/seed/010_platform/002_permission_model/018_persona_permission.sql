-- seed/010_platform/002_permission_model/018_persona_permission.sql
-- Seed: Persona × Permission grant matrix (all grants)
-- Schema: shared | Table: persona_permission
-- Depends on: 010_persona.sql, 017_permission.sql
-- Idempotent: ON CONFLICT (persona_id, permission_id) DO UPDATE
--
-- Grant matrix summary:
--   viewer:    read, report, print, export, follow, tag
--   reporter:  viewer + approve, deny, add_comment, add_attachment
--   requester: read/create/update/edit/delete_draft + submit/amend/cancel/withdraw/escalate
--              + copy/report/print/export + follow/tag + add_comment/add_attachment
--              + delegate/share_read
--              + supplier.tax.submit, supplier.banking.submit, supplier.governance.write
--   agent:     requester + approve/deny/post/reconcile/close/reopen/import
--              + return
--              + supplier.tax.submit, supplier.banking.submit, supplier.governance.write
--   manager:   agent + reverse/merge/share_edit/del_others_comment/del_others_attach
--              + return
--              + supplier.tax.submit, supplier.banking.submit, supplier.governance.write
--   owner:     all non-special base permissions
--              + return
--              + JOBS.BOARD.VIEW, JOBS.QUEUE.MANAGE, IAM.PARAMETER.MANAGE
--              + supplier.tax.submit, supplier.banking.submit, supplier.governance.write
--   admin:     read/create/update/edit/delete_draft/delete + copy/merge/import/report/print/export
--              + bulk_* + delegate/share_read/share_edit + collaboration ops (NO workflow/finance)
--              + JOBS.BOARD.VIEW, IAM.PARAMETER.MANAGE
--              + supplier.tax.submit, supplier.banking.submit, supplier.governance.write
--
-- AI governance permissions (ai.use_extraction, ai.review_ai_output, ai.calibrate_thresholds)
-- are intentionally NOT granted here — they require explicit tenant-level configuration.
-- Supplier verify/restricted/banking.verify/banking.admin/qualification.admin are NOT granted
-- here — those are granted through dedicated finance/compliance role assignments.

WITH persona_grants AS (
  SELECT p.id AS pid, pm.id AS permid, v.is_granted
  FROM shared.persona p
  CROSS JOIN shared.permission pm
  JOIN (VALUES
    -- ── viewer ──────────────────────────────────────────────────────────────
    ('viewer', 'read',           true),
    ('viewer', 'report',         true),
    ('viewer', 'print',          true),
    ('viewer', 'export',         true),
    ('viewer', 'follow',         true),
    ('viewer', 'tag',            true),

    -- ── reporter ─────────────────────────────────────────────────────────────
    ('reporter', 'read',           true),
    ('reporter', 'approve',        true),
    ('reporter', 'deny',           true),
    ('reporter', 'report',         true),
    ('reporter', 'print',          true),
    ('reporter', 'export',         true),
    ('reporter', 'follow',         true),
    ('reporter', 'tag',            true),
    ('reporter', 'add_comment',    true),
    ('reporter', 'add_attachment', true),

    -- ── requester ────────────────────────────────────────────────────────────
    ('requester', 'read',                       true),
    ('requester', 'create',                     true),
    ('requester', 'update',                     true),
    ('requester', 'edit',                       true),
    ('requester', 'delete_draft',               true),
    ('requester', 'submit',                     true),
    ('requester', 'amend',                      true),
    ('requester', 'cancel',                     true),
    ('requester', 'withdraw',                   true),
    ('requester', 'escalate',                   true),
    ('requester', 'copy',                       true),
    ('requester', 'report',                     true),
    ('requester', 'print',                      true),
    ('requester', 'export',                     true),
    ('requester', 'follow',                     true),
    ('requester', 'tag',                        true),
    ('requester', 'add_comment',                true),
    ('requester', 'add_attachment',             true),
    ('requester', 'delegate',                   true),
    ('requester', 'share_read',                 true),
    ('requester', 'supplier.tax.submit',        true),
    ('requester', 'supplier.banking.submit',    true),
    ('requester', 'supplier.governance.write',  true),

    -- ── agent ────────────────────────────────────────────────────────────────
    ('agent', 'read',                       true),
    ('agent', 'create',                     true),
    ('agent', 'update',                     true),
    ('agent', 'edit',                       true),
    ('agent', 'delete_draft',               true),
    ('agent', 'submit',                     true),
    ('agent', 'amend',                      true),
    ('agent', 'cancel',                     true),
    ('agent', 'close',                      true),
    ('agent', 'reopen',                     true),
    ('agent', 'withdraw',                   true),
    ('agent', 'escalate',                   true),
    ('agent', 'approve',                    true),
    ('agent', 'deny',                       true),
    ('agent', 'post',                       true),
    ('agent', 'reconcile',                  true),
    ('agent', 'return',                     true),
    ('agent', 'copy',                       true),
    ('agent', 'import',                     true),
    ('agent', 'report',                     true),
    ('agent', 'print',                      true),
    ('agent', 'export',                     true),
    ('agent', 'follow',                     true),
    ('agent', 'tag',                        true),
    ('agent', 'add_comment',                true),
    ('agent', 'add_attachment',             true),
    ('agent', 'delegate',                   true),
    ('agent', 'share_read',                 true),
    ('agent', 'supplier.tax.submit',        true),
    ('agent', 'supplier.banking.submit',    true),
    ('agent', 'supplier.governance.write',  true),

    -- ── manager ──────────────────────────────────────────────────────────────
    ('manager', 'read',                       true),
    ('manager', 'create',                     true),
    ('manager', 'update',                     true),
    ('manager', 'edit',                       true),
    ('manager', 'delete_draft',               true),
    ('manager', 'submit',                     true),
    ('manager', 'amend',                      true),
    ('manager', 'cancel',                     true),
    ('manager', 'close',                      true),
    ('manager', 'reopen',                     true),
    ('manager', 'withdraw',                   true),
    ('manager', 'escalate',                   true),
    ('manager', 'approve',                    true),
    ('manager', 'deny',                       true),
    ('manager', 'post',                       true),
    ('manager', 'reconcile',                  true),
    ('manager', 'reverse',                    true),
    ('manager', 'return',                     true),
    ('manager', 'copy',                       true),
    ('manager', 'merge',                      true),
    ('manager', 'import',                     true),
    ('manager', 'report',                     true),
    ('manager', 'print',                      true),
    ('manager', 'export',                     true),
    ('manager', 'follow',                     true),
    ('manager', 'tag',                        true),
    ('manager', 'add_comment',                true),
    ('manager', 'add_attachment',             true),
    ('manager', 'del_others_comment',         true),
    ('manager', 'del_others_attach',          true),
    ('manager', 'delegate',                   true),
    ('manager', 'share_read',                 true),
    ('manager', 'share_edit',                 true),
    ('manager', 'supplier.tax.submit',        true),
    ('manager', 'supplier.banking.submit',    true),
    ('manager', 'supplier.governance.write',  true),

    -- ── owner (all non-special base permissions) ─────────────────────────────
    ('owner', 'read',                       true),
    ('owner', 'create',                     true),
    ('owner', 'update',                     true),
    ('owner', 'edit',                       true),
    ('owner', 'delete_draft',               true),
    ('owner', 'delete',                     true),
    ('owner', 'submit',                     true),
    ('owner', 'amend',                      true),
    ('owner', 'cancel',                     true),
    ('owner', 'close',                      true),
    ('owner', 'reopen',                     true),
    ('owner', 'withdraw',                   true),
    ('owner', 'escalate',                   true),
    ('owner', 'approve',                    true),
    ('owner', 'deny',                       true),
    ('owner', 'post',                       true),
    ('owner', 'reverse',                    true),
    ('owner', 'reconcile',                  true),
    ('owner', 'return',                     true),
    ('owner', 'copy',                       true),
    ('owner', 'merge',                      true),
    ('owner', 'import',                     true),
    ('owner', 'report',                     true),
    ('owner', 'print',                      true),
    ('owner', 'export',                     true),
    ('owner', 'bulk_import',                true),
    ('owner', 'bulk_export',                true),
    ('owner', 'bulk_update',                true),
    ('owner', 'bulk_delete',                true),
    ('owner', 'delegate',                   true),
    ('owner', 'share_read',                 true),
    ('owner', 'share_edit',                 true),
    ('owner', 'add_comment',                true),
    ('owner', 'add_attachment',             true),
    ('owner', 'del_others_comment',         true),
    ('owner', 'del_others_attach',          true),
    ('owner', 'follow',                     true),
    ('owner', 'tag',                        true),
    ('owner', 'JOBS.BOARD.VIEW',            true),
    ('owner', 'JOBS.QUEUE.MANAGE',          true),
    ('owner', 'IAM.PARAMETER.MANAGE',       true),
    ('owner', 'supplier.tax.submit',        true),
    ('owner', 'supplier.banking.submit',    true),
    ('owner', 'supplier.governance.write',  true),

    -- ── admin (NO workflow or finance ops — administrative tier only) ─────────
    ('admin', 'read',                       true),
    ('admin', 'create',                     true),
    ('admin', 'update',                     true),
    ('admin', 'edit',                       true),
    ('admin', 'delete_draft',               true),
    ('admin', 'delete',                     true),
    ('admin', 'copy',                       true),
    ('admin', 'merge',                      true),
    ('admin', 'import',                     true),
    ('admin', 'report',                     true),
    ('admin', 'print',                      true),
    ('admin', 'export',                     true),
    ('admin', 'bulk_import',                true),
    ('admin', 'bulk_export',                true),
    ('admin', 'bulk_update',                true),
    ('admin', 'bulk_delete',                true),
    ('admin', 'delegate',                   true),
    ('admin', 'share_read',                 true),
    ('admin', 'share_edit',                 true),
    ('admin', 'add_comment',                true),
    ('admin', 'add_attachment',             true),
    ('admin', 'del_others_comment',         true),
    ('admin', 'del_others_attach',          true),
    ('admin', 'follow',                     true),
    ('admin', 'tag',                        true),
    ('admin', 'JOBS.BOARD.VIEW',            true),
    ('admin', 'IAM.PARAMETER.MANAGE',       true),
    ('admin', 'supplier.tax.submit',        true),
    ('admin', 'supplier.banking.submit',    true),
    ('admin', 'supplier.governance.write',  true)

  ) AS v(pc, pmc, is_granted) ON p.code = v.pc AND pm.code = v.pmc
)
INSERT INTO shared.persona_permission (persona_id, permission_id, is_granted, created_by)
SELECT pid, permid, is_granted, '00000000-0000-0000-0000-000000000000'::uuid
FROM persona_grants
ON CONFLICT (persona_id, permission_id) DO UPDATE
  SET is_granted = EXCLUDED.is_granted;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.persona_permission;
  RAISE NOTICE '[018_persona_permission] shared.persona_permission: % rows', cnt;
END $$;
