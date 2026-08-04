CREATE OR REPLACE FUNCTION authz.trg_normalize_entity_operation_scope_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, authz
AS $$ BEGIN
    NEW.plane_code := lower(btrim(NEW.plane_code));
    NEW.entity_code := lower(btrim(NEW.entity_code));
    NEW.operation_key := lower(btrim(NEW.operation_key));
    NEW.coordinate_key := nullif(lower(btrim(NEW.coordinate_key)), '');
    NEW.resolver_key := nullif(lower(btrim(NEW.resolver_key)), '');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_validate_entity_operation_scope_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, authz
AS $$
DECLARE v_database_plane text;
BEGIN
    v_database_plane := current_setting('app.database_plane', true);
    IF v_database_plane IS NULL OR v_database_plane NOT IN ('neon','mesh') OR NEW.plane_code <> v_database_plane THEN
        RAISE EXCEPTION 'Operation-scope binding plane % does not match database plane %', NEW.plane_code, coalesce(v_database_plane,'unset')
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1 FROM authz.permission p
         WHERE p.id = NEW.permission_id AND p.permission_kind = 'entity_operation' AND p.status = 'published'
    ) THEN RAISE EXCEPTION 'Published operation-scope binding requires a published entity-operation permission'
        USING ERRCODE = 'check_violation'; END IF;
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1 FROM authz.permission_scope_policy policy
         WHERE policy.permission_id = NEW.permission_id AND policy.scope_kind = NEW.scope_kind
    ) THEN RAISE EXCEPTION 'Scope kind % is not allowed by the bound permission', NEW.scope_kind
        USING ERRCODE = 'check_violation'; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_guard_entity_operation_scope_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, authz
AS $$ BEGIN
    IF OLD.status = 'retired' THEN
        RAISE EXCEPTION 'Retired operation-scope bindings are immutable' USING ERRCODE = '55000';
    END IF;
    IF OLD.status = 'published' THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.plane_code IS DISTINCT FROM OLD.plane_code
          OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id
          OR NEW.source_entity_operation_id IS DISTINCT FROM OLD.source_entity_operation_id
          OR NEW.source_release_id IS DISTINCT FROM OLD.source_release_id
          OR NEW.source_release_hash IS DISTINCT FROM OLD.source_release_hash
          OR NEW.source_compiled_artifact_id IS DISTINCT FROM OLD.source_compiled_artifact_id
          OR NEW.source_compiled_hash IS DISTINCT FROM OLD.source_compiled_hash
          OR NEW.entity_code IS DISTINCT FROM OLD.entity_code OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
          OR NEW.permission_id IS DISTINCT FROM OLD.permission_id OR NEW.decision_mode IS DISTINCT FROM OLD.decision_mode
          OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.coordinate_source IS DISTINCT FROM OLD.coordinate_source
          OR NEW.coordinate_key IS DISTINCT FROM OLD.coordinate_key OR NEW.resolver_key IS DISTINCT FROM OLD.resolver_key
          OR NEW.missing_value_behavior IS DISTINCT FROM OLD.missing_value_behavior
          OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
          OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by
          OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
          OR NEW.status <> 'retired' OR NEW.effective_until IS NULL OR NEW.retired_at IS NULL OR NEW.retired_by IS NULL
        THEN RAISE EXCEPTION 'Published operation-scope bindings may only transition to retired'
          USING ERRCODE = '55000'; END IF;
    ELSIF OLD.status = 'draft' AND NEW.status NOT IN ('draft','published') THEN
        RAISE EXCEPTION 'Draft operation-scope binding may only remain draft or publish'
          USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_guard_entity_operation_scope_binding_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, authz
AS $$ BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Published or retired operation-scope bindings cannot be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END; $$;

