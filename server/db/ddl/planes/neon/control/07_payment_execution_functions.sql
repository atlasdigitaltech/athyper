CREATE OR REPLACE FUNCTION control.trg_validate_payment_execution_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_connector_status control.connector_instance_status_d;
BEGIN
    IF control.jsonb_has_secret_shaped_key(NEW.message_options) THEN
        RAISE EXCEPTION 'payment execution message_options cannot contain secret material'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.connector_instance_id IS NOT NULL AND NEW.status = 'active' THEN
        SELECT status INTO v_connector_status
          FROM control.connector_instance
         WHERE tenant_id = NEW.tenant_id AND id = NEW.connector_instance_id;
        IF v_connector_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'an active payment execution profile requires an active connector instance'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
