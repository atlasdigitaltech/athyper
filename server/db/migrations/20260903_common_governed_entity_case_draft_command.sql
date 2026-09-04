-- G1 governed entity-case canonical draft command, shared by all three planes.
BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('athyper_studio', 'athyper_neon', 'athyper_mesh')
     OR current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh')
     OR current_database() <> 'athyper_' || current_setting('app.database_plane', true) THEN
    RAISE EXCEPTION 'Governed entity-case draft command requires a supported matching plane';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_entity_case_three_way_merge(
  p_base jsonb,
  p_current jsonb,
  p_proposed jsonb,
  p_path text DEFAULT ''
)
RETURNS TABLE(merged jsonb, conflicts text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_key text;
  v_base jsonb;
  v_current jsonb;
  v_proposed jsonb;
  v_base_has boolean;
  v_current_has boolean;
  v_proposed_has boolean;
  v_nested record;
  v_take_present boolean;
  v_take_value jsonb;
  v_path text;
BEGIN
  IF p_base IS NOT DISTINCT FROM p_current THEN
    RETURN QUERY SELECT p_proposed, '{}'::text[];
    RETURN;
  END IF;
  IF p_base IS NOT DISTINCT FROM p_proposed OR p_current IS NOT DISTINCT FROM p_proposed THEN
    RETURN QUERY SELECT p_current, '{}'::text[];
    RETURN;
  END IF;
  IF jsonb_typeof(p_base) <> 'object'
     OR jsonb_typeof(p_current) <> 'object'
     OR jsonb_typeof(p_proposed) <> 'object' THEN
    RETURN QUERY SELECT p_current, ARRAY[COALESCE(NULLIF(p_path, ''), '/')];
    RETURN;
  END IF;

  merged := '{}'::jsonb;
  conflicts := '{}'::text[];
  FOR v_key IN
    SELECT key
      FROM (
        SELECT jsonb_object_keys(p_base) AS key
        UNION SELECT jsonb_object_keys(p_current)
        UNION SELECT jsonb_object_keys(p_proposed)
      ) AS keys
     ORDER BY key
  LOOP
    v_base_has := p_base ? v_key;
    v_current_has := p_current ? v_key;
    v_proposed_has := p_proposed ? v_key;
    v_base := p_base -> v_key;
    v_current := p_current -> v_key;
    v_proposed := p_proposed -> v_key;
    v_path := p_path || '/' || replace(replace(v_key, '~', '~0'), '/', '~1');
    v_take_present := false;
    v_take_value := NULL;

    IF v_current_has = v_base_has AND (NOT v_current_has OR v_current = v_base) THEN
      v_take_present := v_proposed_has;
      v_take_value := v_proposed;
    ELSIF v_proposed_has = v_base_has AND (NOT v_proposed_has OR v_proposed = v_base) THEN
      v_take_present := v_current_has;
      v_take_value := v_current;
    ELSIF v_current_has = v_proposed_has AND (NOT v_current_has OR v_current = v_proposed) THEN
      v_take_present := v_current_has;
      v_take_value := v_current;
    ELSIF v_base_has AND v_current_has AND v_proposed_has
          AND jsonb_typeof(v_base) = 'object'
          AND jsonb_typeof(v_current) = 'object'
          AND jsonb_typeof(v_proposed) = 'object' THEN
      SELECT * INTO v_nested
        FROM document.fn_entity_case_three_way_merge(v_base, v_current, v_proposed, v_path);
      v_take_present := true;
      v_take_value := v_nested.merged;
      conflicts := conflicts || v_nested.conflicts;
    ELSE
      v_take_present := v_current_has;
      v_take_value := v_current;
      conflicts := conflicts || v_path;
    END IF;

    IF v_take_present THEN
      merged := jsonb_set(merged, ARRAY[v_key], v_take_value, true);
    END IF;
  END LOOP;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_validate_entity_case_payload(p_contract jsonb, p_payload jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_schema jsonb := COALESCE(p_contract -> 'jsonSchema', p_contract -> 'schema', p_contract);
  v_key text;
  v_definition jsonb;
  v_errors text[] := '{}';
  v_actual text;
  v_expected text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 262144 THEN
    RETURN ARRAY['PAYLOAD_OBJECT_OR_SIZE_INVALID'];
  END IF;
  IF jsonb_typeof(v_schema) <> 'object' THEN
    RETURN ARRAY['CONTRACT_SCHEMA_INVALID'];
  END IF;
  IF jsonb_typeof(v_schema -> 'required') = 'array' THEN
    FOR v_key IN SELECT jsonb_array_elements_text(v_schema -> 'required') LOOP
      IF NOT p_payload ? v_key THEN v_errors := v_errors || ('MISSING_REQUIRED:' || v_key); END IF;
    END LOOP;
  END IF;
  IF v_schema ->> 'additionalProperties' = 'false' AND jsonb_typeof(v_schema -> 'properties') = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
      IF NOT (v_schema -> 'properties') ? v_key THEN v_errors := v_errors || ('UNKNOWN_PROPERTY:' || v_key); END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(v_schema -> 'properties') = 'object' THEN
    FOR v_key, v_definition IN SELECT key, value FROM jsonb_each(v_schema -> 'properties') LOOP
      IF p_payload ? v_key AND v_definition ? 'type' THEN
        v_actual := jsonb_typeof(p_payload -> v_key);
        v_expected := v_definition ->> 'type';
        IF NOT (
          v_actual = v_expected
          OR v_expected = 'number' AND v_actual = 'number'
          OR v_expected = 'integer' AND v_actual = 'number'
             AND (p_payload ->> v_key)::numeric = trunc((p_payload ->> v_key)::numeric)
        ) THEN
          v_errors := v_errors || ('TYPE_MISMATCH:' || v_key);
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN v_errors;
EXCEPTION WHEN others THEN
  RETURN ARRAY['CONTRACT_SCHEMA_INVALID'];
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
DECLARE
  v_execution_id uuid := NULLIF(current_setting('app.entity_case_command_execution_id', true), '')::uuid;
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
  IF v_execution_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM event.command_execution AS execution
     WHERE execution.id = v_execution_id
       AND execution.tenant_id = v_tenant_id
       AND execution.command_code = 'entity.case.draft.write'
       AND execution.status = 'processing'
       AND execution.actor_principal_id = master.current_principal_id_soft()
  ) THEN
    RAISE EXCEPTION 'Entity case mutations require the governed command'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION document.command_entity_case_draft(
  p_tenant_id uuid, p_case_id uuid, p_expected_version bigint, p_base_snapshot_id uuid,
  p_case_code text, p_entity_code text, p_operation_code text, p_target_entity_id uuid,
  p_pre_materialization_ref text, p_entity_contract_id uuid, p_entity_contract_hash text,
  p_form_template_release_id uuid, p_form_template_release_no bigint, p_form_template_hash text,
  p_proposed_payload jsonb, p_idempotency_key text, p_actor_id uuid, p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE(entity_case_id uuid, snapshot_id uuid, row_version bigint, status text,
              disposition text, conflict_paths text[], replayed boolean, outbox_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, document, snapshot, runtime_meta, event, shared, master
SET row_security = on
AS $$
DECLARE
  v_fingerprint text;
  v_prior event.command_execution%ROWTYPE;
  v_execution_id uuid;
  v_contract runtime_meta.entity_contract%ROWTYPE;
  v_current document.entity_case%ROWTYPE;
  v_base_payload jsonb;
  v_current_payload jsonb;
  v_candidate jsonb;
  v_merge record;
  v_errors text[];
  v_new_snapshot_id uuid;
  v_new_version bigint;
  v_outbox_id uuid;
  v_result jsonb;
  v_before_version bigint;
  v_outcome text;
BEGIN
  IF current_database() <> 'athyper_' || current_setting('app.database_plane', true)
     OR shared.current_tenant_id() <> p_tenant_id
     OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Entity case command context mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_version < 0 OR btrim(p_idempotency_key) <> p_idempotency_key
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(p_proposed_payload) <> 'object' THEN
    RAISE EXCEPTION 'Entity case command arguments are invalid' USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
    'caseId', p_case_id, 'expectedVersion', p_expected_version, 'baseSnapshotId', p_base_snapshot_id,
    'caseCode', p_case_code, 'entityCode', p_entity_code, 'operationCode', p_operation_code,
    'targetEntityId', p_target_entity_id, 'preMaterializationRef', p_pre_materialization_ref,
    'contractId', p_entity_contract_id, 'contractHash', p_entity_contract_hash,
    'formReleaseId', p_form_template_release_id, 'formReleaseNo', p_form_template_release_no,
    'formHash', p_form_template_hash, 'payload', p_proposed_payload, 'actorId', p_actor_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':entity-case-command:' || p_idempotency_key, 0));
  SELECT execution.* INTO v_prior
    FROM event.command_execution AS execution
   WHERE execution.tenant_id = p_tenant_id
     AND execution.command_code = 'entity.case.draft.write'
     AND execution.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prior.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Entity case idempotency conflict' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT
      (v_prior.result_payload ->> 'caseId')::uuid,
      (v_prior.result_payload ->> 'snapshotId')::uuid,
      (v_prior.result_payload ->> 'rowVersion')::bigint,
      v_prior.result_payload ->> 'status',
      v_prior.result_payload ->> 'disposition',
      ARRAY(SELECT jsonb_array_elements_text(v_prior.result_payload -> 'conflictPaths')),
      true,
      (v_prior.result_payload ->> 'outboxId')::uuid;
    RETURN;
  END IF;

  SELECT contract.* INTO v_contract
    FROM runtime_meta.entity_contract AS contract
   WHERE contract.tenant_id = p_tenant_id
     AND contract.id = p_entity_contract_id
     AND contract.entity_code = p_entity_code
     AND contract.entity_contract_hash = p_entity_contract_hash
     AND contract.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pinned published entity contract was not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  v_errors := document.fn_validate_entity_case_payload(v_contract.contract_json, p_proposed_payload);
  IF cardinality(v_errors) > 0 THEN
    RAISE EXCEPTION 'Entity case payload failed contract validation: %', array_to_string(v_errors, ',')
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO event.command_execution(
    tenant_id, command_code, idempotency_key, request_fingerprint, status,
    actor_principal_id, source_service, correlation_id, started_at,
    status_changed_at, status_changed_by, created_by
  ) VALUES (
    p_tenant_id, 'entity.case.draft.write', p_idempotency_key, v_fingerprint, 'processing',
    p_actor_id, 'governed-entity-case', p_correlation_id, clock_timestamp(),
    clock_timestamp(), p_actor_id, p_actor_id
  ) RETURNING id INTO v_execution_id;

  PERFORM set_config('app.entity_case_command_execution_id', v_execution_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':entity-case:' || p_case_id::text, 0));
  SELECT entity_case.* INTO v_current
    FROM document.entity_case AS entity_case
   WHERE entity_case.tenant_id = p_tenant_id AND entity_case.id = p_case_id
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version <> 0 OR p_base_snapshot_id IS NOT NULL THEN
      RAISE EXCEPTION 'Entity case was not found at expected version' USING ERRCODE = 'serialization_failure';
    END IF;
    v_candidate := p_proposed_payload;
    v_before_version := 0;
    v_new_version := 1;
    v_outcome := 'accepted';
    v_new_snapshot_id := snapshot.fn_capture_entity(
      'document.entity_case', p_case_id, p_case_code, 1, p_entity_contract_hash, 1,
      'entity.case.draft.created', 'create', v_candidate, p_correlation_id,
      NULL, NULL, NULL, 'legal', 'governed-entity-case'
    );
    INSERT INTO document.entity_case(
      id, tenant_id, case_code, entity_code, operation_code, target_entity_id,
      pre_materialization_ref, entity_contract_id, entity_contract_hash,
      form_template_release_id, form_template_release_no, form_template_hash,
      current_snapshot_id, status, row_version, idempotency_key, created_by
    ) VALUES (
      p_case_id, p_tenant_id, p_case_code, p_entity_code, p_operation_code, p_target_entity_id,
      p_pre_materialization_ref, p_entity_contract_id, p_entity_contract_hash,
      p_form_template_release_id, p_form_template_release_no, p_form_template_hash,
      v_new_snapshot_id, 'draft', 1, p_idempotency_key, p_actor_id
    );
  ELSE
    IF ROW(v_current.case_code, v_current.entity_code, v_current.operation_code,
           v_current.target_entity_id, v_current.pre_materialization_ref,
           v_current.entity_contract_id, v_current.entity_contract_hash,
           v_current.form_template_release_id, v_current.form_template_release_no,
           v_current.form_template_hash)
       IS DISTINCT FROM
       ROW(p_case_code, p_entity_code, p_operation_code, p_target_entity_id,
           p_pre_materialization_ref, p_entity_contract_id, p_entity_contract_hash,
           p_form_template_release_id, p_form_template_release_no, p_form_template_hash)
       OR v_current.status <> 'draft' THEN
      RAISE EXCEPTION 'Entity case identity or lifecycle is not draft-editable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF p_expected_version > v_current.row_version THEN
      RAISE EXCEPTION 'Entity case expected version is ahead of current state'
        USING ERRCODE = 'serialization_failure';
    END IF;
    v_before_version := v_current.row_version;
    SELECT entity_snapshot.payload_json INTO v_current_payload
      FROM snapshot.entity_snapshot AS entity_snapshot
     WHERE entity_snapshot.tenant_id = p_tenant_id
       AND entity_snapshot.snapshot_id = v_current.current_snapshot_id;

    IF p_expected_version = v_current.row_version THEN
      v_candidate := p_proposed_payload;
      conflict_paths := '{}';
      v_outcome := 'accepted';
    ELSE
      SELECT entity_snapshot.payload_json INTO v_base_payload
        FROM snapshot.entity_snapshot AS entity_snapshot
        JOIN snapshot.entity_snapshot_identity AS identity
          ON identity.tenant_id = entity_snapshot.tenant_id
         AND identity.id = entity_snapshot.snapshot_id
       WHERE entity_snapshot.tenant_id = p_tenant_id
         AND entity_snapshot.snapshot_id = p_base_snapshot_id
         AND identity.entity_type = 'document.entity_case'
         AND identity.entity_id = p_case_id
         AND identity.version_number = p_expected_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Entity case merge base does not match expected case and version'
          USING ERRCODE = 'serialization_failure';
      END IF;
      SELECT * INTO v_merge
        FROM document.fn_entity_case_three_way_merge(v_base_payload, v_current_payload, p_proposed_payload);
      v_candidate := v_merge.merged;
      conflict_paths := v_merge.conflicts;
      v_outcome := CASE WHEN cardinality(conflict_paths) > 0 THEN 'conflict' ELSE 'accepted' END;
    END IF;

    IF v_outcome = 'accepted' THEN
      v_new_version := v_current.row_version + 1;
      v_new_snapshot_id := snapshot.fn_capture_entity(
        'document.entity_case', p_case_id, p_case_code, 1, p_entity_contract_hash, v_new_version,
        'entity.case.draft.revised', 'version', v_candidate, p_correlation_id,
        NULL, NULL, NULL, 'legal', 'governed-entity-case'
      );
      UPDATE document.entity_case AS entity_case
         SET current_snapshot_id = v_new_snapshot_id,
             row_version = v_new_version,
             updated_by = p_actor_id
       WHERE entity_case.tenant_id = p_tenant_id AND entity_case.id = p_case_id;
    ELSE
      v_new_version := v_current.row_version;
      v_new_snapshot_id := v_current.current_snapshot_id;
    END IF;
  END IF;

  conflict_paths := COALESCE(conflict_paths, '{}');
  INSERT INTO document.entity_case_command_evidence(
    tenant_id, entity_case_id, command_code, idempotency_key, request_fingerprint,
    expected_version, before_version, after_version, before_status, after_status,
    outcome, result_code, result_snapshot_id, result_evidence, recorded_by
  ) VALUES (
    p_tenant_id, p_case_id, 'entity.case.draft.write', p_idempotency_key, v_fingerprint,
    p_expected_version, v_before_version, v_new_version, 'draft', 'draft', v_outcome,
    CASE WHEN v_outcome = 'conflict' THEN 'ENTITY_CASE_MERGE_CONFLICT' ELSE 'ENTITY_CASE_DRAFT_APPLIED' END,
    v_new_snapshot_id, jsonb_build_object('conflictPaths', conflict_paths), p_actor_id
  );
  INSERT INTO event.outbox(
    tenant_id, topic, event_type, event_key, entity_type, entity_id,
    aggregate_type, aggregate_id, event_version, actor_id, source,
    correlation_id, partition_key, payload, created_by
  ) VALUES (
    p_tenant_id, 'governed-entity-case',
    CASE WHEN v_outcome = 'conflict' THEN 'entity.case.draft.conflicted' ELSE 'entity.case.draft.saved' END,
    'entity-case:' || p_case_id::text || ':v' || v_new_version::text || ':' || p_idempotency_key,
    'document.entity_case', p_case_id, 'entity_case', p_case_id,
    LEAST(v_new_version, 2147483647)::integer, p_actor_id, 'governed-entity-case',
    p_correlation_id, p_tenant_id::text,
    jsonb_build_object(
      'caseId', p_case_id, 'snapshotId', v_new_snapshot_id, 'rowVersion', v_new_version,
      'status', 'draft', 'disposition', v_outcome, 'conflictPaths', conflict_paths,
      'contractHash', p_entity_contract_hash
    ), p_actor_id
  ) RETURNING id INTO v_outbox_id;

  v_result := jsonb_build_object(
    'caseId', p_case_id, 'snapshotId', v_new_snapshot_id, 'rowVersion', v_new_version,
    'status', 'draft', 'disposition', v_outcome, 'conflictPaths', conflict_paths,
    'outboxId', v_outbox_id
  );
  UPDATE event.command_execution
     SET status = 'succeeded', result_payload = v_result, completed_at = clock_timestamp(),
         status_changed_at = clock_timestamp(), status_changed_by = p_actor_id, updated_by = p_actor_id
   WHERE id = v_execution_id;

  RETURN QUERY SELECT p_case_id, v_new_snapshot_id, v_new_version, 'draft',
                      v_outcome, conflict_paths, false, v_outbox_id;
END;
$$;

DROP TRIGGER IF EXISTS entity_case_command_guard ON document.entity_case;
CREATE TRIGGER entity_case_command_guard
BEFORE INSERT OR UPDATE OR DELETE ON document.entity_case
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_entity_case_mutation();

REVOKE ALL ON FUNCTION document.fn_entity_case_three_way_merge(jsonb,jsonb,jsonb,text),
  document.fn_validate_entity_case_payload(jsonb,jsonb),
  document.trg_guard_entity_case_mutation(),
  document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT EXECUTE ON FUNCTION document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid) TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION document.fn_entity_case_three_way_merge(jsonb,jsonb,jsonb,text),
      document.fn_validate_entity_case_payload(jsonb,jsonb),
      document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid)
    TO athyperadmin;
  END IF;
END;
$$;

COMMIT;
