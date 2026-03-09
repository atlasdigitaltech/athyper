-- ============================================================================
-- Collection Role Semantics
-- ============================================================================
-- Adds an optional `role` key to collection_behavior JSONB on meta.field.
--
-- Purpose: When a parent entity has multiple cardinality='many' collections,
-- `role` disambiguates which collection serves which structural purpose.
--
-- Known roles:
--   'document_lines'   — Primary line-item collection (invoices, orders, etc.)
--   'tax_lines'        — Tax detail breakdown lines
--   'attachments'      — File attachment collection
--   'approvals'        — Approval workflow entries
--   'comments'         — Discussion/comment thread
--
-- The resolver uses role='document_lines' to deterministically select the
-- primary line-item collection when multiple many-collections exist.
--
-- When only one cardinality='many' collection exists, role is optional —
-- the resolver falls back to the single-collection heuristic.
--
-- Constraint: if role is present, it must be a known value.
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_role;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_role
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'role'
        OR (collection_behavior ->> 'role') IN (
            'document_lines',
            'tax_lines',
            'attachments',
            'approvals',
            'comments'
        )
    );

-- Index for efficient role-based lookups
CREATE INDEX IF NOT EXISTS idx_field_collection_role
    ON meta.field ((collection_behavior ->> 'role'))
    WHERE collection_behavior IS NOT NULL
      AND collection_behavior ? 'role';
