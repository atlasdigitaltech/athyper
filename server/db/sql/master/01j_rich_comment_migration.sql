-- ============================================================================
-- master/01j_rich_comment_migration.sql
-- Additive migration: rich comment content columns
--
-- Safe to run on any existing DB — all statements use IF NOT EXISTS / IF EXISTS.
-- For fresh installs, the CREATE TABLE statements in 01_tables_identity.sql
-- already include these columns.
-- ============================================================================

-- ── master.comment ────────────────────────────────────────────────────────────

ALTER TABLE master.comment
  ADD COLUMN IF NOT EXISTS content_format  text  NOT NULL DEFAULT 'plain',
  ADD COLUMN IF NOT EXISTS content_json    jsonb,
  ADD COLUMN IF NOT EXISTS content_html    text,
  ADD COLUMN IF NOT EXISTS attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Relax 5 000-char limit so plain-text extraction from rich content fits.
ALTER TABLE master.comment DROP CONSTRAINT IF EXISTS comment_text_len_chk;
ALTER TABLE master.comment
  ADD CONSTRAINT comment_text_len_chk CHECK (char_length(comment_text) <= 50000);

COMMENT ON COLUMN master.comment.content_format IS
  'Serialization format: plain (legacy), rich_json (TipTap doc), sanitized_html.';
COMMENT ON COLUMN master.comment.content_json IS
  'TipTap ProseMirror document JSON. Canonical source of truth for rich comments.';
COMMENT ON COLUMN master.comment.content_html IS
  'TipTap-serialized HTML generated from content_json on the client. '
  'Safe to render — produced by TipTap serializer, not from raw user HTML.';
COMMENT ON COLUMN master.comment.attachment_refs IS
  'Ordered inline/block attachment references: [{attachment_id, mode}]. '
  'mode: inline_image | file_chip. Reserved for v2 inline-image support.';


-- ── master.comment_draft ──────────────────────────────────────────────────────

ALTER TABLE master.comment_draft
  ADD COLUMN IF NOT EXISTS content_json    jsonb,
  ADD COLUMN IF NOT EXISTS content_html    text,
  ADD COLUMN IF NOT EXISTS attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE master.comment_draft DROP CONSTRAINT IF EXISTS cd_text_len_chk;
ALTER TABLE master.comment_draft
  ADD CONSTRAINT cd_text_len_chk CHECK (char_length(draft_text) <= 50000);
