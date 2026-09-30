-- Local Neon pilot: allow transaction coordination without registry write privileges.
CREATE OR REPLACE FUNCTION control.lock_master_data_owner_registry() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF nullif(current_setting('app.current_tenant_id',true),'') IS NULL THEN
    RAISE EXCEPTION 'Tenant context is required' USING ERRCODE='42501';
  END IF;
  LOCK TABLE control.owner_type IN SHARE MODE;
END;
$$;
REVOKE ALL ON FUNCTION control.lock_master_data_owner_registry() FROM PUBLIC;
