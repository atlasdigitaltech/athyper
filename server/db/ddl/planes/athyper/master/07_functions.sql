CREATE OR REPLACE FUNCTION master.trg_guard_canonical_party_graph() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_cursor uuid; v_origin uuid; v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
  IF TG_TABLE_NAME='canonical_party' AND NEW.merged_into_party_id IS NOT NULL THEN v_origin:=NEW.id; v_cursor:=NEW.merged_into_party_id;
  ELSIF TG_TABLE_NAME='canonical_party_merge' THEN v_origin:=NEW.losing_party_id; v_cursor:=NEW.surviving_party_id;
  ELSIF TG_TABLE_NAME='canonical_party_relationship' AND NEW.relationship_kind IN ('group_member','subsidiary') AND NEW.status IN ('pending','active') THEN
    IF EXISTS (
      WITH RECURSIVE edge(from_id,to_id) AS (
        SELECT from_party_id,to_party_id FROM master.canonical_party_relationship
         WHERE authority_tenant_id=NEW.authority_tenant_id AND relationship_kind IN ('group_member','subsidiary')
           AND status IN ('pending','active') AND id<>NEW.id
        UNION ALL SELECT NEW.from_party_id,NEW.to_party_id
      ), walk(id,path) AS (
        SELECT NEW.to_party_id,ARRAY[NEW.to_party_id]
        UNION ALL SELECT edge.to_id,walk.path||edge.to_id FROM walk JOIN edge ON edge.from_id=walk.id WHERE NOT edge.to_id=ANY(walk.path)
      ) SELECT 1 FROM walk WHERE id=NEW.from_party_id
    ) THEN RAISE EXCEPTION 'canonical party hierarchy cycle detected'; END IF;
    RETURN NEW;
  ELSE RETURN NEW; END IF;
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor=v_origin OR v_cursor=ANY(v_seen) THEN RAISE EXCEPTION 'canonical party graph cycle detected'; END IF;
    v_seen:=array_append(v_seen,v_cursor);
    SELECT merged_into_party_id INTO v_cursor FROM master.canonical_party WHERE id=v_cursor;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.realm_key IS DISTINCT FROM OLD.realm_key THEN
        RAISE EXCEPTION
            'master.tenant identity fields id, code, and realm_key are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_master_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_old_status text := to_jsonb(OLD) ->> 'status';
    v_new_status text := to_jsonb(NEW) ->> 'status';
BEGIN
    IF to_jsonb(NEW) -> 'created_at'
           IS DISTINCT FROM to_jsonb(OLD) -> 'created_at'
       OR to_jsonb(NEW) -> 'created_by'
           IS DISTINCT FROM to_jsonb(OLD) -> 'created_by' THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_old_status = 'deprecated'
       AND v_new_status IS DISTINCT FROM 'deprecated' THEN
        RAISE EXCEPTION 'Deprecated %.% rows cannot be reactivated',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_set_master_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.created_by := v_actor;
    ELSIF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_catalog_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION '%.% id and code are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'module'
       AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
        RAISE EXCEPTION 'master.module workspace assignment is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'provisioning' AND NEW.status IN ('active', 'terminated'))
        OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'terminated'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'terminated'))
    ) THEN
        RAISE EXCEPTION
            'Invalid tenant status transition: % -> % (tenant %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'master.tenant_profile identity fields id and tenant_id are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_tenant_weekend_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.weekend_days IS NOT NULL THEN
        SELECT array_agg(day_value ORDER BY day_value)
          INTO NEW.weekend_days
          FROM (
              SELECT DISTINCT unnest(NEW.weekend_days) AS day_value
          ) AS normalized_days;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_relationship_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.from_tenant_id IS DISTINCT FROM OLD.from_tenant_id
       OR NEW.to_tenant_id IS DISTINCT FROM OLD.to_tenant_id
       OR NEW.relationship_type IS DISTINCT FROM OLD.relationship_type THEN
        RAISE EXCEPTION
            'master.tenant_relationship identity fields are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.activated_at IS NOT NULL
       AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
        RAISE EXCEPTION
            'master.tenant_relationship activated_at is immutable after activation'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_relationship_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('active', 'revoked'))
        OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'revoked'))
    ) THEN
        RAISE EXCEPTION
            'Invalid tenant relationship status transition: % -> % (relationship %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'active' THEN
        NEW.activated_at := COALESCE(OLD.activated_at, NEW.activated_at, clock_timestamp());
        NEW.effective_from := COALESCE(NEW.effective_from, clock_timestamp());
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_owner_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_capability       text;
    v_target_schema    text;
    v_target_table     text;
    v_pk_column        text;
    v_is_tenant_scoped boolean;
    v_tenant_column    text;
    v_exists           boolean;
