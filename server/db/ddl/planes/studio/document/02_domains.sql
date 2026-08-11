-- Unified document, content, and collaboration domains.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'comment_content_format_d'
  ) THEN
    CREATE DOMAIN document.comment_content_format_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'comment_visibility_d'
  ) THEN
    CREATE DOMAIN document.comment_visibility_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'content_status_d'
  ) THEN
    CREATE DOMAIN document.content_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'conversation_status_d'
  ) THEN
    CREATE DOMAIN document.conversation_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'multipart_upload_status_d'
  ) THEN
    CREATE DOMAIN document.multipart_upload_status_d AS text;
  END IF;
END $$;

ALTER DOMAIN document.attachment_status_d DROP CONSTRAINT IF EXISTS attachment_status_d_check;
ALTER DOMAIN document.attachment_status_d ADD CONSTRAINT attachment_status_d_check
    CHECK (VALUE IN (
        'pending', 'uploading', 'uploaded', 'processing', 'active',
        'quarantined', 'rejected', 'orphaned', 'archived',
        'expired', 'deleted', 'failed'
    ));

ALTER DOMAIN document.comment_content_format_d DROP CONSTRAINT IF EXISTS comment_content_format_d_check;
ALTER DOMAIN document.comment_content_format_d ADD CONSTRAINT comment_content_format_d_check
    CHECK (VALUE IN ('plain', 'rich_json', 'sanitized_html'));

ALTER DOMAIN document.comment_visibility_d DROP CONSTRAINT IF EXISTS comment_visibility_d_check;
ALTER DOMAIN document.comment_visibility_d ADD CONSTRAINT comment_visibility_d_check
    CHECK (VALUE IN ('public', 'internal', 'private'));

ALTER DOMAIN document.content_status_d DROP CONSTRAINT IF EXISTS content_status_d_check;
ALTER DOMAIN document.content_status_d ADD CONSTRAINT content_status_d_check
    CHECK (VALUE IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'));

ALTER DOMAIN document.conversation_status_d DROP CONSTRAINT IF EXISTS conversation_status_d_check;
ALTER DOMAIN document.conversation_status_d ADD CONSTRAINT conversation_status_d_check
    CHECK (VALUE IN ('active', 'archived', 'deleted'));

ALTER DOMAIN document.multipart_upload_status_d DROP CONSTRAINT IF EXISTS multipart_upload_status_d_check;
ALTER DOMAIN document.multipart_upload_status_d ADD CONSTRAINT multipart_upload_status_d_check
    CHECK (VALUE IN ('initiated', 'uploading', 'completed', 'aborted', 'expired', 'failed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_series_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_series_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_derivative_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_derivative_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_hold_event_type_d'
  ) THEN
    CREATE DOMAIN document.attachment_hold_event_type_d AS text;
  END IF;
END $$;

ALTER DOMAIN document.attachment_series_status_d DROP CONSTRAINT IF EXISTS attachment_series_status_d_check;
ALTER DOMAIN document.attachment_series_status_d ADD CONSTRAINT attachment_series_status_d_check
    CHECK (VALUE IN ('active', 'expired', 'deleted', 'purge_requested', 'purge_processing', 'purged'));

ALTER DOMAIN document.attachment_derivative_status_d DROP CONSTRAINT IF EXISTS attachment_derivative_status_d_check;
ALTER DOMAIN document.attachment_derivative_status_d ADD CONSTRAINT attachment_derivative_status_d_check
    CHECK (VALUE IN ('pending', 'processing', 'ready', 'skipped', 'failed', 'deleted'));

ALTER DOMAIN document.attachment_hold_event_type_d DROP CONSTRAINT IF EXISTS attachment_hold_event_type_d_check;
ALTER DOMAIN document.attachment_hold_event_type_d ADD CONSTRAINT attachment_hold_event_type_d_check
    CHECK (VALUE IN ('placed', 'released'));
