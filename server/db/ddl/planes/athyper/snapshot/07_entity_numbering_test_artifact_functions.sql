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

