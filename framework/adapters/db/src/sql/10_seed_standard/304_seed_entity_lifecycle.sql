/* ============================================================================
   Athyper — Entity Lifecycle Backfill
   Sets status='active' and status_changed_at for all seeded entities.
   Must run AFTER 303_seed_entity_identity.sql and
   AFTER 057_entity_registry_lifecycle.sql (schema migration).

   The migration script (057) already does a bulk backfill from the old
   is_active boolean. This seed script additionally stamps the audit columns
   so every entity has a clean lifecycle starting point.

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ============================================================================
-- §1  Ensure all seeded entities are status='active'
-- ============================================================================
-- The migration backfill handles is_active=true→active and is_active=false→retired.
-- This seed is a safety net for any entities inserted before migration ran.

UPDATE meta.entity
SET status = 'active'
WHERE status = 'draft'
  AND entity_code IS NOT NULL;  -- entity_code is set by 303 for all seeded entities

-- ============================================================================
-- §2  Stamp status audit columns for clean baseline
-- ============================================================================

UPDATE meta.entity
SET
    status_changed_at = COALESCE(status_changed_at, created_at),
    status_changed_by = COALESCE(status_changed_by, created_by)
WHERE status_changed_at IS NULL;

COMMIT;
