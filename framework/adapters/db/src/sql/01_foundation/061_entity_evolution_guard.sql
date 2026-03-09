/* ============================================================================
   Athyper — Entity Schema Evolution Guard
   Prevents unsafe mutations to meta.entity columns once an entity has at least
   one published version. This is the database-level defense-in-depth layer;
   the application layer should also enforce these rules before reaching the DB.

   Immutable columns (after first published version):
     tenant_id, entity_code, table_schema, table_name,
     kind, entity_class, mapping_mode, backing_type

   These columns form the entity's stable identity and physical binding.
   Changing them after publish would break compiled models, cached queries,
   FK references, and runtime SQL generation.

   Mutable columns (always changeable):
     name, slug, entity_short        — display/routing (rename-safe)
     module_id, engine_tag           — organizational ownership
     feature_flags, naming_policy    — infrastructure config
     display_config, identity_config — UI/presentation config
     governance_level                — meta feature depth
     ownership_model, mutability     — schema governance
     status, status_changed_*        — lifecycle state
     updated_at, updated_by          — audit stamps

   PostgreSQL 16+
   Depends on: 040_meta.sql (meta.entity, meta.entity_version)
   ============================================================================ */

-- ============================================================================
-- 1. TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_entity_evolution_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    has_published boolean;
BEGIN
    -- Only check if one of the guarded columns actually changed
    IF  OLD.tenant_id     IS NOT DISTINCT FROM NEW.tenant_id
    AND OLD.entity_code   IS NOT DISTINCT FROM NEW.entity_code
    AND OLD.table_schema  IS NOT DISTINCT FROM NEW.table_schema
    AND OLD.table_name    IS NOT DISTINCT FROM NEW.table_name
    AND OLD.kind          IS NOT DISTINCT FROM NEW.kind
    AND OLD.entity_class  IS NOT DISTINCT FROM NEW.entity_class
    AND OLD.mapping_mode  IS NOT DISTINCT FROM NEW.mapping_mode
    AND OLD.backing_type  IS NOT DISTINCT FROM NEW.backing_type
    THEN
        -- No guarded column changed — allow freely
        RETURN NEW;
    END IF;

    -- Check if this entity has ever been published
    SELECT EXISTS (
        SELECT 1 FROM meta.entity_version
        WHERE entity_id = OLD.id
          AND status = 'published'
        LIMIT 1
    ) INTO has_published;

    IF NOT has_published THEN
        -- Entity is still in draft-only state — all changes allowed
        RETURN NEW;
    END IF;

    -- Entity has published versions — block guarded column changes
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: tenant_id is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.entity_code IS DISTINCT FROM NEW.entity_code THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: entity_code is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.table_schema IS DISTINCT FROM NEW.table_schema THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: table_schema is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.table_name IS DISTINCT FROM NEW.table_name THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: table_name is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.kind IS DISTINCT FROM NEW.kind THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: kind is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.entity_class IS DISTINCT FROM NEW.entity_class THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: entity_class is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.mapping_mode IS DISTINCT FROM NEW.mapping_mode THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: mapping_mode is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.backing_type IS DISTINCT FROM NEW.backing_type THEN
        RAISE EXCEPTION 'EVOLUTION_GUARD: backing_type is immutable after publish (entity: %)', OLD.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- Should not reach here, but safety net
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION meta.trg_entity_evolution_guard() IS
  'BEFORE UPDATE trigger that prevents mutation of identity/physical columns on meta.entity once any version has been published.';

-- ============================================================================
-- 2. ATTACH TRIGGER
-- ============================================================================

-- Drop and recreate to ensure latest function is used
DROP TRIGGER IF EXISTS entity_evolution_guard ON meta.entity;

CREATE TRIGGER entity_evolution_guard
    BEFORE UPDATE ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_entity_evolution_guard();

COMMENT ON TRIGGER entity_evolution_guard ON meta.entity IS
  'Blocks mutation of immutable columns (tenant_id, entity_code, table_schema, table_name, kind, entity_class, mapping_mode, backing_type) after first published version.';