BEGIN
    v_capability := CASE TG_TABLE_NAME
        WHEN 'address_link' THEN 'address'
        WHEN 'contact_link' THEN 'contact'
        ELSE NULL
    END;

    IF v_capability IS NULL THEN
        RAISE EXCEPTION 'Unsupported owner-reference table %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME;
    END IF;

    SELECT target_schema, target_table, pk_column,
           is_tenant_scoped, tenant_column
      INTO v_target_schema, v_target_table, v_pk_column,
           v_is_tenant_scoped, v_tenant_column
      FROM control.owner_type
     WHERE id = NEW.owner_type_id
       AND status = 'active'
       AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
       AND (
           (v_capability = 'address' AND supports_address)
           OR (v_capability = 'contact' AND supports_contact)
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Owner type % is not active, accessible, or enabled for %',
            NEW.owner_type_id, v_capability
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM control.owner_type_purpose
         WHERE owner_type_id = NEW.owner_type_id
           AND capability = v_capability
           AND purpose_code = NEW.purpose
    ) THEN
        RAISE EXCEPTION
            'Purpose % is not allowed for owner type % and capability %',
            NEW.purpose, NEW.owner_type_id, v_capability
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I
                  WHERE %I = $1 AND %I = $2
             )',
            v_target_schema, v_target_table,
            v_pk_column, v_tenant_column
        )
        INTO v_exists
        USING NEW.owner_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I WHERE %I = $1
             )',
            v_target_schema, v_target_table, v_pk_column
        )
        INTO v_exists
        USING NEW.owner_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION
            'Owner % does not exist in %.% for owner type % and tenant %',
            NEW.owner_id, v_target_schema, v_target_table,
            NEW.owner_type_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_contact_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.value := btrim(NEW.value);
    NEW.purpose := lower(btrim(NEW.purpose));
    NEW.role_qualifier := nullif(btrim(NEW.role_qualifier), '');

    IF NEW.channel_type = 'email' THEN
        NEW.value := lower(NEW.value);
        IF NEW.value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
            RAISE EXCEPTION 'Invalid email contact value'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.channel_type IN ('phone', 'fax', 'sms', 'whatsapp') THEN
        IF NEW.value !~ '^\+[1-9][0-9]{1,14}$' THEN
            RAISE EXCEPTION 'Phone-family contact values must use E.164'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.channel_type = 'website' THEN
        IF NEW.value !~ '^https?://[^[:space:]]+$' THEN
            RAISE EXCEPTION 'Website contact value must be an absolute HTTP(S) URL'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_external_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.source_system_code := lower(btrim(NEW.source_system_code));
    NEW.external_entity_code := lower(btrim(NEW.external_entity_code));
    NEW.external_id := btrim(NEW.external_id);
    NEW.external_code := nullif(btrim(NEW.external_code), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_external_reference_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.owner_type_id IS DISTINCT FROM OLD.owner_type_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.source_system_code IS DISTINCT FROM OLD.source_system_code
       OR NEW.external_entity_code IS DISTINCT FROM OLD.external_entity_code
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
        RAISE EXCEPTION
            'master.external_reference mapping coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_external_reference_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_target_schema      text;
    v_target_table       text;
    v_pk_column          text;
    v_is_tenant_scoped   boolean;
    v_tenant_column      text;
    v_exists             boolean;
BEGIN
    SELECT target_schema, target_table, pk_column,
           is_tenant_scoped, tenant_column
      INTO v_target_schema, v_target_table, v_pk_column,
           v_is_tenant_scoped, v_tenant_column
      FROM control.owner_type
     WHERE id = NEW.owner_type_id
       AND status = 'active'
       AND supports_external_reference
       AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Owner type % is not active, accessible, or enabled for external references',
            NEW.owner_type_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I
                  WHERE %I = $1 AND %I = $2
             )',
            v_target_schema, v_target_table,
            v_pk_column, v_tenant_column
        )
        INTO v_exists
        USING NEW.owner_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS (
                 SELECT 1 FROM %I.%I WHERE %I = $1
             )',
            v_target_schema, v_target_table, v_pk_column
        )
        INTO v_exists
        USING NEW.owner_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION
            'External-reference owner % does not exist in %.% for tenant %',
            NEW.owner_id, v_target_schema, v_target_table, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_team()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.team_type := lower(btrim(NEW.team_type));
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_team_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            'master.team identity fields id, tenant_id, and code are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
        RAISE EXCEPTION 'Archived teams cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_team_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.role_code := lower(btrim(NEW.role_code));
    NEW.leave_reason := nullif(btrim(NEW.leave_reason), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_team_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.role_code IS DISTINCT FROM OLD.role_code
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'master.team_member identity, role, join time, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.left_at IS NOT NULL
       AND (
           NEW.left_at IS DISTINCT FROM OLD.left_at
           OR NEW.left_by IS DISTINCT FROM OLD.left_by
           OR NEW.leave_reason IS DISTINCT FROM OLD.leave_reason
       ) THEN
        RAISE EXCEPTION 'Ended team memberships are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.left_at IS NULL
       AND NEW.left_at IS NULL
       AND (
           NEW.left_by IS DISTINCT FROM OLD.left_by
           OR NEW.leave_reason IS DISTINCT FROM OLD.leave_reason
       ) THEN
        RAISE EXCEPTION
            'Team membership exit evidence requires left_at'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_link_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.owner_type_id IS DISTINCT FROM OLD.owner_type_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION
            'master.contact_link identity and owner coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.channel_type IS DISTINCT FROM OLD.channel_type THEN
        IF OLD.channel_type = 'email'
           AND EXISTS (
               SELECT 1 FROM master.contact_email
                WHERE contact_link_id = OLD.id
           ) THEN
            RAISE EXCEPTION
                'Email contact channel cannot change while contact_email exists'
                USING ERRCODE = 'check_violation';
        END IF;

        IF OLD.channel_type IN ('phone', 'fax', 'sms', 'whatsapp')
           AND NEW.channel_type NOT IN ('phone', 'fax', 'sms', 'whatsapp')
           AND EXISTS (
               SELECT 1 FROM master.contact_phone
                WHERE contact_link_id = OLD.id
           ) THEN
            RAISE EXCEPTION
                'Phone-family contact channel cannot change families while contact_phone exists'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_extension_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_channel_type text;
BEGIN
    SELECT channel_type
      INTO v_channel_type
      FROM master.contact_link
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.contact_link_id;

    IF TG_TABLE_NAME = 'contact_email' AND v_channel_type <> 'email' THEN
        RAISE EXCEPTION 'contact_email requires an email contact_link'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'contact_phone'
       AND v_channel_type NOT IN ('phone', 'fax', 'sms', 'whatsapp') THEN
        RAISE EXCEPTION
            'contact_phone requires a phone-family contact_link'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.current_principal_id_soft()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT nullif(current_setting('app.current_principal_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
       OR NEW.provisioning_source IS DISTINCT FROM OLD.provisioning_source THEN
        RAISE EXCEPTION
            'master.principal identity, type, and provisioning source are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.auth_epoch IS DISTINCT FROM OLD.auth_epoch
       AND NEW.auth_epoch <> OLD.auth_epoch + 1 THEN
        RAISE EXCEPTION
            'master.principal auth_epoch must increment by exactly one'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'active' AND NEW.status IN ('suspended', 'deactivated'))
        OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'deactivated'))
    ) THEN
        RAISE EXCEPTION
            'Invalid principal status transition: % -> % (principal %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.auth_epoch := OLD.auth_epoch + 1;
    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_child_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id THEN
        RAISE EXCEPTION
            '%.% identity fields id, tenant_id, and principal_id are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_principal_identity_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    NEW.realm_key := lower(btrim(NEW.realm_key));
    NEW.subject_id := btrim(NEW.subject_id);
    NEW.issuer := nullif(btrim(NEW.issuer), '');
    NEW.audience := nullif(btrim(NEW.audience), '');
    NEW.username := nullif(btrim(NEW.username), '');
    NEW.service_client_id := nullif(btrim(NEW.service_client_id), '');
    NEW.sync_error_message := nullif(btrim(NEW.sync_error_message), '');

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_principal_identity_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.provider_code IS DISTINCT FROM OLD.provider_code
       OR NEW.realm_key IS DISTINCT FROM OLD.realm_key
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
        RAISE EXCEPTION
            'master.principal_identity_binding provider identity coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_identity_binding_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_principal_type master.principal_type_d;
