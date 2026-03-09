/* ============================================================================
   Athyper — Transition Gate FK

   Adds missing FK from meta.lifecycle_transition_gate.approval_template_id
   to meta.approval_template(id). ON DELETE RESTRICT prevents orphaned gates.

   PostgreSQL 16+
   Depends on: 040_meta.sql
   ============================================================================ */

-- ============================================================================
-- 1. BACKFILL VALIDATION — detect orphaned approval_template_id references
-- ============================================================================

DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM meta.lifecycle_transition_gate g
  WHERE g.approval_template_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM meta.approval_template t
      WHERE t.id = g.approval_template_id
    );

  IF orphan_count > 0 THEN
    RAISE WARNING '% lifecycle_transition_gate row(s) reference non-existent approval_template — nullifying', orphan_count;

    UPDATE meta.lifecycle_transition_gate
    SET approval_template_id = NULL
    WHERE approval_template_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM meta.approval_template t
        WHERE t.id = meta.lifecycle_transition_gate.approval_template_id
      );
  END IF;
END;
$$;

-- ============================================================================
-- 2. ADD FOREIGN KEY CONSTRAINT
-- ============================================================================

ALTER TABLE meta.lifecycle_transition_gate
  DROP CONSTRAINT IF EXISTS fk_gate_approval_template;

ALTER TABLE meta.lifecycle_transition_gate
  ADD CONSTRAINT fk_gate_approval_template
    FOREIGN KEY (approval_template_id)
    REFERENCES meta.approval_template(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_gate_approval_template ON meta.lifecycle_transition_gate IS
  'Ensures approval_template_id references an existing approval template. RESTRICT prevents deleting templates still bound to transition gates.';
