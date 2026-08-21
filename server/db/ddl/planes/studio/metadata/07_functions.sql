CREATE OR REPLACE FUNCTION metadata.current_actor_id(
    p_fallback uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT coalesce(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        p_fallback
    );
$$;

CREATE OR REPLACE FUNCTION metadata.trg_guard_entity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.module_id, NEW.entity_code,
           NEW.entity_class, NEW.ownership_model, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.module_id, OLD.entity_code,
           OLD.entity_class, OLD.ownership_model, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION
            'Entity identity, scope, classification, ownership, and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'active', 'retired'))
       OR (OLD.status = 'active' AND NEW.status NOT IN ('active', 'deprecated', 'retired'))
       OR (OLD.status = 'deprecated' AND NEW.status NOT IN ('active', 'deprecated', 'retired'))
       OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
        RAISE EXCEPTION 'Invalid Entity lifecycle transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_change_set()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_entity_tenant uuid;
    v_parent metadata.entity_change_set%ROWTYPE;
    v_base metadata.entity_release%ROWTYPE;
    v_actor uuid;
    v_substantive_change boolean := false;
BEGIN
    SELECT tenant_id
      INTO v_entity_tenant
      FROM metadata.entity
     WHERE id = NEW.entity_id;

    IF NOT FOUND OR v_entity_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Change-set scope must match its Entity scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.parent_change_set_id IS NOT NULL THEN
        SELECT * INTO v_parent
          FROM metadata.entity_change_set
         WHERE id = NEW.parent_change_set_id;
        IF NOT FOUND
           OR v_parent.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_parent.entity_id <> NEW.entity_id THEN
            RAISE EXCEPTION 'Parent change set must belong to the same scoped Entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF NEW.base_release_id IS NOT NULL THEN
        SELECT * INTO v_base
          FROM metadata.entity_release
         WHERE id = NEW.base_release_id;
        IF NOT FOUND
           OR v_base.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_base.entity_id <> NEW.entity_id THEN
            RAISE EXCEPTION 'Base release must belong to the same scoped Entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'A change set must be created in draft status'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        RETURN NEW;
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.entity_id, NEW.change_set_code,
           NEW.branch_code, NEW.base_release_id, NEW.parent_change_set_id,
           NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.entity_id, OLD.change_set_code,
           OLD.branch_code, OLD.base_release_id, OLD.parent_change_set_id,
           OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION 'Change-set identity, ancestry, base release, and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    v_substantive_change := ROW(
        NEW.title, NEW.change_summary, NEW.change_reason_code, NEW.ticket_reference
    ) IS DISTINCT FROM ROW(
        OLD.title, OLD.change_summary, OLD.change_reason_code, OLD.ticket_reference
    );

    IF v_substantive_change AND OLD.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Only draft or rejected change sets may be edited'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF v_substantive_change AND OLD.status = 'rejected' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Editing a rejected change set must return it to draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF (OLD.status = 'draft' AND NEW.status NOT IN ('in_review', 'abandoned'))
           OR (OLD.status = 'in_review' AND NEW.status NOT IN ('draft', 'approved', 'rejected', 'abandoned'))
           OR (OLD.status = 'rejected' AND NEW.status NOT IN ('draft', 'abandoned'))
           OR (OLD.status = 'approved' AND NEW.status <> 'published')
           OR OLD.status IN ('abandoned', 'published') THEN
            RAISE EXCEPTION 'Invalid change-set transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        v_actor := metadata.current_actor_id(NEW.status_changed_by);
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required for a change-set transition'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        NEW.status_changed_at := clock_timestamp();
        NEW.status_changed_by := v_actor;

        IF NEW.status = 'draft' THEN
            NEW.submitted_at := NULL;
            NEW.submitted_by := NULL;
            NEW.reviewed_at := NULL;
            NEW.reviewed_by := NULL;
            NEW.approved_at := NULL;
            NEW.approved_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejected_by := NULL;
            NEW.rejection_reason := NULL;
            NEW.published_at := NULL;
            NEW.published_by := NULL;
        ELSIF NEW.status = 'in_review' THEN
            NEW.submitted_at := clock_timestamp();
            NEW.submitted_by := v_actor;
        ELSIF NEW.status = 'approved' THEN
            NEW.reviewed_at := coalesce(NEW.reviewed_at, clock_timestamp());
            NEW.reviewed_by := coalesce(NEW.reviewed_by, v_actor);
            NEW.approved_at := clock_timestamp();
            NEW.approved_by := v_actor;
        ELSIF NEW.status = 'rejected' THEN
            IF nullif(btrim(NEW.rejection_reason), '') IS NULL THEN
                RAISE EXCEPTION 'A rejection reason is required'
                    USING ERRCODE = 'not_null_violation';
            END IF;
            NEW.reviewed_at := coalesce(NEW.reviewed_at, clock_timestamp());
            NEW.reviewed_by := coalesce(NEW.reviewed_by, v_actor);
            NEW.rejected_at := clock_timestamp();
            NEW.rejected_by := v_actor;
        ELSIF NEW.status = 'published' THEN
            IF NOT EXISTS (
                SELECT 1 FROM metadata.entity_release
                 WHERE change_set_id = NEW.id
            ) THEN
                RAISE EXCEPTION 'A change set becomes published only through an Entity release'
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END IF;
            NEW.published_at := coalesce(NEW.published_at, clock_timestamp());
            NEW.published_by := coalesce(NEW.published_by, v_actor);
        END IF;
    END IF;

    NEW.lock_version := OLD.lock_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.fn_compute_entity_release_hash(
    p_tenant_id uuid,
    p_entity_id uuid,
    p_change_set_id uuid,
    p_revision_id uuid,
    p_release_no bigint,
    p_version_label text,
    p_release_kind metadata.entity_release_kind_d,
    p_supersedes_release_id uuid,
    p_rollback_of_release_id uuid,
    p_contract_schema_code text,
    p_contract_schema_version text,
    p_contract_hash text,
    p_revision_hash text,
    p_compatibility_level metadata.compatibility_level_d,
    p_target_planes text[],
    p_minimum_runtime_version text,
    p_publication_reason text,
    p_ticket_reference text,
    p_correlation_id uuid,
    p_published_at timestamptz,
    p_published_by uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, metadata
AS $$
    SELECT encode(
        public.digest(
            jsonb_build_object(
                'tenant_id', p_tenant_id,
                'entity_id', p_entity_id,
                'change_set_id', p_change_set_id,
                'revision_id', p_revision_id,
                'release_no', p_release_no,
                'version_label', p_version_label,
                'release_kind', p_release_kind,
                'supersedes_release_id', p_supersedes_release_id,
                'rollback_of_release_id', p_rollback_of_release_id,
                'contract_schema_code', p_contract_schema_code,
                'contract_schema_version', p_contract_schema_version,
                'contract_hash', p_contract_hash,
                'revision_hash', p_revision_hash,
                'compatibility_level', p_compatibility_level,
                'target_planes', p_target_planes,
                'minimum_runtime_version', p_minimum_runtime_version,
                'publication_reason', p_publication_reason,
                'ticket_reference', p_ticket_reference,
                'correlation_id', p_correlation_id,
                'published_at', p_published_at,
                'published_by', p_published_by
            )::text,
            'sha256'
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_release()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, snapshot
AS $$
DECLARE
    v_entity metadata.entity%ROWTYPE;
    v_change_set metadata.entity_change_set%ROWTYPE;
    v_revision snapshot.entity_contract_revision%ROWTYPE;
    v_previous metadata.entity_release%ROWTYPE;
    v_rollback metadata.entity_release%ROWTYPE;
BEGIN
    SELECT * INTO v_entity
      FROM metadata.entity
     WHERE id = NEW.entity_id
     FOR UPDATE;
    IF NOT FOUND OR v_entity.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Release scope must match its Entity scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT * INTO v_change_set
      FROM metadata.entity_change_set
     WHERE id = NEW.change_set_id;
    IF NOT FOUND
       OR v_change_set.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_change_set.entity_id <> NEW.entity_id
       OR v_change_set.status <> 'approved' THEN
        RAISE EXCEPTION 'Release requires an approved change set for the same scoped Entity'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    SELECT * INTO v_revision
      FROM snapshot.entity_contract_revision
     WHERE id = NEW.revision_id;
    IF NOT FOUND
       OR v_revision.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_revision.entity_id <> NEW.entity_id
       OR v_revision.change_set_id <> NEW.change_set_id
       OR v_revision.validation_status <> 'valid' THEN
        RAISE EXCEPTION 'Release requires a valid revision from the approved change set'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    SELECT * INTO v_previous
      FROM metadata.entity_release
     WHERE tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       AND entity_id = NEW.entity_id
     ORDER BY release_no DESC
     LIMIT 1;

    IF NOT FOUND THEN
        IF NEW.release_no <> 1
           OR NEW.supersedes_release_id IS NOT NULL
           OR NEW.release_kind <> 'publish' THEN
            RAISE EXCEPTION 'The first Entity release must be publish release 1 without a predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.release_no <> v_previous.release_no + 1
          OR NEW.supersedes_release_id IS DISTINCT FROM v_previous.id THEN
        RAISE EXCEPTION 'A release must directly supersede the current release head'
            USING ERRCODE = 'serialization_failure';
    END IF;

    IF NEW.release_kind = 'rollback' THEN
        SELECT * INTO v_rollback
          FROM metadata.entity_release
         WHERE id = NEW.rollback_of_release_id;
        IF NOT FOUND
           OR v_rollback.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_rollback.entity_id <> NEW.entity_id
           OR v_rollback.release_no >= NEW.release_no THEN
            RAISE EXCEPTION 'Rollback target must be an earlier release of the same scoped Entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_revision.contract_hash <> v_rollback.contract_hash THEN
            RAISE EXCEPTION 'A rollback revision must reproduce the target release contract'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.release_kind = 'retire'
       AND v_revision.contract_hash <> v_previous.contract_hash THEN
        RAISE EXCEPTION 'A retirement revision must retain the current release contract'
            USING ERRCODE = 'check_violation';
    END IF;

    IF cardinality(NEW.target_planes) <>
       (SELECT count(DISTINCT plane_code)
          FROM unnest(NEW.target_planes) AS plane_code) THEN
        RAISE EXCEPTION 'Target planes must not contain duplicates'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.contract_schema_code := v_revision.contract_schema_code;
    NEW.contract_schema_version := v_revision.contract_schema_version;
    NEW.contract_hash := v_revision.contract_hash;
    NEW.revision_hash := v_revision.revision_hash;
    NEW.compatibility_level := v_revision.compatibility_level;
    NEW.published_at := coalesce(NEW.published_at, clock_timestamp());
    NEW.release_hash := metadata.fn_compute_entity_release_hash(
        NEW.tenant_id,
        NEW.entity_id,
        NEW.change_set_id,
        NEW.revision_id,
        NEW.release_no,
        NEW.version_label,
        NEW.release_kind,
        NEW.supersedes_release_id,
        NEW.rollback_of_release_id,
        NEW.contract_schema_code,
        NEW.contract_schema_version,
        NEW.contract_hash,
        NEW.revision_hash,
        NEW.compatibility_level,
        NEW.target_planes,
        NEW.minimum_runtime_version,
        NEW.publication_reason,
        NEW.ticket_reference,
        NEW.correlation_id,
        NEW.published_at,
        NEW.published_by
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_mark_change_set_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    UPDATE metadata.entity_change_set
       SET status = 'published',
           published_at = NEW.published_at,
           published_by = NEW.published_by,
           status_changed_by = NEW.published_by
     WHERE id = NEW.change_set_id
       AND status = 'approved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Approved change set was not available for publication'
            USING ERRCODE = 'serialization_failure';
    END IF;

    UPDATE metadata.entity
       SET status = CASE
               WHEN NEW.release_kind = 'retire' THEN 'retired'::metadata.entity_status_d
               ELSE 'active'::metadata.entity_status_d
           END,
           status_changed_by = NEW.published_by,
           updated_by = NEW.published_by
     WHERE id = NEW.entity_id
       AND tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       AND status IS DISTINCT FROM CASE
               WHEN NEW.release_kind = 'retire' THEN 'retired'::metadata.entity_status_d
               ELSE 'active'::metadata.entity_status_d
           END;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_reject_entity_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'metadata.entity_release is append-only; create a successor release instead'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION metadata.fn_jsonb_object_has_only_keys(
    p_document jsonb,
    p_allowed_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT p_document IS NOT NULL
       AND jsonb_typeof(p_document) = 'object'
       AND NOT EXISTS (
            SELECT 1
              FROM jsonb_object_keys(p_document) AS document_key
             WHERE NOT (document_key = ANY (p_allowed_keys))
       );
$$;

CREATE OR REPLACE FUNCTION metadata.fn_advance_entity_change_set(
    p_change_set_id uuid,
    p_expected_lock_version bigint,
    p_actor_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_actor uuid;
    v_new_lock_version bigint;
BEGIN
    v_actor := metadata.current_actor_id(p_actor_id);
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required to edit an Entity graph'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE metadata.entity_change_set
       SET lock_version = lock_version + 1,
           updated_by = v_actor
     WHERE id = p_change_set_id
       AND lock_version = p_expected_lock_version
       AND status IN ('draft', 'rejected')
    RETURNING lock_version INTO v_new_lock_version;

    IF v_new_lock_version IS NULL THEN
        IF EXISTS (
            SELECT 1
              FROM metadata.entity_change_set
             WHERE id = p_change_set_id
               AND status NOT IN ('draft', 'rejected')
        ) THEN
            RAISE EXCEPTION 'Entity change set % is not editable', p_change_set_id
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        RAISE EXCEPTION 'Entity change set % has a stale lock version', p_change_set_id
            USING ERRCODE = 'serialization_failure';
    END IF;

    PERFORM set_config(
        'app.entity_change_set_write_token',
        p_change_set_id::text || ':' || v_new_lock_version::text,
        true
    );

    RETURN v_new_lock_version;
END;
$$;

COMMENT ON FUNCTION metadata.fn_advance_entity_change_set(uuid, bigint, uuid) IS
  'Compares and advances a change-set lock exactly once, then issues a transaction-local token required by all normalized graph mutations.';

CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_graph_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_row jsonb;
    v_old jsonb;
    v_change_set_id uuid;
    v_tenant_id uuid;
    v_entity_id uuid;
    v_parent metadata.entity_change_set%ROWTYPE;
    v_token text;
    v_index integer;
    v_key_column text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := to_jsonb(OLD);
    ELSE
        v_row := to_jsonb(NEW);
    END IF;

    v_change_set_id := (v_row ->> 'change_set_id')::uuid;
    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_entity_id := (v_row ->> 'entity_id')::uuid;

    SELECT * INTO v_parent
      FROM metadata.entity_change_set
     WHERE id = v_change_set_id;

    IF NOT FOUND
       OR v_parent.tenant_id IS DISTINCT FROM v_tenant_id
       OR v_parent.entity_id <> v_entity_id THEN
        RAISE EXCEPTION 'Entity graph row scope does not match its change set'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Only draft or rejected Entity change sets may be edited'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    v_token := current_setting('app.entity_change_set_write_token', true);
    IF nullif(v_token, '') IS NULL
       OR split_part(v_token, ':', 1) <> v_change_set_id::text
       OR split_part(v_token, ':', 2) <> v_parent.lock_version::text THEN
        RAISE EXCEPTION 'Advance the expected Entity change-set lock before mutating its graph'
            USING ERRCODE = 'serialization_failure';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        IF ROW(v_row -> 'id', v_row -> 'tenant_id', v_row -> 'entity_id',
               v_row -> 'change_set_id', v_row -> 'created_at', v_row -> 'created_by')
           IS DISTINCT FROM
           ROW(v_old -> 'id', v_old -> 'tenant_id', v_old -> 'entity_id',
               v_old -> 'change_set_id', v_old -> 'created_at', v_old -> 'created_by') THEN
            RAISE EXCEPTION 'Entity graph identity, scope, and creation evidence are immutable'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

        IF TG_NARGS > 0 THEN
            FOR v_index IN 0..TG_NARGS - 1 LOOP
                v_key_column := TG_ARGV[v_index];
                IF v_row -> v_key_column IS DISTINCT FROM v_old -> v_key_column THEN
                    RAISE EXCEPTION 'Entity graph logical coordinate % is immutable', v_key_column
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END LOOP;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_graph_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_row jsonb;
    v_tenant_id uuid;
    v_entity_id uuid;
    v_change_set_id uuid;
    v_parent_tenant uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    v_row := to_jsonb(NEW);
    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_entity_id := (v_row ->> 'entity_id')::uuid;
    v_change_set_id := (v_row ->> 'change_set_id')::uuid;

    IF TG_TABLE_NAME = 'entity_key_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_key AS entity_key
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.entity_field_id
             WHERE entity_key.id = NEW.entity_key_id
               AND entity_key.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_key.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND entity_key.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Key-field binding members must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_search_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_search_profile AS search_profile
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.entity_field_id
             WHERE search_profile.id = NEW.entity_search_profile_id
               AND search_profile.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND search_profile.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND search_profile.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Search-field binding members must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_relation_target' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_relation
             WHERE id = NEW.entity_relation_id
               AND tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_id = v_entity_id
               AND change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Relation target must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        SELECT tenant_id INTO v_parent_tenant
          FROM metadata.entity
         WHERE id = NEW.target_entity_id;
        IF NOT FOUND
           OR (v_tenant_id IS NULL AND v_parent_tenant IS NOT NULL)
           OR (v_tenant_id IS NOT NULL
               AND v_parent_tenant IS NOT NULL
               AND v_parent_tenant <> v_tenant_id) THEN
            RAISE EXCEPTION 'Relation target Entity is not visible in the source Entity scope'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_relation_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_relation_target AS relation_target
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.source_field_id
             WHERE relation_target.id = NEW.entity_relation_target_id
               AND relation_target.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND relation_target.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND relation_target.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Relation field mapping must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_field_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_allowed text[];
    v_rule jsonb;
    v_parameters jsonb;
    v_rule_kind text;
BEGIN
    v_allowed := CASE NEW.data_type::text
        WHEN 'string' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern']
        WHEN 'text' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern']
        WHEN 'integer' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'bigint' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'decimal' THEN ARRAY['kind', 'minimum', 'maximum', 'precision', 'scale']
        WHEN 'boolean' THEN ARRAY['kind']
        WHEN 'uuid' THEN ARRAY['kind']
        WHEN 'date' THEN ARRAY['kind']
        WHEN 'datetime' THEN ARRAY['kind', 'timezone_mode']
        WHEN 'json' THEN ARRAY['kind', 'schema_code']
        WHEN 'enum' THEN ARRAY['kind', 'domain_code']
        WHEN 'reference' THEN ARRAY['kind', 'identifier_type']
        WHEN 'money' THEN ARRAY['kind', 'currency_mode', 'currency_field_key', 'fixed_currency_code', 'scale']
    END;

    IF NOT metadata.fn_jsonb_object_has_only_keys(NEW.type_config, v_allowed) THEN
        RAISE EXCEPTION 'type_config contains properties not allowed for data type %', NEW.data_type
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'enum'
       AND coalesce(NEW.type_config ->> 'domain_code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$' THEN
        RAISE EXCEPTION 'enum type_config requires a canonical domain_code'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'reference'
       AND coalesce(NEW.type_config ->> 'identifier_type', '') NOT IN ('uuid', 'string', 'integer', 'bigint') THEN
        RAISE EXCEPTION 'reference type_config requires a supported identifier_type'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.default_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.default_spec,
            ARRAY['kind', 'value', 'field_key', 'context_key', 'resolver_key', 'apply_on']
        ) OR coalesce(NEW.default_spec ->> 'kind', '') NOT IN (
            'static', 'current_time', 'current_date', 'principal',
            'tenant_context', 'parent_field', 'resolver'
        ) THEN
            RAISE EXCEPTION 'default_spec is not a supported strict default contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF NEW.default_spec ? 'apply_on'
           AND (jsonb_typeof(NEW.default_spec -> 'apply_on') <> 'array'
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(NEW.default_spec -> 'apply_on') AS apply_event
                     WHERE apply_event NOT IN ('create', 'reset')
                )) THEN
            RAISE EXCEPTION 'default_spec.apply_on may contain only create or reset'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.computation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.computation_spec,
            ARRAY['kind', 'language', 'expression', 'handler_key']
        ) OR coalesce(NEW.computation_spec ->> 'kind', '') NOT IN ('expression', 'handler') THEN
            RAISE EXCEPTION 'computation_spec is not a supported strict computation contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF (NEW.computation_spec ->> 'kind' = 'expression'
                AND (coalesce(NEW.computation_spec ->> 'language', '') NOT IN ('cel', 'jsonlogic')
                    OR nullif(btrim(NEW.computation_spec ->> 'expression'), '') IS NULL
                    OR NEW.computation_spec ? 'handler_key'))
           OR (NEW.computation_spec ->> 'kind' = 'handler'
                AND (coalesce(NEW.computation_spec ->> 'handler_key', '') !~ '^[a-z][a-z0-9_.:-]{1,126}$'
                    OR NEW.computation_spec ? 'expression'
                    OR NEW.computation_spec ? 'language')) THEN
            RAISE EXCEPTION 'computation_spec kind and properties are inconsistent'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.validation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.validation_spec,
            ARRAY['schema_version', 'rules']
        ) OR coalesce((NEW.validation_spec ->> 'schema_version')::integer, 0) <> 1
          OR jsonb_typeof(NEW.validation_spec -> 'rules') <> 'array' THEN
            RAISE EXCEPTION 'validation_spec must be a version 1 strict rule collection'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        FOR v_rule IN SELECT value FROM jsonb_array_elements(NEW.validation_spec -> 'rules') LOOP
            IF NOT metadata.fn_jsonb_object_has_only_keys(
                v_rule,
                ARRAY['code', 'kind', 'parameters', 'message_key', 'severity']
            ) THEN
                RAISE EXCEPTION 'validation_spec contains an unsupported rule property'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_rule_kind := v_rule ->> 'kind';
            v_parameters := coalesce(v_rule -> 'parameters', '{}'::jsonb);
            IF coalesce(v_rule ->> 'code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$'
               OR v_rule_kind NOT IN ('length', 'range', 'pattern', 'allowed_values', 'comparison', 'custom_handler')
               OR jsonb_typeof(v_parameters) <> 'object'
               OR coalesce(v_rule ->> 'severity', 'error') NOT IN ('error', 'warning') THEN
                RAISE EXCEPTION 'validation_spec contains an invalid rule contract'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_allowed := CASE v_rule_kind
                WHEN 'length' THEN ARRAY['minimum', 'maximum']
                WHEN 'range' THEN ARRAY['minimum', 'maximum', 'inclusive_minimum', 'inclusive_maximum']
                WHEN 'pattern' THEN ARRAY['pattern', 'flags']
                WHEN 'allowed_values' THEN ARRAY['values']
                WHEN 'comparison' THEN ARRAY['field_key', 'operator']
                WHEN 'custom_handler' THEN ARRAY['handler_key']
            END;
            IF NOT metadata.fn_jsonb_object_has_only_keys(v_parameters, v_allowed) THEN
                RAISE EXCEPTION 'validation rule % contains unsupported parameters', v_rule ->> 'code'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Field specification contains a value with an invalid scalar type'
            USING ERRCODE = 'invalid_parameter_value';
END;
$$;

CREATE OR REPLACE FUNCTION metadata.fn_validate_entity_graph(
    p_change_set_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_profile metadata.entity_runtime_profile%ROWTYPE;
    v_graph_count integer;
    v_problem_path text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM metadata.entity_change_set WHERE id = p_change_set_id) THEN
        RETURN;
    END IF;

    SELECT (
        (SELECT count(*) FROM metadata.entity_runtime_profile WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_field WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_key WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_search_profile WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_relation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_surface WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation_permission WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_surface_operation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation_rule WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_flow WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_policy_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_field_policy_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_contract_test_case WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_lifecycle_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_lifecycle_operation_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_numbering_binding WHERE change_set_id = p_change_set_id)
    ) INTO v_graph_count;

    IF v_graph_count = 0 THEN
        RETURN;
    END IF;

    SELECT * INTO v_profile
      FROM metadata.entity_runtime_profile
     WHERE change_set_id = p_change_set_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ENTITY_RUNTIME_PROFILE_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.default';
    END IF;

    IF v_profile.record_version_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field
             WHERE change_set_id = p_change_set_id
               AND field_key = v_profile.record_version_field_key
               AND data_type IN ('integer', 'bigint')
               AND cardinality = 'one'
               AND value_origin = 'stored'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_RECORD_VERSION_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.record_version_field_key';
    END IF;

    IF v_profile.tenant_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field
             WHERE change_set_id = p_change_set_id
               AND field_key = v_profile.tenant_field_key
               AND data_type = 'uuid'
               AND cardinality = 'one'
               AND value_origin = 'stored'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_TENANT_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.tenant_field_key';
    END IF;

    SELECT lifecycle.binding_key INTO v_problem_path
      FROM metadata.entity_lifecycle_binding AS lifecycle
     WHERE lifecycle.change_set_id = p_change_set_id
       AND lifecycle.status = 'active'
       AND lifecycle.required
       AND NOT EXISTS (
            SELECT 1
              FROM metadata.entity_lifecycle_operation_binding AS operation_binding
             WHERE operation_binding.entity_lifecycle_binding_id = lifecycle.id
               AND operation_binding.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_LIFECYCLE_OPERATION_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'lifecycle.' || v_problem_path;
    END IF;

    SELECT entity_key.key_key INTO v_problem_path
      FROM metadata.entity_key AS entity_key
     WHERE entity_key.change_set_id = p_change_set_id
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_key_field
             WHERE entity_key_id = entity_key.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_KEY_FIELDS_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'keys.' || v_problem_path;
    END IF;

    IF v_profile.backing_kind IN ('table', 'view', 'materialized_view')
       AND v_profile.api_exposure = 'api'
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_key
             WHERE change_set_id = p_change_set_id
               AND key_kind = 'primary'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_PRIMARY_KEY_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'keys';
    END IF;

    SELECT entity_key.key_key INTO v_problem_path
      FROM metadata.entity_key AS entity_key
      JOIN metadata.entity_key_field AS key_field ON key_field.entity_key_id = entity_key.id
      JOIN metadata.entity_field AS entity_field ON entity_field.id = key_field.entity_field_id
     WHERE entity_key.change_set_id = p_change_set_id
       AND entity_key.key_kind = 'primary'
       AND entity_key.status = 'active'
       AND (entity_field.cardinality <> 'one'
            OR entity_field.value_origin <> 'stored'
            OR entity_field.write_mode = 'computed'
            OR entity_field.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_PRIMARY_KEY_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'keys.' || v_problem_path;
    END IF;

    SELECT search_profile.search_key INTO v_problem_path
      FROM metadata.entity_search_profile AS search_profile
     WHERE search_profile.change_set_id = p_change_set_id
       AND search_profile.status = 'active'
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_search_field
             WHERE entity_search_profile_id = search_profile.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SEARCH_FIELDS_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'search.' || v_problem_path;
    END IF;

    SELECT search_profile.search_key INTO v_problem_path
      FROM metadata.entity_search_field AS search_field
      JOIN metadata.entity_search_profile AS search_profile
        ON search_profile.id = search_field.entity_search_profile_id
      JOIN metadata.entity_field AS entity_field ON entity_field.id = search_field.entity_field_id
     WHERE search_profile.change_set_id = p_change_set_id
       AND ((search_field.match_mode IN ('prefix', 'contains', 'full_text')
                AND entity_field.data_type NOT IN ('string', 'text'))
            OR entity_field.cardinality = 'many'
            OR entity_field.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SEARCH_FIELD_MATCH_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'search.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
     WHERE relation.change_set_id = p_change_set_id
       AND (
            (relation.resolution_kind <> 'polymorphic' AND
                (SELECT count(*) FROM metadata.entity_relation_target
                  WHERE entity_relation_id = relation.id) <> 1)
            OR (relation.resolution_kind = 'polymorphic' AND
                (SELECT count(*) FROM metadata.entity_relation_target
                  WHERE entity_relation_id = relation.id) < 2)
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_TARGET_COUNT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
      JOIN metadata.entity_relation_target AS relation_target
        ON relation_target.entity_relation_id = relation.id
     WHERE relation.change_set_id = p_change_set_id
       AND ((relation.resolution_kind <> 'polymorphic'
                AND (relation_target.discriminator_value IS NOT NULL OR NOT relation_target.is_default))
            OR (relation.resolution_kind = 'polymorphic'
                AND NOT relation_target.is_default
                AND relation_target.discriminator_value IS NULL))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_DISCRIMINATOR_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
      JOIN metadata.entity_relation_target AS relation_target
        ON relation_target.entity_relation_id = relation.id
     WHERE relation.change_set_id = p_change_set_id
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_relation_field
             WHERE entity_relation_target_id = relation_target.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_FIELD_MAPPING_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT entity_field.field_key INTO v_problem_path
      FROM metadata.entity_field AS entity_field
     WHERE entity_field.change_set_id = p_change_set_id
       AND entity_field.replacement_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.field_key = entity_field.replacement_field_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_FIELD_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'fields.' || v_problem_path;
    END IF;

    SELECT binding.binding_key INTO v_problem_path
      FROM metadata.entity_surface_field_binding AS binding
      JOIN metadata.entity_field AS entity_field ON entity_field.id = binding.entity_field_id
     WHERE binding.change_set_id = p_change_set_id
       AND binding.status = 'active'
       AND entity_field.status <> 'active'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_FIELD_INACTIVE'
            USING ERRCODE = 'check_violation', DETAIL = 'surfaces.' || v_problem_path;
    END IF;

    SELECT surface_row.surface_key INTO v_problem_path
      FROM metadata.entity_surface AS surface_row
     WHERE surface_row.change_set_id = p_change_set_id
       AND surface_row.replacement_surface_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.surface_key = surface_row.replacement_surface_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'surfaces.' || v_problem_path;
    END IF;

    SELECT operation_row.operation_key INTO v_problem_path
      FROM metadata.entity_operation AS operation_row
     WHERE operation_row.change_set_id = p_change_set_id
       AND operation_row.replacement_operation_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_operation AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.operation_key = operation_row.replacement_operation_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_OPERATION_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'operations.' || v_problem_path;
    END IF;

    SELECT operation_row.operation_key INTO v_problem_path
      FROM metadata.entity_operation AS operation_row
     WHERE operation_row.change_set_id = p_change_set_id
       AND operation_row.status = 'active'
       AND operation_row.permission_code IS NULL
       AND NOT EXISTS (
            SELECT 1
              FROM metadata.entity_operation_permission AS permission_binding
             WHERE permission_binding.entity_operation_id = operation_row.id
               AND permission_binding.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_OPERATION_PERMISSION_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'operations.' || v_problem_path;
    END IF;

    SELECT flow_row.flow_key INTO v_problem_path
      FROM metadata.entity_flow AS flow_row
     WHERE flow_row.change_set_id = p_change_set_id
       AND (NOT EXISTS (SELECT 1 FROM metadata.entity_flow_step WHERE entity_flow_id = flow_row.id)
            OR (flow_row.replacement_flow_key IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM metadata.entity_flow replacement
                 WHERE replacement.change_set_id = p_change_set_id
                   AND replacement.flow_key = flow_row.replacement_flow_key
                   AND replacement.status = 'active')))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_FLOW_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'flows.' || v_problem_path;
    END IF;

    SELECT placement.placement_key INTO v_problem_path
      FROM metadata.entity_surface_operation placement
      JOIN metadata.entity_surface surface_row ON surface_row.id = placement.entity_surface_id
      JOIN metadata.entity_operation operation_row ON operation_row.id = placement.entity_operation_id
     WHERE placement.change_set_id = p_change_set_id
       AND placement.status = 'active'
       AND (surface_row.status <> 'active' OR operation_row.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_OPERATION_INACTIVE_MEMBER'
            USING ERRCODE = 'check_violation', DETAIL = 'surface_operations.' || v_problem_path;
    END IF;

    SELECT binding.binding_key INTO v_problem_path
      FROM metadata.entity_policy_binding binding
      JOIN control.policy_definition policy ON policy.id = binding.policy_definition_id
     WHERE binding.change_set_id = p_change_set_id
       AND binding.status = 'active'
       AND policy.status <> 'active'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_POLICY_BINDING_INACTIVE'
            USING ERRCODE = 'check_violation', DETAIL = 'policy_bindings.' || v_problem_path;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_graph_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM metadata.fn_validate_entity_graph(OLD.change_set_id);
        RETURN OLD;
    END IF;
    PERFORM metadata.fn_validate_entity_graph(NEW.change_set_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_reject_entity_class_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'metadata.entity_class_profile is immutable; install a new seed contract instead'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_surface_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF TG_TABLE_NAME = 'entity_surface_section' THEN
        IF NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface surface_row
             WHERE surface_row.id = NEW.entity_surface_id
               AND surface_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND surface_row.entity_id = NEW.entity_id
               AND surface_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface section must belong to the same scoped surface graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.parent_section_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface_section parent_row
             WHERE parent_row.id = NEW.parent_section_id
               AND parent_row.entity_surface_id = NEW.entity_surface_id
               AND parent_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Parent section must belong to the same surface'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_surface_field_binding' THEN
        IF NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface surface_row
            JOIN metadata.entity_field field_row ON field_row.id = NEW.entity_field_id
             WHERE surface_row.id = NEW.entity_surface_id
               AND surface_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND surface_row.entity_id = NEW.entity_id
               AND surface_row.change_set_id = NEW.change_set_id
               AND field_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND field_row.entity_id = NEW.entity_id
               AND field_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface field binding must reference the same scoped surface and field graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_surface_section_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface_section section_row
             WHERE section_row.id = NEW.entity_surface_section_id
               AND section_row.entity_surface_id = NEW.entity_surface_id
               AND section_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Surface field section must belong to the same surface'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_operation_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_surface_key text;
BEGIN
    FOREACH v_surface_key IN ARRAY ARRAY[NEW.input_surface_key, NEW.confirmation_surface_key, NEW.result_surface_key] LOOP
        IF v_surface_key IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface
             WHERE tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND entity_id = NEW.entity_id
               AND change_set_id = NEW.change_set_id
               AND surface_key = v_surface_key
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Operation surface reference % is not active in this Entity graph', v_surface_key
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_phase4_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, control
AS $$
BEGIN
    IF TG_TABLE_NAME = 'entity_operation_permission' THEN
        IF NOT EXISTS (
            SELECT 1 FROM metadata.entity_operation operation_row
             WHERE operation_row.id = NEW.entity_operation_id
               AND operation_row.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               AND operation_row.entity_id = NEW.entity_id
               AND operation_row.change_set_id = NEW.change_set_id
        ) THEN
            RAISE EXCEPTION 'Operation permission must belong to the same Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_surface_operation' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_surface s JOIN metadata.entity_operation o ON o.id = NEW.entity_operation_id WHERE s.id = NEW.entity_surface_id AND s.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND o.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND s.entity_id = NEW.entity_id AND o.entity_id = NEW.entity_id AND s.change_set_id = NEW.change_set_id AND o.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Surface operation members must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_surface_section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_surface_section x WHERE x.id = NEW.entity_surface_section_id AND x.entity_surface_id = NEW.entity_surface_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Surface operation section must belong to its surface' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.confirmation_surface_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_surface x WHERE x.id = NEW.confirmation_surface_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Confirmation surface must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_operation_rule' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Operation rule must belong to its scoped operation' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_flow' THEN
        IF NEW.entry_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entry_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Flow entry operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.completion_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.completion_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Flow completion operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_flow_step' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_flow f JOIN metadata.entity_surface s ON s.id = NEW.entity_surface_id WHERE f.id = NEW.entity_flow_id AND f.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND s.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND f.entity_id = NEW.entity_id AND s.entity_id = NEW.entity_id AND f.change_set_id = NEW.change_set_id AND s.change_set_id = NEW.change_set_id) THEN
            RAISE EXCEPTION 'Flow step must reference a flow and surface in the same Entity graph' USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_policy_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM control.policy_definition p WHERE p.id = NEW.policy_definition_id AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id)) THEN
            RAISE EXCEPTION 'Policy binding must reference a global or same-tenant policy definition' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Policy operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_field_policy_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM control.policy_definition p WHERE p.id = NEW.policy_definition_id AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id)) THEN RAISE EXCEPTION 'Field policy binding must reference a global or same-tenant policy definition' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Field policy operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_field x WHERE x.id = NEW.entity_field_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Field policy must reference a field in the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    ELSIF TG_TABLE_NAME = 'entity_contract_test_case' THEN
        IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_operation x WHERE x.id = NEW.entity_operation_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Test operation must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF NEW.entity_flow_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM metadata.entity_flow x WHERE x.id = NEW.entity_flow_id AND x.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND x.entity_id = NEW.entity_id AND x.change_set_id = NEW.change_set_id) THEN RAISE EXCEPTION 'Test flow must belong to the same Entity graph' USING ERRCODE = 'foreign_key_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_lifecycle_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$ BEGIN
    IF TG_TABLE_NAME = 'entity_lifecycle_binding' THEN
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_field f WHERE f.id=NEW.entity_field_id
          AND f.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND f.entity_id=NEW.entity_id
          AND f.change_set_id=NEW.change_set_id AND f.status='active' AND f.cardinality <> 'many'
          AND f.data_type IN ('string','enum')) THEN
            RAISE EXCEPTION 'Lifecycle state field must be an active scalar string or enum in the same Entity graph' USING ERRCODE='foreign_key_violation';
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM metadata.entity_lifecycle_binding b JOIN metadata.entity_operation o ON o.id=NEW.entity_operation_id
          WHERE b.id=NEW.entity_lifecycle_binding_id AND b.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
          AND o.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND b.entity_id=NEW.entity_id AND o.entity_id=NEW.entity_id
          AND b.change_set_id=NEW.change_set_id AND o.change_set_id=NEW.change_set_id) THEN
            RAISE EXCEPTION 'Lifecycle operation mapping members must belong to the same Entity graph' USING ERRCODE='foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_numbering_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_field AS field
         WHERE field.id = NEW.entity_field_id
           AND field.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND field.entity_id = NEW.entity_id
           AND field.change_set_id = NEW.change_set_id
           AND field.status = 'active'
           AND field.data_type = 'string'
           AND field.cardinality = 'one'
           AND field.value_origin = 'stored'
           AND field.write_mode = 'write_once'
    ) THEN
        RAISE EXCEPTION 'Numbering target must be an active stored scalar write-once string in the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.entity_operation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM metadata.entity_operation AS operation
         WHERE operation.id = NEW.entity_operation_id
           AND operation.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND operation.entity_id = NEW.entity_id
           AND operation.change_set_id = NEW.change_set_id
           AND operation.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Numbering operation must be active and belong to the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_operation_scope_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_operation operation
         WHERE operation.id = NEW.entity_operation_id
           AND operation.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND operation.entity_id = NEW.entity_id
           AND operation.change_set_id = NEW.change_set_id
    ) THEN
        RAISE EXCEPTION 'Operation scope binding must reference an operation in the same Entity graph'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;
