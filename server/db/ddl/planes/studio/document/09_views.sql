CREATE VIEW document.active_attachment
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
  FROM document.attachment
 WHERE status NOT IN ('deleted', 'expired', 'rejected');

CREATE VIEW document.active_comment
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
  FROM document.comment
 WHERE deleted_at IS NULL
   AND status <> 'deleted';
