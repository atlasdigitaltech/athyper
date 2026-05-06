-- ============================================================================
-- master/01k_comment_entity_id_text.sql
-- Fix: master.comment + master.comment_draft entity_id uuid → text
--      Add: master.comment.status column (open / resolved)
--
-- Root cause: entity records in this system use human-readable codes
-- (INV-A4-0001, SUP-ATHQ-GCM-001) as their public identifiers, not UUIDs.
-- The collab GET /comments?entityId= route receives the record code, but
-- entity_id was typed uuid → Postgres rejected the value.
--
-- Safe to run on any existing DB — uses IF EXISTS / IF NOT EXISTS.
-- ============================================================================


-- ── master.comment ────────────────────────────────────────────────────────────

-- Drop triggers that reference entity_id in their UPDATE OF column list.
-- PostgreSQL rejects ALTER COLUMN TYPE when the column is listed in a
-- column-level trigger definition (even if the trigger body doesn't use it).
DROP TRIGGER IF EXISTS trg_comment_hierarchy_guard ON master.comment;

-- Drop indexes that include entity_id before the type change.
DROP INDEX IF EXISTS master.comment_entity_idx;
DROP INDEX IF EXISTS master.comment_root_pidx;

ALTER TABLE master.comment
  ALTER COLUMN entity_id TYPE text USING entity_id::text;

-- Trigger is recreated by 06_triggers.sql (function defined there).

-- Recreate indexes.
CREATE INDEX IF NOT EXISTS comment_entity_idx
    ON master.comment (tenant_id, context_type, entity_type, entity_id,
                       created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS comment_root_pidx
    ON master.comment (tenant_id, entity_type, entity_id, created_at DESC)
    WHERE parent_comment_id IS NULL AND deleted_at IS NULL;

-- Add status column used by batchCommentCountHandler to track open vs resolved.
ALTER TABLE master.comment
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

ALTER TABLE master.comment
  DROP CONSTRAINT IF EXISTS comment_status_chk;

ALTER TABLE master.comment
  ADD CONSTRAINT comment_status_chk CHECK (status IN ('open', 'resolved'));

CREATE INDEX IF NOT EXISTS comment_status_idx
    ON master.comment (tenant_id, entity_type, entity_id, status)
    WHERE deleted_at IS NULL;


-- ── master.comment_draft ──────────────────────────────────────────────────────

-- The UNIQUE constraint and index on entity_id must be dropped before
-- altering the column type.
ALTER TABLE master.comment_draft
  DROP CONSTRAINT IF EXISTS cd_one_per_target_uq;

DROP INDEX IF EXISTS master.cd_principal_entity_idx;

ALTER TABLE master.comment_draft
  ALTER COLUMN entity_id TYPE text USING entity_id::text;

-- Recreate the unique constraint and index.
ALTER TABLE master.comment_draft
  ADD CONSTRAINT cd_one_per_target_uq UNIQUE NULLS NOT DISTINCT
    (tenant_id, principal_id, entity_type, entity_id, parent_comment_id);

CREATE INDEX IF NOT EXISTS cd_principal_entity_idx
    ON master.comment_draft (tenant_id, principal_id, entity_type, entity_id);
