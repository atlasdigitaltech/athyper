-- Meta Entity Contract v2 storage extensions.
-- This file is intentionally additive so an existing database can be reset or
-- upgraded before the legacy columns are retired in a later gate.

ALTER TABLE control.entity_version_contract
    ADD COLUMN IF NOT EXISTS contract_version smallint NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS runtime_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS create_mode text NOT NULL DEFAULT 'FORM_ONLY',
    ADD COLUMN IF NOT EXISTS draft_ttl_hours integer,
    ADD COLUMN IF NOT EXISTS governance_level text NOT NULL DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS security_tier text NOT NULL DEFAULT 'config',
    ADD COLUMN IF NOT EXISTS mutability text NOT NULL DEFAULT 'controlled',
    ADD COLUMN IF NOT EXISTS identity_config jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS search_config jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS data_policy jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS concurrency_config jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS storage_config jsonb NOT NULL DEFAULT '{}';

ALTER TABLE control.entity_field
    ADD COLUMN IF NOT EXISTS semantic_roles text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS type_config jsonb NOT NULL DEFAULT '{"kind":"scalar"}';

ALTER TABLE control.entity_relation
    ADD COLUMN IF NOT EXISTS relation_code text,
    ADD COLUMN IF NOT EXISTS target_entity_code text,
    ADD COLUMN IF NOT EXISTS source_field text,
    ADD COLUMN IF NOT EXISTS target_field text,
    ADD COLUMN IF NOT EXISTS polymorphic_type_field text,
    ADD COLUMN IF NOT EXISTS polymorphic_type_value text,
    ADD COLUMN IF NOT EXISTS polymorphic_id_field text,
    ADD COLUMN IF NOT EXISTS mutation_owner text NOT NULL DEFAULT 'read_only',
    ADD COLUMN IF NOT EXISTS mutation_permissions text[] NOT NULL DEFAULT '{}';

ALTER TABLE control.entity_surface
    ADD COLUMN IF NOT EXISTS entity_version_id uuid,
    ADD COLUMN IF NOT EXISTS v2_mode text,
    ADD COLUMN IF NOT EXISTS v2_kind text;

ALTER TABLE control.entity_operation
    ADD COLUMN IF NOT EXISTS entity_version_id uuid,
    ADD COLUMN IF NOT EXISTS operation_code text,
    ADD COLUMN IF NOT EXISTS label text,
    ADD COLUMN IF NOT EXISTS icon text,
    ADD COLUMN IF NOT EXISTS intent text NOT NULL DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS confirmation jsonb NOT NULL DEFAULT '{"required":false,"code":null}',
    ADD COLUMN IF NOT EXISTS reason_required boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS record_required boolean;

-- Legacy platform seeds execute after the DDL phase and still use the v1
-- entity-scoped binding constraints. Keep those constraints in place until
-- 101_control_meta_entity_contract_v2 has backfilled entity_version_id for
-- every legacy surface and operation row. Promoting the operation constraint
-- here would make ON CONFLICT ON CONSTRAINT eo_binding_uq fail in 044 and
-- would make all legacy rows with a NULL entity_version_id collide on the
-- v2 key. The promotion is intentionally performed by the final v2 seed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'es_v2_binding_uq') THEN
        -- Make a rerun after an interrupted pre-v2 attempt safe.
        ALTER TABLE control.entity_surface DROP CONSTRAINT es_v2_binding_uq;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eo_v2_binding_uq') THEN
        -- Make a rerun after an interrupted pre-v2 attempt safe.
        ALTER TABLE control.entity_operation DROP CONSTRAINT eo_v2_binding_uq;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evc_v2_json_object_chk') THEN
        ALTER TABLE control.entity_version_contract
            ADD CONSTRAINT evc_v2_json_object_chk CHECK (
                jsonb_typeof(identity_config) = 'object'
                AND jsonb_typeof(search_config) = 'object'
                AND jsonb_typeof(data_policy) = 'object'
                AND jsonb_typeof(concurrency_config) = 'object'
                AND jsonb_typeof(storage_config) = 'object'
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ef_v2_type_config_chk') THEN
        ALTER TABLE control.entity_field
            ADD CONSTRAINT ef_v2_type_config_chk CHECK (jsonb_typeof(type_config) = 'object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'er_v2_mutation_owner_chk') THEN
        ALTER TABLE control.entity_relation
            ADD CONSTRAINT er_v2_mutation_owner_chk CHECK (
                mutation_owner IN ('generic','workspace','handler','read_only')
            );
    END IF;
END $$;

COMMENT ON TABLE control.entity_version_contract IS
    'Meta Entity Contract v2 runtime/storage owner. Legacy control.entity runtime fields are migration inputs only.';
COMMENT ON COLUMN control.entity_field.semantic_roles IS
    'Canonical semantic role set. Replaces is_primary_amount, is_primary_currency, and ui_hint semantic markers.';
COMMENT ON COLUMN control.entity_field.type_config IS
    'Strict discriminated value contract. Structure belongs to entity_relation; presentation belongs to surfaces.';
