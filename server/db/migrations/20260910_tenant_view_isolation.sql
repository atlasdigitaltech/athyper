BEGIN;
ALTER VIEW document.active_attachment SET (security_invoker = true, security_barrier = true);
ALTER VIEW document.active_comment SET (security_invoker = true, security_barrier = true);
COMMIT;