BEGIN
    SELECT principal_type
      INTO v_principal_type
      FROM master.principal
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.principal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'principal_identity_binding principal % does not exist in tenant %',
            NEW.principal_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.service_client_id IS NOT NULL
       AND v_principal_type NOT IN ('service_account', 'integration') THEN
        RAISE EXCEPTION
            'service_client_id requires a service_account or integration principal'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_identity_binding_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'active' AND NEW.status IN ('disabled', 'revoked'))
        OR (OLD.status = 'disabled' AND NEW.status IN ('active', 'revoked'))
    ) THEN
        RAISE EXCEPTION
            'Invalid identity-binding status transition: % -> % (binding %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status <> 'active' THEN
        NEW.is_primary := false;
    END IF;

    NEW.status_changed_at := clock_timestamp();
    NEW.status_changed_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        OLD.status_changed_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_principal_registry_codes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF TG_TABLE_NAME = 'principal_ui_preference' THEN
        NEW.preference_code := lower(btrim(NEW.preference_code));
        NEW.surface_code := nullif(lower(btrim(NEW.surface_code)), '');
    ELSIF TG_TABLE_NAME = 'principal_notification_preference' THEN
        NEW.event_code := lower(btrim(NEW.event_code));
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.fn_resolve_principal_identity(
    p_tenant_id     uuid,
    p_provider_code master.identity_provider_d,
    p_realm_key     text,
    p_subject_id    text
)
RETURNS TABLE (
    principal_id   uuid,
    principal_type master.principal_type_d,
    auth_epoch     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, master, shared
AS $$
    SELECT p.id, p.principal_type, p.auth_epoch
      FROM master.principal_identity_binding AS b
      JOIN master.principal AS p
        ON p.tenant_id = b.tenant_id
       AND p.id = b.principal_id
     WHERE p_tenant_id = shared.current_tenant_id_soft()
       AND b.tenant_id = p_tenant_id
       AND b.provider_code = p_provider_code
       AND b.realm_key = lower(btrim(p_realm_key))
       AND b.subject_id = btrim(p_subject_id)
       AND b.status = 'active'
       AND p.status = 'active';
$$;

COMMENT ON FUNCTION master.fn_resolve_principal_identity(
    uuid, master.identity_provider_d, text, text
) IS
  'Resolves a validated external IAM subject inside the already-established tenant context. Returns only active binding/principal data.';

CREATE OR REPLACE FUNCTION master.trg_normalize_saved_view()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    NEW.surface_code := lower(btrim(NEW.surface_code));
    NEW.entity_code := lower(btrim(NEW.entity_code));
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_saved_view_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.surface_code IS DISTINCT FROM OLD.surface_code
       OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
       OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION
            'master.saved_view identity fields id, tenant_id, surface_code, entity_code, and code are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_render_registry_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION '%.% id and tenant_id are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF to_jsonb(NEW) ? 'code'
       AND to_jsonb(NEW) -> 'code' IS DISTINCT FROM to_jsonb(OLD) -> 'code' THEN
        RAISE EXCEPTION '%.% code is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'template_binding'
       AND (
           NEW.template_id IS DISTINCT FROM OLD.template_id
           OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
           OR NEW.operation_code IS DISTINCT FROM OLD.operation_code
           OR NEW.variant_code IS DISTINCT FROM OLD.variant_code
           OR NEW.locale_code IS DISTINCT FROM OLD.locale_code
       ) THEN
        RAISE EXCEPTION 'master.template_binding resolution coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_switch_render_registry_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.is_default
       AND NEW.status = 'active'
       AND (
           TG_OP = 'INSERT'
           OR OLD.is_default IS DISTINCT FROM NEW.is_default
           OR OLD.status IS DISTINCT FROM NEW.status
       ) THEN
        EXECUTE format(
            'UPDATE master.%I
                SET is_default = false
              WHERE tenant_id = $1
                AND id <> $2
                AND is_default
                AND status = ''active''',
            TG_TABLE_NAME
        )
        USING NEW.tenant_id, NEW.id;
    END IF;

    RETURN NEW;
END;
$$;
