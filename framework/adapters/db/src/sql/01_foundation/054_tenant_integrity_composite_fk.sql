-- ============================================================================
-- Tenant Integrity: Composite Foreign Keys
-- ============================================================================
-- Closes a subtle multi-tenant integrity gap: meta.field.entity_version_id
-- references meta.entity_version(id), but there is no guarantee that the
-- entity_version belongs to the same tenant as the field's tenant_id.
--
-- Today a bug or direct SQL could create:
--   field.tenant_id = tenant_A
--   field.entity_version_id = version owned by tenant_B
--
-- Fix: make (tenant_id, id) unique on meta.entity_version, then change
-- the FK to reference (tenant_id, entity_version_id) → (tenant_id, id).
--
-- Same pattern applied to:
--   meta.field → meta.entity_version (tenant_id, entity_version_id)
--   meta.relation → meta.entity_version (tenant_id, entity_version_id)
--   meta.index_def → meta.entity_version (tenant_id, entity_version_id)
--
-- Also applied to meta.entity_version → meta.entity:
--   meta.entity_version → meta.entity (tenant_id, entity_id)
--
-- All operations use IF NOT EXISTS / DROP IF EXISTS for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. Add composite unique on meta.entity (tenant_id, id)
-- ============================================================================
-- Required as the target of composite FKs from entity_version.

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_tenant_id_uniq
    ON meta.entity (tenant_id, id);

-- ============================================================================
-- 2. Add composite unique on meta.entity_version (tenant_id, id)
-- ============================================================================
-- Required as the target of composite FKs from field, relation, index_def.

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_version_tenant_id_uniq
    ON meta.entity_version (tenant_id, id);

-- ============================================================================
-- 3. meta.entity_version → meta.entity: composite tenant FK
-- ============================================================================
-- Drop the old simple FK, add composite FK.

ALTER TABLE meta.entity_version
    DROP CONSTRAINT IF EXISTS entity_version_entity_id_fkey;

ALTER TABLE meta.entity_version
    DROP CONSTRAINT IF EXISTS fk_entity_version_entity_tenant;

ALTER TABLE meta.entity_version
    ADD CONSTRAINT fk_entity_version_entity_tenant
        FOREIGN KEY (tenant_id, entity_id)
        REFERENCES meta.entity (tenant_id, id)
        ON DELETE CASCADE;

-- ============================================================================
-- 4. meta.field → meta.entity_version: composite tenant FK
-- ============================================================================

ALTER TABLE meta.field
    DROP CONSTRAINT IF EXISTS field_entity_version_id_fkey;

ALTER TABLE meta.field
    DROP CONSTRAINT IF EXISTS fk_field_entity_version_tenant;

ALTER TABLE meta.field
    ADD CONSTRAINT fk_field_entity_version_tenant
        FOREIGN KEY (tenant_id, entity_version_id)
        REFERENCES meta.entity_version (tenant_id, id)
        ON DELETE CASCADE;

-- ============================================================================
-- 5. meta.relation → meta.entity_version: composite tenant FK
-- ============================================================================

ALTER TABLE meta.relation
    DROP CONSTRAINT IF EXISTS relation_entity_version_id_fkey;

ALTER TABLE meta.relation
    DROP CONSTRAINT IF EXISTS fk_relation_entity_version_tenant;

ALTER TABLE meta.relation
    ADD CONSTRAINT fk_relation_entity_version_tenant
        FOREIGN KEY (tenant_id, entity_version_id)
        REFERENCES meta.entity_version (tenant_id, id)
        ON DELETE CASCADE;

-- ============================================================================
-- 6. meta.index_def → meta.entity_version: composite tenant FK
-- ============================================================================

ALTER TABLE meta.index_def
    DROP CONSTRAINT IF EXISTS index_def_entity_version_id_fkey;

ALTER TABLE meta.index_def
    DROP CONSTRAINT IF EXISTS fk_index_def_entity_version_tenant;

ALTER TABLE meta.index_def
    ADD CONSTRAINT fk_index_def_entity_version_tenant
        FOREIGN KEY (tenant_id, entity_version_id)
        REFERENCES meta.entity_version (tenant_id, id)
        ON DELETE CASCADE;

-- ============================================================================
-- 7. Column comments
-- ============================================================================

COMMENT ON COLUMN meta.field.tenant_id IS
  'Tenant ID — composite FK with entity_version_id ensures cross-tenant references are impossible.';

COMMENT ON COLUMN meta.field.entity_version_id IS
  'Entity version ID — composite FK (tenant_id, entity_version_id) → meta.entity_version(tenant_id, id) enforces same-tenant integrity.';
