-- ============================================================================
-- Meta Entity Contract M2: retire entity-scoped uniqueness that prevents two
-- immutable versions from carrying the same logical bindings. Constraint names
-- used by legacy seeds are retained where possible.
-- ============================================================================

ALTER TABLE control.entity_operation DROP CONSTRAINT IF EXISTS eo_binding_uq;
ALTER TABLE control.entity_operation
    ADD CONSTRAINT eo_binding_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, entity_name, entity_version_id, permission_code
    );

ALTER TABLE control.entity_numbering_config DROP CONSTRAINT IF EXISTS encfg_natural_uq;
ALTER TABLE control.entity_numbering_config
    ADD CONSTRAINT encfg_natural_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, entity_id, entity_version_id, number_field
    );

ALTER TABLE control.entity_lifecycle DROP CONSTRAINT IF EXISTS el_binding_uq;
ALTER TABLE control.entity_lifecycle
    ADD CONSTRAINT el_binding_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, entity_name, entity_version_id, lifecycle_id
    );

ALTER TABLE control.entity_lifecycle_state_mask DROP CONSTRAINT IF EXISTS elsm_binding_uq;
CREATE UNIQUE INDEX IF NOT EXISTS elsm_legacy_binding_uq_idx
    ON control.entity_lifecycle_state_mask (
        tenant_id, entity_name, record_status
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NULL;

ALTER TABLE control.entity_surface DROP CONSTRAINT IF EXISTS es_binding_uq;
CREATE UNIQUE INDEX IF NOT EXISTS es_legacy_binding_uq_idx
    ON control.entity_surface (tenant_id, entity_id, mode, surface_key)
    NULLS NOT DISTINCT
    WHERE entity_version_id IS NULL;

ALTER TABLE control.entity_action_rule DROP CONSTRAINT IF EXISTS ear_pkey;
ALTER TABLE control.entity_action_rule
    ADD CONSTRAINT ear_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS ear_legacy_binding_uq_idx
    ON control.entity_action_rule (entity_code, status, action_code)
    WHERE entity_version_id IS NULL;

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_projected_by_fk
        FOREIGN KEY (projected_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_projection_hash_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_projection_hash_chk CHECK (
        projection_hash IS NULL OR projection_hash ~ '^[0-9a-f]{64}$'
    );

