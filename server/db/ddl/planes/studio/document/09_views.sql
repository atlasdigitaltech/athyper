CREATE VIEW document.active_attachment AS
SELECT *
  FROM document.attachment
 WHERE status NOT IN ('deleted', 'expired', 'rejected');

CREATE VIEW document.active_comment AS
SELECT *
  FROM document.comment
 WHERE deleted_at IS NULL
   AND status <> 'deleted';
