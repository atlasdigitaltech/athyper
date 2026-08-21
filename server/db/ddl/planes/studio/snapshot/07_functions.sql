CREATE OR REPLACE FUNCTION snapshot.trg_reject_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
BEGIN
    RAISE EXCEPTION
        'snapshot.template_version is immutable; create a new version instead'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_set_template_version_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.created_by := v_actor;
    ELSIF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_compute_compiled_artifact_hash(
    p_source_snapshot_id uuid,
    p_source_payload_hash text,
    p_artifact_kind text,
    p_artifact_scope text,
    p_plane_key text,
    p_overlay_set_hash text,
    p_source_contract_hash text,
    p_compiled_json jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, snapshot
AS $$
    SELECT encode(
        public.digest(
            jsonb_build_object(
                'source_snapshot_id', p_source_snapshot_id,
                'source_payload_hash', p_source_payload_hash,
                'artifact_kind', p_artifact_kind,
                'artifact_scope', p_artifact_scope,
                'plane_key', p_plane_key,
                'overlay_set_hash', p_overlay_set_hash,
                'source_contract_hash', p_source_contract_hash,
                'compiled', p_compiled_json
            )::text,
            'sha256'
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_compiled_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_source snapshot.entity_snapshot_identity%ROWTYPE;
    v_expected_hash text;
BEGIN
    SELECT *
      INTO v_source
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.source_snapshot_id;

    IF NOT FOUND
       OR v_source.entity_type <> NEW.entity_type
       OR v_source.entity_id <> NEW.entity_id
       OR v_source.entity_contract_hash <> NEW.source_contract_hash THEN
        RAISE EXCEPTION
            'Compiled artifact coordinates and contract must match its source snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected_hash := snapshot.fn_compute_compiled_artifact_hash(
        NEW.source_snapshot_id,
        v_source.payload_hash,
        NEW.artifact_kind,
        NEW.artifact_scope,
        NEW.plane_key,
        NEW.overlay_set_hash,
        NEW.source_contract_hash,
        NEW.compiled_json
    );

    IF NEW.compiled_hash <> v_expected_hash THEN
        RAISE EXCEPTION 'Compiled artifact hash is invalid'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_publish_compiled_artifact(
    p_source_snapshot_id uuid,
    p_artifact_kind text,
    p_artifact_scope text,
    p_plane_key text,
    p_overlay_set_hash text,
    p_compiled_json jsonb,
    p_compliance_report jsonb DEFAULT '{}'::jsonb,
    p_compliance_score numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, snapshot, shared, master
SET row_security = on
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_actor_id uuid := master.current_principal_id_soft();
    v_source snapshot.entity_snapshot_identity%ROWTYPE;
    v_new_id uuid := shared.uuidv7();
    v_compiled_hash text;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_compiled_json IS NULL OR jsonb_typeof(p_compiled_json) <> 'object' THEN
        RAISE EXCEPTION 'Compiled artifact must be a JSON object'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_compliance_report IS NULL
       OR jsonb_typeof(p_compliance_report) <> 'object' THEN
        RAISE EXCEPTION 'Compliance report must be a JSON object'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT *
      INTO v_source
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = v_tenant_id
       AND id = p_source_snapshot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source snapshot does not exist in the current tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_compiled_hash := snapshot.fn_compute_compiled_artifact_hash(
        p_source_snapshot_id,
        v_source.payload_hash,
        p_artifact_kind,
        p_artifact_scope,
        p_plane_key,
        p_overlay_set_hash,
        v_source.entity_contract_hash,
        p_compiled_json
    );

    INSERT INTO snapshot.compiled_artifact (
        id,
        tenant_id,
        source_snapshot_id,
        entity_type,
        entity_id,
        artifact_kind,
        artifact_scope,
        plane_key,
        overlay_set_hash,
        source_contract_hash,
        compiled_json,
        compiled_hash,
        compliance_report,
        compliance_score,
        created_by
    )
    VALUES (
        v_new_id,
        v_tenant_id,
        p_source_snapshot_id,
        v_source.entity_type,
        v_source.entity_id,
        p_artifact_kind,
        p_artifact_scope,
        NULLIF(btrim(p_plane_key), ''),
        NULLIF(btrim(p_overlay_set_hash), ''),
        v_source.entity_contract_hash,
        p_compiled_json,
        v_compiled_hash,
        p_compliance_report,
        p_compliance_score,
        v_actor_id
    );

    RETURN v_new_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION snapshot.trg_reject_entity_contract_test_artifact_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$ BEGIN
    RAISE EXCEPTION 'Entity contract test execution artifacts are immutable' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_contract_test_run()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM metadata.entity_change_set c
         WHERE c.id = NEW.change_set_id
           AND c.tenant_id IS NOT DISTINCT FROM NEW.source_tenant_id
           AND c.entity_id = NEW.entity_id
           AND c.lock_version = NEW.source_lock_version
    ) THEN RAISE EXCEPTION 'Test run source coordinates or lock version do not match its change set' USING ERRCODE = 'check_violation'; END IF;
    NEW.source_contract_hash := snapshot.fn_compute_entity_contract_hash(NEW.source_contract_json);
    IF NEW.revision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM snapshot.entity_contract_revision r
         WHERE r.id = NEW.revision_id AND r.change_set_id = NEW.change_set_id
           AND r.contract_hash = NEW.source_contract_hash
    ) THEN RAISE EXCEPTION 'Test run revision does not match its source contract' USING ERRCODE = 'check_violation'; END IF;
    NEW.run_hash := encode(public.digest(jsonb_build_object(
        'tenant_id', NEW.tenant_id, 'entity_id', NEW.entity_id, 'change_set_id', NEW.change_set_id,
        'revision_id', NEW.revision_id, 'source_lock_version', NEW.source_lock_version,
        'source_contract_hash', NEW.source_contract_hash, 'runner_code', NEW.runner_code,
        'runner_version', NEW.runner_version, 'status', NEW.status, 'total_count', NEW.total_count,
        'passed_count', NEW.passed_count, 'failed_count', NEW.failed_count, 'error_count', NEW.error_count,
        'duration_ms', NEW.duration_ms, 'executed_at', NEW.executed_at, 'executed_by', NEW.executed_by
    )::text, 'sha256'), 'hex');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_contract_test_result()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$ BEGIN
    NEW.diagnostic_codes := ARRAY(SELECT DISTINCT btrim(code) FROM unnest(NEW.diagnostic_codes) code
        WHERE nullif(btrim(code), '') IS NOT NULL ORDER BY btrim(code));
    NEW.definition_hash := snapshot.fn_compute_entity_contract_hash(NEW.definition_json);
    NEW.result_hash := encode(public.digest(jsonb_build_object(
        'test_run_id', NEW.test_run_id, 'ordinal', NEW.ordinal, 'test_case_id', NEW.test_case_id,
        'definition_hash', NEW.definition_hash, 'expected_outcome', NEW.expected_outcome,
        'actual_outcome', NEW.actual_outcome, 'assertion_passed', NEW.assertion_passed,
        'diagnostic_codes', NEW.diagnostic_codes, 'diagnostics', NEW.diagnostics,
        'actual_output', NEW.actual_output, 'duration_ms', NEW.duration_ms
    )::text, 'sha256'), 'hex');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_entity_numbering_test_artifact_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$ BEGIN
    RAISE EXCEPTION 'Entity numbering test artifacts are immutable' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_numbering_test_artifact()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM metadata.entity_change_set c
         WHERE c.id = NEW.change_set_id
           AND c.tenant_id IS NOT DISTINCT FROM NEW.source_tenant_id
           AND c.entity_id = NEW.entity_id
           AND c.lock_version = NEW.source_lock_version
    ) THEN RAISE EXCEPTION 'Numbering test source coordinates or lock version do not match its change set' USING ERRCODE = 'check_violation'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM metadata.entity_numbering_binding b
         WHERE b.id = NEW.numbering_binding_id
           AND b.tenant_id IS NOT DISTINCT FROM NEW.source_tenant_id
           AND b.change_set_id = NEW.change_set_id
           AND b.binding_key = NEW.binding_key
           AND b.target_plane = NEW.target_plane
           AND b.policy_code = NEW.policy_code
           AND b.policy_revision = NEW.policy_revision
    ) THEN RAISE EXCEPTION 'Numbering test binding does not match persisted metadata' USING ERRCODE = 'check_violation'; END IF;

    NEW.diagnostic_codes := ARRAY(SELECT DISTINCT btrim(code) FROM unnest(NEW.diagnostic_codes) code
        WHERE nullif(btrim(code), '') IS NOT NULL ORDER BY btrim(code));
    NEW.binding_contract_hash := snapshot.fn_compute_entity_contract_hash(NEW.binding_contract_json);
    NEW.policy_contract_hash := CASE WHEN NEW.policy_contract_json IS NULL THEN NULL
        ELSE snapshot.fn_compute_entity_contract_hash(NEW.policy_contract_json) END;
    NEW.preview_input_hash := snapshot.fn_compute_entity_contract_hash(NEW.preview_input_json);
    NEW.actual_output_hash := snapshot.fn_compute_entity_contract_hash(NEW.actual_output_json);
    NEW.artifact_hash := encode(public.digest(jsonb_build_object(
        'tenant_id', NEW.tenant_id, 'entity_id', NEW.entity_id, 'change_set_id', NEW.change_set_id,
        'source_lock_version', NEW.source_lock_version, 'numbering_binding_id', NEW.numbering_binding_id,
        'binding_contract_hash', NEW.binding_contract_hash, 'policy_contract_hash', NEW.policy_contract_hash,
        'preview_input_hash', NEW.preview_input_hash, 'actual_output_hash', NEW.actual_output_hash,
        'diagnostic_codes', NEW.diagnostic_codes, 'diagnostics', NEW.diagnostics, 'status', NEW.status,
        'executed_at', NEW.executed_at, 'executed_by', NEW.executed_by
    )::text, 'sha256'), 'hex');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION snapshot.fn_compute_entity_release_artifact_hash(
    p_source_release_id uuid,
    p_source_revision_id uuid,
    p_entity_id uuid,
    p_plane_key text,
    p_release_hash text,
    p_contract_hash text,
    p_compiled_json jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT encode(public.digest(jsonb_build_object(
        'source_release_id', p_source_release_id,
        'source_revision_id', p_source_revision_id,
        'entity_id', p_entity_id,
        'plane_key', p_plane_key,
        'release_hash', p_release_hash,
        'contract_hash', p_contract_hash,
        'compiled', p_compiled_json
    )::text, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_release_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, snapshot
AS $$
DECLARE
    v_release metadata.entity_release%ROWTYPE;
    v_expected text;
BEGIN
    SELECT * INTO v_release
      FROM metadata.entity_release
     WHERE id = NEW.source_release_id;
    IF NOT FOUND
       OR v_release.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_release.entity_id <> NEW.entity_id
       OR v_release.revision_id <> NEW.source_revision_id
       OR v_release.release_hash <> NEW.release_hash
       OR v_release.contract_hash <> NEW.contract_hash
       OR NOT (NEW.plane_key = ANY(v_release.target_planes)) THEN
        RAISE EXCEPTION 'Release artifact coordinates do not match the immutable source release'
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected := snapshot.fn_compute_entity_release_artifact_hash(
        NEW.source_release_id, NEW.source_revision_id, NEW.entity_id,
        NEW.plane_key, NEW.release_hash, NEW.contract_hash, NEW.compiled_json
    );
    IF NEW.compiled_hash <> v_expected THEN
        RAISE EXCEPTION 'Release artifact compiled hash is invalid'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_entity_release_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'Entity release artifacts are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;
