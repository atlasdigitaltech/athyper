-- ============================================================================
-- mesh/_shared/04_indexes.sql
-- Concept: Mesh-only additions for shared schema indexes
-- Depends on: shared/01_tables.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS shared_role_persona_idx
    ON shared.role (persona_id);

CREATE INDEX IF NOT EXISTS shared_role_module_pidx
    ON shared.role (module_id)
    WHERE module_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shared_role_workspace_pidx
    ON shared.role (workspace_id)
    WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shared_role_active_pidx
    ON shared.role (id)
    WHERE status = 'active';
