CREATE OR REPLACE FUNCTION ledger.trg_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ledger
AS $$
BEGIN
    RAISE EXCEPTION 'ledger.% is append-only', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_guard_identity_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ledger
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'ledger.% identity and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_stamp_run_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ledger
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
        NEW.status_changed_by := COALESCE(
            NEW.status_changed_by,
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.updated_by,
            '00000000-0000-0000-0000-000000000000'::uuid
        );
    ELSIF NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
       OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by THEN
        RAISE EXCEPTION 'Planning run status evidence requires a status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_planning_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ledger, document
AS $$
DECLARE
    v_scenario_status document.planning_scenario_status_d;
    v_expected_hash text;
BEGIN
    SELECT status INTO v_scenario_status
      FROM document.planning_scenario
     WHERE tenant_id = NEW.tenant_id
       AND planning_model_id = NEW.planning_model_id
       AND id = NEW.planning_scenario_id;
    IF NOT FOUND OR v_scenario_status NOT IN ('approved', 'superseded') THEN
        RAISE EXCEPTION 'Planning runs require an approved scenario version'
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected_hash := document.planning_scenario_input_hash(
        NEW.tenant_id, NEW.planning_scenario_id
    );
    IF NEW.input_hash <> v_expected_hash THEN
        RAISE EXCEPTION 'Planning run input hash does not match the approved scenario'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_guard_planning_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ledger
AS $$
BEGIN
    IF NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
       OR NEW.planning_scenario_id IS DISTINCT FROM OLD.planning_scenario_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.model_version_number IS DISTINCT FROM OLD.model_version_number
       OR NEW.input_hash IS DISTINCT FROM OLD.input_hash THEN
        RAISE EXCEPTION 'Planning run model, scenario and input identity are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
