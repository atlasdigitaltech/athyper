CREATE OR REPLACE FUNCTION control.trg_guard_risk_source_config_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.source_code IS DISTINCT FROM OLD.source_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'risk source coordinates and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;
