-- 005_domain_registrations/000_normalize_system_entities.sql
-- Purpose: one-time compatibility migration for databases seeded by the prior
--          TypeScript-based seeding system, which registered system-level
--          entities with tenant_id = '00000000-0000-0000-0000-000000000000'
--          (the system-user UUID) instead of SQL NULL.
--
-- The new SQL-based seed files use WHERE NOT EXISTS (... AND tenant_id IS NULL)
-- and ON CONFLICT guards that rely on system entities having tenant_id IS NULL.
-- This normalization converts those rows so all subsequent guards work correctly.
--
-- Safe / Idempotent:
--   - Only touches ownership_model='system' rows (platform entities, never tenant rows)
--   - Only matches the specific system-sentinel UUID — no real tenant UUIDs are affected
--   - After first run the WHERE clause matches nothing; re-runs are no-ops
--   - entity_code_uq is UNIQUE NULLS NOT DISTINCT (tenant_id, entity_code):
--       NULL tenant treated as a distinct group from non-NULL tenants, so converting
--       '00000000-...' → NULL can only fail if a duplicate (tenant_id=NULL, entity_code=X)
--       already exists.  That would indicate a data-integrity problem to surface, not hide.

UPDATE control.entity
SET    tenant_id = NULL
WHERE  ownership_model = 'system'
  AND  tenant_id = '00000000-0000-0000-0000-000000000000';
