-- Keep the established projection independent of later attachment column additions.
CREATE VIEW document.active_attachment
WITH (security_invoker = true, security_barrier = true) AS
SELECT id,
       tenant_id,
       file_name,
       original_filename,
       content_type,
       size_bytes,
       sha256,
       kind,
       storage_bucket,
       storage_key,
       is_virus_scanned,
       version_no,
       parent_attachment_id,
       reference_count,
       is_active,
       is_auto_delete_on_expiry,
       expires_at,
       retention_until,
       uploaded_by,
       metadata,
       status,
       status_changed_at,
       status_changed_by,
       created_at,
       created_by,
       updated_at,
       updated_by,
       extracted_text,
       extracted_text_chars,
       text_extracted_at,
       text_extraction_status,
       text_extraction_error,
       pii_detected,
       pii_types,
       pii_scanned_at,
       series_id
  FROM document.attachment
 WHERE status NOT IN ('deleted', 'expired', 'rejected');

CREATE VIEW document.active_comment
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
  FROM document.comment
 WHERE deleted_at IS NULL
   AND status <> 'deleted';
