CREATE OR REPLACE FUNCTION control.lookup_value_is_active(
  p_domain_code text,
  p_value_code text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM control.lookup_value value
      JOIN control.lookup_domain domain ON domain.code = value.domain_code
     WHERE value.domain_code = p_domain_code
       AND value.code = p_value_code
       AND value.status = 'active'
       AND domain.status = 'active'
       AND (
         value.tenant_id IS NULL
         OR (
           domain.is_extensible
           AND p_tenant_id IS NOT NULL
           AND value.tenant_id = p_tenant_id
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION control.trg_enforce_lookup_extensibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, shared
AS $$
DECLARE
  v_extensible boolean;
BEGIN
  SELECT is_extensible INTO v_extensible
    FROM control.lookup_domain
   WHERE code = NEW.domain_code AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive lookup domain %', NEW.domain_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.tenant_id IS NULL THEN
    IF NOT NEW.is_system THEN
      RAISE EXCEPTION 'Global lookup values must be system values'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_extensible THEN
    RAISE EXCEPTION 'Lookup domain % is not tenant extensible', NEW.domain_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_system THEN
    RAISE EXCEPTION 'Tenant lookup values cannot be system values'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
