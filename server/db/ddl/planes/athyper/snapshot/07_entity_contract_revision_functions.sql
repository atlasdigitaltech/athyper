CREATE OR REPLACE FUNCTION snapshot.fn_compute_entity_contract_hash(
    p_contract_json jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, snapshot
AS $$
    SELECT encode(public.digest(p_contract_json::text, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_compute_entity_contract_revision_hash(
    p_tenant_id uuid,
    p_entity_id uuid,
    p_change_set_id uuid,
    p_revision_no integer,
    p_parent_revision_hash text,
    p_base_release_id uuid,
    p_contract_schema_code text,
    p_contract_schema_version text,
    p_contract_hash text,
    p_changed_paths text[],
    p_compatibility_level metadata.compatibility_level_d,
    p_validation_status metadata.contract_validation_status_d,
    p_validation_diagnostics jsonb,
    p_captured_at timestamptz,
    p_captured_by uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, snapshot
AS $$
    SELECT encode(
        public.digest(
            jsonb_build_object(
                'tenant_id', p_tenant_id,
                'entity_id', p_entity_id,
                'change_set_id', p_change_set_id,
                'revision_no', p_revision_no,
                'parent_revision_hash', p_parent_revision_hash,
                'base_release_id', p_base_release_id,
                'contract_schema_code', p_contract_schema_code,
                'contract_schema_version', p_contract_schema_version,
                'contract_hash', p_contract_hash,
                'changed_paths', p_changed_paths,
                'compatibility_level', p_compatibility_level,
                'validation_status', p_validation_status,
                'validation_diagnostics', p_validation_diagnostics,
                'captured_at', p_captured_at,
                'captured_by', p_captured_by
            )::text,
            'sha256'
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_contract_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot, metadata
AS $$
DECLARE
    v_entity metadata.entity%ROWTYPE;
    v_change_set metadata.entity_change_set%ROWTYPE;
    v_parent snapshot.entity_contract_revision%ROWTYPE;
BEGIN
    SELECT * INTO v_entity
      FROM metadata.entity
     WHERE id = NEW.entity_id
     FOR UPDATE;
    IF NOT FOUND OR v_entity.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Revision scope must match its Entity scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT * INTO v_change_set
      FROM metadata.entity_change_set
     WHERE id = NEW.change_set_id;
    IF NOT FOUND
       OR v_change_set.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_change_set.entity_id <> NEW.entity_id
       OR v_change_set.status IN ('abandoned', 'published') THEN
        RAISE EXCEPTION 'Revision requires an open change set for the same scoped Entity'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.base_release_id IS DISTINCT FROM v_change_set.base_release_id THEN
        RAISE EXCEPTION 'Revision base release must match its change set'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_revision_id IS NULL THEN
        IF NEW.revision_no <> 1 OR EXISTS (
            SELECT 1
              FROM snapshot.entity_contract_revision
             WHERE change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'The first change-set revision must use revision number 1'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.parent_revision_hash := NULL;
    ELSE
        SELECT * INTO v_parent
          FROM snapshot.entity_contract_revision
         WHERE id = NEW.parent_revision_id;
        IF NOT FOUND
           OR v_parent.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_parent.entity_id <> NEW.entity_id
           OR v_parent.change_set_id <> NEW.change_set_id
           OR NEW.revision_no <> v_parent.revision_no + 1 THEN
            RAISE EXCEPTION 'Revision predecessor must be the immediately preceding revision of the same change set'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1
              FROM snapshot.entity_contract_revision
             WHERE change_set_id = NEW.change_set_id
               AND revision_no > v_parent.revision_no
        ) THEN
            RAISE EXCEPTION 'Revision predecessor is no longer the current chain head'
                USING ERRCODE = 'serialization_failure';
        END IF;
        NEW.parent_revision_hash := v_parent.revision_hash;
    END IF;

    NEW.contract_schema_code := lower(btrim(NEW.contract_schema_code));
    NEW.contract_schema_version := btrim(NEW.contract_schema_version);
    NEW.changed_paths := ARRAY(
        SELECT DISTINCT btrim(path)
          FROM unnest(NEW.changed_paths) AS path
         WHERE nullif(btrim(path), '') IS NOT NULL
         ORDER BY btrim(path)
    );
    NEW.payload_size_bytes := octet_length(convert_to(NEW.contract_json::text, 'UTF8'));
    NEW.contract_hash := snapshot.fn_compute_entity_contract_hash(NEW.contract_json);
    NEW.revision_hash := snapshot.fn_compute_entity_contract_revision_hash(
        NEW.tenant_id,
        NEW.entity_id,
        NEW.change_set_id,
        NEW.revision_no,
        NEW.parent_revision_hash,
        NEW.base_release_id,
        NEW.contract_schema_code,
        NEW.contract_schema_version,
        NEW.contract_hash,
        NEW.changed_paths,
        NEW.compatibility_level,
        NEW.validation_status,
        NEW.validation_diagnostics,
        NEW.captured_at,
        NEW.captured_by
    );

    RETURN NEW;
END;
$$;
