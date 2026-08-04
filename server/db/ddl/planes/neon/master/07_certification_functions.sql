CREATE OR REPLACE FUNCTION master.trg_validate_certification_type_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_tenant_id uuid;
BEGIN
  IF NEW.certification_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id
    INTO v_type_tenant_id
    FROM master.certification_type
   WHERE id = NEW.certification_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown certification type: %', NEW.certification_type_id
      USING ERRCODE = '23503';
  END IF;

  IF v_type_tenant_id IS NOT NULL AND v_type_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION
      'Certification type % belongs to another tenant',
      NEW.certification_type_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
