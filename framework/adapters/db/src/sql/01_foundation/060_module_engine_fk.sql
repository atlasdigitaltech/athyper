/* ============================================================================
   Athyper — Module & Engine Referential Governance
   Adds FK constraint from meta.entity.module_id → core.module.code and
   creates meta.engine reference table with FK from meta.entity.engine_tag.

   Previously both columns were free-text with no referential integrity.
   This migration adds controlled reference tables / FK linkage to prevent
   invalid module codes and engine tags.

   PostgreSQL 16+
   Depends on: 010_core.sql (core.module), 040_meta.sql (meta.entity)
   ============================================================================ */

-- ============================================================================
-- 1. ENGINE REFERENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.engine (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE meta.engine IS
  'Engine registry. Each engine is a processing subsystem that owns a group of entities (e.g., posting-engine, budget-engine, inventory-engine).';

COMMENT ON COLUMN meta.engine.code IS
  'Unique kebab-case engine identifier, referenced by meta.entity.engine_tag.';

-- ============================================================================
-- 2. FK: meta.entity.module_id → core.module.code
-- ============================================================================
-- meta.entity.module_id stores the module code string (e.g. 'ACC', 'FND').
-- core.module.code is UNIQUE and contains all valid module codes.
-- This FK ensures only registered modules can be referenced.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_entity_module_code'
    ) THEN
        ALTER TABLE meta.entity
            ADD CONSTRAINT fk_entity_module_code
            FOREIGN KEY (module_id) REFERENCES core.module(code)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'fk_entity_module_code: %', SQLERRM;
END $$;

COMMENT ON COLUMN meta.entity.module_id IS
  'Owning module code. FK to core.module(code). Values: ACC, FND, CRM, HR, DOC, etc.';

-- ============================================================================
-- 3. FK: meta.entity.engine_tag → meta.engine.code
-- ============================================================================
-- engine_tag is nullable (non-finance entities have no engine).
-- The FK only applies to non-NULL values.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_entity_engine_tag'
    ) THEN
        ALTER TABLE meta.entity
            ADD CONSTRAINT fk_entity_engine_tag
            FOREIGN KEY (engine_tag) REFERENCES meta.engine(code)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'fk_entity_engine_tag: %', SQLERRM;
END $$;

COMMENT ON COLUMN meta.entity.engine_tag IS
  'Owning engine identifier. FK to meta.engine(code). Values: posting-engine, budget-engine, etc. NULL for non-engine entities.';

-- ============================================================================
-- 4. UPDATE TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code (immutable), name (display), slug (routing), entity_short (alias). Classification: kind (domain) + entity_class (behavior). Lifecycle: status. Ownership: ownership_model + mutability. Physical: backing_type + mapping_mode. Module: FK to core.module. Engine: FK to meta.engine. JSONB: naming_policy, feature_flags, display_config. Governance, version links.';
