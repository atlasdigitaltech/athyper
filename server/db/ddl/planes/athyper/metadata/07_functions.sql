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
