/* ============================================================================
   Athyper — Entity Ownership & Backing Type Backfill
   Sets ownership_model, mutability, and backing_type for all seeded entities.
   Must run AFTER 303_seed_entity_identity.sql and
   AFTER 058_entity_ownership_backing.sql (schema migration).

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ============================================================================
-- §1  ownership_model — all seeded entities are system-owned
-- ============================================================================
-- The column default is 'system', so this is a safety net.
-- Tenant-created entities will get 'tenant' at creation time.

UPDATE meta.entity
SET ownership_model = 'system'
WHERE ownership_model != 'system'
  AND entity_code IS NOT NULL;  -- entity_code is set by 303 for all seeded entities

-- ============================================================================
-- §2  mutability — assign based on entity_class
-- ============================================================================
-- Default is 'controlled' (from column default). Override per class below.

-- ── REFERENCE: locked — immutable lookup data, no modifications ──
UPDATE meta.entity SET mutability = 'locked' WHERE name IN (
    'Country', 'StateRegion', 'Currency', 'Language', 'Locale',
    'Timezone', 'UnitOfMeasure', 'CommodityDomain', 'CommodityCode',
    'IndustryDomain', 'IndustryCode', 'Label'
);

-- ── LEDGER: locked — immutable financial records, schema must not change ──
UPDATE meta.entity SET mutability = 'locked' WHERE entity_class = 'LEDGER';

-- ── LOG: locked — operational event streams, schema tightly coupled to emitters ──
UPDATE meta.entity SET mutability = 'locked' WHERE entity_class = 'LOG';

-- ── MASTER: controlled — extend via overlays, base schema immutable ──
-- (This is the column default, so this is explicit documentation)
UPDATE meta.entity SET mutability = 'controlled' WHERE entity_class = 'MASTER';

-- ── CONTROL: controlled — config/rules, extend via overlays ──
UPDATE meta.entity SET mutability = 'controlled' WHERE entity_class = 'CONTROL';

-- ── DOCUMENT: controlled — lifecycle-managed, extend via overlays ──
UPDATE meta.entity SET mutability = 'controlled' WHERE entity_class = 'DOCUMENT';

-- ============================================================================
-- §3  backing_type — all seeded entities are table-backed
-- ============================================================================
-- The column default is 'table'. Currently no view/virtual/external entities
-- exist in the seed data. The two entities with mapping_mode='virtual' (if any)
-- should get backing_type='virtual'.

UPDATE meta.entity SET backing_type = 'virtual'
WHERE mapping_mode = 'virtual' AND backing_type = 'table';

-- All others remain 'table' (the default).

COMMIT;
