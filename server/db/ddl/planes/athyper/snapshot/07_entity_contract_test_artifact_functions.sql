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
