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

CREATE OR REPLACE FUNCTION snapshot.trg_reject_network_profile_publication_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'snapshot.network_account_profile_publication is immutable' USING ERRCODE='integrity_constraint_violation'; END $$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_bank_disclosure_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'snapshot.bank_account_disclosure is immutable' USING ERRCODE='integrity_constraint_violation'; END $$;

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
