-- ============================================================================
-- Meta Entity Contract M1: checks, foreign keys, and ownership constraints.
-- ============================================================================

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_change_type_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_change_type_chk CHECK (
        change_type IS NULL
        OR change_type IN ('structural','behavioral','governance','label','fix')
    );

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_contract_document_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_contract_document_chk CHECK (
        contract_document IS NULL OR jsonb_typeof(contract_document) = 'object'
    );

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_contract_hash_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_contract_hash_chk CHECK (
        contract_hash IS NULL OR contract_hash ~ '^[0-9a-f]{64}$'
    );

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_validation_status_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_validation_status_chk CHECK (
        validation_status IN ('NOT_VALIDATED','VALID','INVALID')
    );

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_validation_diagnostics_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_validation_diagnostics_chk CHECK (
        jsonb_typeof(validation_diagnostics) = 'array'
    );

ALTER TABLE control.entity_version DROP CONSTRAINT IF EXISTS ev_break_glass_chk;
ALTER TABLE control.entity_version
    ADD CONSTRAINT ev_break_glass_chk CHECK (
        (
            approval_break_glass = false
            AND approval_break_glass_reason IS NULL
            AND approval_break_glass_ticket IS NULL
        )
        OR (
            approval_break_glass = true
            AND btrim(COALESCE(approval_break_glass_reason, '')) <> ''
            AND btrim(COALESCE(approval_break_glass_ticket, '')) <> ''
        )
    );

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_base_version_fk
        FOREIGN KEY (base_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_validated_by_fk
        FOREIGN KEY (validated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_submitted_by_fk
        FOREIGN KEY (submitted_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_reviewed_by_fk
        FOREIGN KEY (reviewed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_version ADD CONSTRAINT ev_published_by_fk
        FOREIGN KEY (published_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_numbering_config ADD CONSTRAINT encfg_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_lifecycle ADD CONSTRAINT el_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_lifecycle_state_mask ADD CONSTRAINT elsm_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_lifecycle_state_mask ADD CONSTRAINT elsm_lifecycle_state_fk
        FOREIGN KEY (lifecycle_state_id) REFERENCES control.lifecycle_state(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'control.entity_action_rule'::regclass
           AND conname = 'ear_id_uq'
    ) THEN
        ALTER TABLE control.entity_action_rule ADD CONSTRAINT ear_id_uq UNIQUE (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.entity_operation'::regclass
           AND conname = 'eo_binding_uq'
    ) THEN
        ALTER TABLE control.entity_operation
            ADD CONSTRAINT eo_binding_uq
            UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, permission_code);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.entity_numbering_config'::regclass
           AND conname = 'encfg_natural_uq'
    ) THEN
        ALTER TABLE control.entity_numbering_config
            ADD CONSTRAINT encfg_natural_uq
            UNIQUE NULLS NOT DISTINCT (
                tenant_id, company_code_id, entity_id, number_field
            );
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_action_rule ADD CONSTRAINT ear_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_action_rule ADD CONSTRAINT ear_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_action_rule ADD CONSTRAINT ear_required_permission_fk
        FOREIGN KEY (required_permission) REFERENCES shared.permission(code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_surface ADD CONSTRAINT es_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_operation ADD CONSTRAINT eo_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_policy ADD CONSTRAINT ep_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CREATE TABLE IF NOT EXISTS does not retrofit inline constraints on databases
-- created before entity_relation became version-owned. Seed/projector upserts
-- require this natural key on upgrades as well as clean installs.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.entity_relation'::regclass
           AND conname = 'er_name_uq'
    ) THEN
        ALTER TABLE control.entity_relation
            ADD CONSTRAINT er_name_uq UNIQUE (entity_version_id, name);
    END IF;
END $$;
