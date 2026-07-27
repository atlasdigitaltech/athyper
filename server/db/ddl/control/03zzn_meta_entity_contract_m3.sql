-- ============================================================================
-- Meta Entity Contract M3 constraints.
-- ============================================================================

ALTER TABLE control.entity_publish_state DROP CONSTRAINT IF EXISTS eps_readiness_status_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_readiness_status_chk
    CHECK (readiness_status IN ('NOT_READY','VALIDATING','READY','BLOCKED'));

ALTER TABLE control.entity_publish_state DROP CONSTRAINT IF EXISTS eps_readiness_diagnostics_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_readiness_diagnostics_chk
    CHECK (jsonb_typeof(readiness_diagnostics) = 'array');

ALTER TABLE control.entity_publish_state DROP CONSTRAINT IF EXISTS eps_m3_hashes_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_m3_hashes_chk CHECK (
        (contract_hash IS NULL OR contract_hash ~ '^[0-9a-f]{64}$')
        AND (materialized_hash IS NULL OR materialized_hash ~ '^[0-9a-f]{64}$')
        AND (admin_compiled_hash IS NULL OR admin_compiled_hash ~ '^[0-9a-f]{64}$')
        AND (neon_compiled_hash IS NULL OR neon_compiled_hash ~ '^[0-9a-f]{64}$')
        AND (mesh_compiled_hash IS NULL OR mesh_compiled_hash ~ '^[0-9a-f]{64}$')
    );

DO $$ BEGIN
    ALTER TABLE control.entity_contract_transition ADD CONSTRAINT ect_entity_fk
        FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE control.entity_contract_transition ADD CONSTRAINT ect_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE control.entity_contract_transition ADD CONSTRAINT ect_source_version_fk
        FOREIGN KEY (source_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE control.entity_contract_transition ADD CONSTRAINT ect_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE control.entity_contract_transition DROP CONSTRAINT IF EXISTS ect_transition_chk;
ALTER TABLE control.entity_contract_transition
    ADD CONSTRAINT ect_transition_chk
    CHECK (transition IN ('draft_created','owner_patched','submitted','approved','rejected','rollback_published'));
ALTER TABLE control.entity_contract_transition DROP CONSTRAINT IF EXISTS ect_hashes_chk;
ALTER TABLE control.entity_contract_transition
    ADD CONSTRAINT ect_hashes_chk CHECK (
        (before_hash IS NULL OR before_hash ~ '^[0-9a-f]{64}$')
        AND (after_hash IS NULL OR after_hash ~ '^[0-9a-f]{64}$')
    );
ALTER TABLE control.entity_contract_transition DROP CONSTRAINT IF EXISTS ect_diff_chk;
ALTER TABLE control.entity_contract_transition
    ADD CONSTRAINT ect_diff_chk CHECK (jsonb_typeof(contract_diff) = 'array');
ALTER TABLE control.entity_contract_transition DROP CONSTRAINT IF EXISTS ect_metadata_chk;
ALTER TABLE control.entity_contract_transition
    ADD CONSTRAINT ect_metadata_chk CHECK (jsonb_typeof(metadata) = 'object');

DO $$ BEGIN
    ALTER TABLE snapshot.entity_plane_compiled ADD CONSTRAINT epc_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE snapshot.entity_plane_compiled ADD CONSTRAINT epc_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE snapshot.entity_plane_compiled DROP CONSTRAINT IF EXISTS epc_plane_chk;
ALTER TABLE snapshot.entity_plane_compiled
    ADD CONSTRAINT epc_plane_chk CHECK (plane_key IN ('admin','neon','mesh'));
ALTER TABLE snapshot.entity_plane_compiled DROP CONSTRAINT IF EXISTS epc_hashes_chk;
ALTER TABLE snapshot.entity_plane_compiled
    ADD CONSTRAINT epc_hashes_chk CHECK (
        contract_hash ~ '^[0-9a-f]{64}$'
        AND materialized_hash ~ '^[0-9a-f]{64}$'
        AND compiled_hash ~ '^[0-9a-f]{64}$'
    );
ALTER TABLE snapshot.entity_plane_compiled DROP CONSTRAINT IF EXISTS epc_json_chk;
ALTER TABLE snapshot.entity_plane_compiled
    ADD CONSTRAINT epc_json_chk CHECK (jsonb_typeof(compiled_json) = 'object');

