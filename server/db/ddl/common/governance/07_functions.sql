CREATE OR REPLACE FUNCTION governance.trg_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION governance.trg_guard_channel_consent_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.channel_code IS DISTINCT FROM OLD.channel_code
       OR NEW.destination_hash IS DISTINCT FROM OLD.destination_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'channel consent coordinates are immutable'
            USING ERRCODE = '22000';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
