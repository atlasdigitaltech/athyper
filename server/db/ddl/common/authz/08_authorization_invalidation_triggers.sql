CREATE OR REPLACE FUNCTION event.trg_capture_authorization_invalidation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, pg_catalog AS $$
DECLARE
    v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_tenant_id uuid;
    v_scope_kind text := 'global';
    v_plane_code text;
    v_key jsonb;
BEGIN
    BEGIN v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant_id := NULL; END;
    IF v_tenant_id IS NOT NULL THEN
      v_scope_kind := 'plane';
      v_plane_code := current_setting('app.database_plane', true);
    END IF;
    v_key := jsonb_strip_nulls(v_row - ARRAY['created_at','created_by','updated_at','updated_by','status_changed_at','status_changed_by']);
    IF v_key = '{}'::jsonb THEN v_key := jsonb_build_object('table', TG_TABLE_NAME); END IF;
    PERFORM event.fn_authorization_emit_invalidation(
      encode(public.digest(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP || ':' || v_key::text || ':' || txid_current()::text, 'sha256'), 'hex'),
      v_scope_kind, v_tenant_id, v_plane_code, TG_TABLE_NAME, substr(TG_OP,1,1)::char(1), v_key);
    RETURN NULL;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
  FOR v_table IN SELECT tablename FROM pg_tables WHERE schemaname = 'authz'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_authorization_invalidation_capture AFTER INSERT OR UPDATE OR DELETE ON authz.%I FOR EACH ROW EXECUTE FUNCTION event.trg_capture_authorization_invalidation()', v_table);
  END LOOP;
END;
$$;
