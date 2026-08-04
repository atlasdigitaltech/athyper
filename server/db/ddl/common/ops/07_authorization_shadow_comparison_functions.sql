CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_shadow_comparison()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, ops
AS $$ BEGIN
    RAISE EXCEPTION 'Authorization shadow comparison evidence is append-only'
      USING ERRCODE='55000';
END; $$;

