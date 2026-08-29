BEGIN;

DO $guard$ BEGIN
  IF current_database() <> 'athyper_mesh' OR current_setting('app.database_plane', true) <> 'mesh' THEN
    RAISE EXCEPTION 'MESH Business Partner payload guard correction requires the MESH plane';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION mesh.profile_publication_payload_is_safe(p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,mesh AS $$
DECLARE v_key text;v_value jsonb;
BEGIN
 IF jsonb_typeof(p_payload)='object' THEN
   FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_payload) LOOP
     IF lower(v_key)~'(bank|iban|swift|bic|routing|account.?number|tax|registration.?number|metadata|contact|email|phone|address|identifier)' THEN RETURN false;END IF;
     IF NOT mesh.profile_publication_payload_is_safe(v_value) THEN RETURN false;END IF;
   END LOOP;
 ELSIF jsonb_typeof(p_payload)='array' THEN
   FOR v_value IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
     IF NOT mesh.profile_publication_payload_is_safe(v_value) THEN RETURN false;END IF;
   END LOOP;
 END IF;
 RETURN true;
END $$;

DO $assertions$ BEGIN
 IF NOT mesh.profile_publication_payload_is_safe('{"commodityCapabilities":[{"code":"44120000"}]}'::jsonb) THEN RAISE EXCEPTION 'Approved commodityCapabilities field must be accepted';END IF;
 IF mesh.profile_publication_payload_is_safe('{"bankAccount":{"number":"1"}}'::jsonb) THEN RAISE EXCEPTION 'Bank fields must remain rejected';END IF;
END $assertions$;

COMMIT;
