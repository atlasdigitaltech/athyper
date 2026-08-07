DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['application_projection','projection_provider','projection_scope'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON authz.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table||'_updated_at',v_table); END LOOP; END $$;
CREATE TRIGGER application_projection_status_changed BEFORE UPDATE OF status ON authz.application_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

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

CREATE TRIGGER entity_operation_scope_binding_10_normalize
BEFORE INSERT OR UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_20_guard
BEFORE UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_30_validate
BEFORE INSERT OR UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_entity_operation_scope_binding();

CREATE TRIGGER entity_operation_scope_binding_60_updated_at
BEFORE UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_operation_scope_binding_90_delete_guard
BEFORE DELETE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_scope_binding_delete();
