-- 002_control/012_backfill_entity_code.sql
-- Purpose: Backfill control.entity.entity_code = name for platform system entities
--          that were seeded before entity_code was made NOT NULL.
--          Safe to run multiple times (idempotent: only updates rows where entity_code IS NULL).
--
-- Affected entities: any finance document / master entity seeded by 100_finance/ seeds
-- that pre-date the entity_code column requirement.

UPDATE control.entity
SET    entity_code = name
WHERE  tenant_id IS NULL
  AND  ownership_model = 'system'
  AND  (entity_code IS NULL OR entity_code = '');
