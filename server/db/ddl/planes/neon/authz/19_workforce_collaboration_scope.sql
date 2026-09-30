-- Employee collaboration actions use the admitted employee's company scope.
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,'company_code','exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code IN('neon.collaboration.comment.read','neon.collaboration.comment.create','neon.collaboration.comment.update_own','neon.collaboration.comment.archive_own')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
