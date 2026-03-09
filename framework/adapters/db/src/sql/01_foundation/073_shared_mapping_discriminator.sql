/* ============================================================================
   Athyper — Shared Mapping Discriminator Columns

   Adds discriminator_column and discriminator_value to meta.entity for
   shared-mapping entities. When mapping_mode = 'shared', these columns
   tell GenericDataAPI how to filter rows belonging to each logical entity.

   PostgreSQL 16+
   Depends on: 040_meta.sql, 058_entity_ownership_backing.sql
   ============================================================================ */

-- When mapping_mode = 'shared', multiple logical entities share one physical
-- table. These columns define how GenericDataAPI distinguishes rows:
--   discriminator_column: the physical column name (e.g. 'entry_type')
--   discriminator_value:  the value identifying this entity's rows (e.g. 'manual')

ALTER TABLE meta.entity
  ADD COLUMN IF NOT EXISTS discriminator_column text,
  ADD COLUMN IF NOT EXISTS discriminator_value  text;

COMMENT ON COLUMN meta.entity.discriminator_column IS
  'For shared-mapping entities: the physical column used to discriminate rows belonging to this entity. NULL for exclusive mappings.';

COMMENT ON COLUMN meta.entity.discriminator_value IS
  'For shared-mapping entities: the value in discriminator_column that identifies this entity''s rows. NULL for exclusive mappings.';

-- Constraint: discriminator columns must both be set or both be null
ALTER TABLE meta.entity
  DROP CONSTRAINT IF EXISTS chk_discriminator_pair;

ALTER TABLE meta.entity
  ADD CONSTRAINT chk_discriminator_pair CHECK (
    (discriminator_column IS NULL AND discriminator_value IS NULL)
    OR (discriminator_column IS NOT NULL AND discriminator_value IS NOT NULL)
  );

-- Constraint: shared mapping requires discriminator; exclusive must not have one
ALTER TABLE meta.entity
  DROP CONSTRAINT IF EXISTS chk_shared_requires_discriminator;

ALTER TABLE meta.entity
  ADD CONSTRAINT chk_shared_requires_discriminator CHECK (
    CASE
      WHEN mapping_mode = 'shared' THEN discriminator_column IS NOT NULL
      ELSE discriminator_column IS NULL
    END
  );

-- Index for fast discriminator lookups in shared tables
CREATE INDEX IF NOT EXISTS idx_entity_discriminator
  ON meta.entity (table_schema, table_name, discriminator_column, discriminator_value)
  WHERE mapping_mode = 'shared';
