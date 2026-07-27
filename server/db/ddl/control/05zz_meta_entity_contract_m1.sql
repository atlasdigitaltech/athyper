-- ============================================================================
-- Meta Entity Contract M1: integrity and workflow trigger functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION control.trg_fn_entity_version_contract_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.is_working_copy := NEW.status IN ('DRAFT','IN_REVIEW');

    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('IN_REVIEW','EFFECTIVE','SUPERSEDED')
       AND (
           NEW.contract_schema_version IS DISTINCT FROM OLD.contract_schema_version
           OR NEW.contract_document IS DISTINCT FROM OLD.contract_document
           OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
       )
    THEN
        RAISE EXCEPTION
            'Canonical contract document is immutable while entity version % is %',
            OLD.id, OLD.status
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'DRAFT'
       AND (
           NEW.contract_schema_version IS DISTINCT FROM OLD.contract_schema_version
           OR NEW.contract_document IS DISTINCT FROM OLD.contract_document
           OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
       )
       AND NEW.lock_version <> OLD.lock_version + 1
    THEN
        RAISE EXCEPTION
            'Contract update for entity version % must increment lock_version exactly once',
            OLD.id
            USING ERRCODE = '40001';
    END IF;

    -- Legacy seeds may still create versions before seed 101 has converted
    -- their generic behaviors payload. Once a row participates in canonical
    -- storage, however, it cannot advance without a complete valid document.
    IF NEW.status IN ('IN_REVIEW','APPROVED','EFFECTIVE')
       AND (
           NEW.contract_schema_version IS NOT NULL
           OR NEW.contract_document IS NOT NULL
           OR NEW.contract_hash IS NOT NULL
       )
       AND (
           NEW.contract_document IS NULL
           OR NEW.contract_schema_version IS NULL
           OR NEW.contract_hash IS NULL
           OR NEW.validation_status <> 'VALID'
       )
    THEN
        RAISE EXCEPTION
            'Entity version % cannot enter % without a valid canonical contract',
            NEW.id, NEW.status
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_entity_publish_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity_id uuid;
    v_tenant_id uuid;
    v_status text;
BEGIN
    IF NEW.published_version_id IS NOT NULL THEN
        SELECT entity_id, tenant_id, status
          INTO v_entity_id, v_tenant_id, v_status
          FROM control.entity_version
         WHERE id = NEW.published_version_id;

        IF NOT FOUND
           OR v_entity_id IS DISTINCT FROM NEW.entity_id
           OR v_tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_status <> 'EFFECTIVE'
        THEN
            RAISE EXCEPTION
                'published_version_id must reference an EFFECTIVE version of the same entity and tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.current_draft_version_id IS NOT NULL THEN
        SELECT entity_id, tenant_id, status
          INTO v_entity_id, v_tenant_id, v_status
          FROM control.entity_version
         WHERE id = NEW.current_draft_version_id;

        IF NOT FOUND
           OR v_entity_id IS DISTINCT FROM NEW.entity_id
           OR v_tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_status NOT IN ('DRAFT','IN_REVIEW')
        THEN
            RAISE EXCEPTION
                'current_draft_version_id must reference an open version of the same entity and tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_fn_maintain_entity_publish_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO control.entity_publish_state (
        entity_id, tenant_id, published_version_id, current_draft_version_id,
        latest_version_no, updated_at, updated_by
    )
    VALUES (
        NEW.entity_id,
        NEW.tenant_id,
        CASE WHEN NEW.status = 'EFFECTIVE' THEN NEW.id ELSE NULL END,
        CASE WHEN NEW.status IN ('DRAFT','IN_REVIEW') THEN NEW.id ELSE NULL END,
        NEW.version_no,
        now(),
        COALESCE(NEW.updated_by, NEW.created_by)
    )
    ON CONFLICT (entity_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        published_version_id = CASE
            WHEN NEW.status = 'EFFECTIVE' THEN NEW.id
            ELSE control.entity_publish_state.published_version_id
        END,
        current_draft_version_id = CASE
            WHEN NEW.status IN ('DRAFT','IN_REVIEW') THEN NEW.id
            WHEN control.entity_publish_state.current_draft_version_id = NEW.id THEN NULL
            ELSE control.entity_publish_state.current_draft_version_id
        END,
        latest_version_no = GREATEST(
            control.entity_publish_state.latest_version_no,
            NEW.version_no
        ),
        updated_at = now(),
        updated_by = COALESCE(NEW.updated_by, NEW.created_by);

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_fn_validate_contract_projection_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_version_id uuid;
    v_version_tenant uuid;
    v_version_entity_id uuid;
    v_entity_code text;
    v_parent_tenant uuid;
    v_parent_version uuid;
    v_field_version uuid;
    v_field_tenant uuid;
    v_parent_entity_code text;
    v_field_entity_code text;
    v_section_entity_code text;
    v_relation_field_version uuid;
    v_relation_field_owner text;
BEGIN
    IF TG_TABLE_NAME = 'entity_field_surface' THEN
        SELECT s.entity_version_id, s.tenant_id, f.entity_version_id, f.tenant_id
          INTO v_parent_version, v_parent_tenant, v_field_version, v_field_tenant
          FROM control.entity_surface s
          JOIN control.entity_field f ON f.id = NEW.entity_field_id
         WHERE s.id = NEW.entity_surface_id;

        IF NOT FOUND
           OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant
           OR NEW.tenant_id IS DISTINCT FROM v_field_tenant
        THEN
            RAISE EXCEPTION
                'Surface binding, surface, and field must belong to the same entity version and tenant'
                USING ERRCODE = '23514';
        END IF;
        -- Legacy seed bindings are entity-scoped until seed 101 backfills the
        -- surface version. Version equality becomes mandatory immediately
        -- once the surface is version-owned.
        IF v_parent_version IS NOT NULL
           AND v_parent_version IS DISTINCT FROM v_field_version
        THEN
            RAISE EXCEPTION
                'Version-owned surface and field must belong to the same entity version'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_step' THEN
        SELECT entity_version_id, tenant_id
          INTO v_parent_version, v_parent_tenant
          FROM control.entity_flow WHERE id = NEW.flow_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant THEN
            RAISE EXCEPTION 'Flow step tenant must match its flow' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_section' THEN
        SELECT f.entity_version_id, s.tenant_id
          INTO v_parent_version, v_parent_tenant
          FROM control.entity_flow_step s
          JOIN control.entity_flow f ON f.id = s.flow_id
         WHERE s.id = NEW.flow_step_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant THEN
            RAISE EXCEPTION 'Flow section tenant must match its flow' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_flow_field' THEN
        SELECT fl.entity_version_id, st.tenant_id, ef.entity_version_id, ef.tenant_id,
               flow_entity.entity_code, field_entity.entity_code
          INTO v_parent_version, v_parent_tenant, v_field_version, v_field_tenant,
               v_parent_entity_code, v_field_entity_code
          FROM control.entity_flow_step st
          JOIN control.entity_flow fl ON fl.id = st.flow_id
          JOIN control.entity_version flow_version ON flow_version.id = fl.entity_version_id
          JOIN control.entity flow_entity ON flow_entity.id = flow_version.entity_id
          JOIN control.entity_field ef ON ef.id = NEW.entity_field_id
          JOIN control.entity_version field_version ON field_version.id = ef.entity_version_id
         JOIN control.entity field_entity ON field_entity.id = field_version.entity_id
         WHERE st.id = NEW.flow_step_id;

        v_section_entity_code := NULL;
        IF NEW.section_key IS NOT NULL THEN
            SELECT section.entity_code
              INTO v_section_entity_code
              FROM control.entity_flow_section section
             WHERE section.flow_step_id = NEW.flow_step_id
               AND section.section_key = NEW.section_key
               AND section.tenant_id IS NOT DISTINCT FROM NEW.tenant_id;
        END IF;

        IF NOT FOUND
           OR NEW.tenant_id IS DISTINCT FROM v_parent_tenant
           OR NEW.tenant_id IS DISTINCT FROM v_field_tenant
           OR (
                (
                    v_section_entity_code IS NULL
                    OR v_section_entity_code = v_parent_entity_code
                )
                AND v_parent_version IS DISTINCT FROM v_field_version
           )
           OR (
                v_section_entity_code IS NOT NULL
                AND v_section_entity_code <> v_parent_entity_code
                AND v_field_entity_code IS DISTINCT FROM v_section_entity_code
           )
        THEN
            RAISE EXCEPTION
                'Flow field % (% version %), step %, flow % version %, binding tenant %, flow tenant %, field tenant % must share version and tenant',
                NEW.entity_field_id,
                v_field_entity_code,
                v_field_version,
                NEW.flow_step_id,
                v_parent_entity_code,
                v_parent_version,
                NEW.tenant_id,
                v_parent_tenant,
                v_field_tenant
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'entity_relation' AND NEW.entity_version_id IS NOT NULL THEN
        SELECT ev.tenant_id, ev.entity_id
          INTO v_version_tenant, v_version_entity_id
          FROM control.entity_version ev
         WHERE ev.id = NEW.entity_version_id;
        IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_version_tenant THEN
            RAISE EXCEPTION 'Relation tenant must match its entity version' USING ERRCODE = '23514';
        END IF;
        -- A belongs_to or array_fk field is stored on this entity version. A
        -- normal has_many FK is stored on the target/child entity version.
        -- Keep this aligned with metadata-graph-validator; otherwise valid
        -- parent collections such as purchase_order.lines
        -- (commitment_line.commitment_id) are rejected.
        v_relation_field_version := NEW.entity_version_id;
        v_relation_field_owner := 'source';
        IF NEW.relation_kind = 'has_many'
           AND NEW.resolution_kind IS DISTINCT FROM 'array_fk'
           AND COALESCE(NEW.fk_field, NEW.source_field) IS NOT NULL
        THEN
            SELECT target_version.id
              INTO v_relation_field_version
              FROM control.entity target
              JOIN control.entity_version target_version
                ON target_version.entity_id = target.id
               AND target_version.status = 'EFFECTIVE'
             WHERE (
                    target.entity_code = COALESCE(NEW.target_entity_code, NEW.target_entity)
                 OR target.name = COALESCE(NEW.target_entity_code, NEW.target_entity)
                 OR target.table_name = COALESCE(NEW.target_entity_code, NEW.target_entity)
             )
               AND (
                    target.tenant_id IS NULL
                 OR target.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
               )
             ORDER BY
               (target.tenant_id IS NOT DISTINCT FROM NEW.tenant_id) DESC,
               target_version.version_no DESC
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Relation target entity % has no EFFECTIVE version',
                    COALESCE(NEW.target_entity_code, NEW.target_entity)
                    USING ERRCODE = '23503';
            END IF;
            v_relation_field_owner := 'target';
        END IF;

        -- During legacy conversion some registered physical columns have not
        -- yet been projected into entity_field. Accept that bounded physical
        -- backing as compatibility evidence; a field absent from both the
        -- selected version and its registered table still fails closed.
        -- Legacy repair seeds update fk_field. Prefer it over a source_field
        -- value backfilled by an earlier v2 conversion; the projector writes
        -- both columns identically for canonical rows.
        IF COALESCE(NEW.fk_field, NEW.source_field) IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM control.entity_field f
                WHERE f.entity_version_id = v_relation_field_version
                  AND f.name = COALESCE(NEW.fk_field, NEW.source_field)
           )
           AND NOT EXISTS (
               SELECT 1
                 FROM control.entity_version physical_version
                 JOIN control.entity physical_entity
                   ON physical_entity.id = physical_version.entity_id
                 JOIN information_schema.columns physical_column
                  ON physical_column.table_schema = physical_entity.table_schema
                  AND physical_column.table_name = physical_entity.table_name
                  AND physical_column.column_name =
                      COALESCE(NEW.fk_field, NEW.source_field)
                WHERE physical_version.id = v_relation_field_version
           )
        THEN
            RAISE EXCEPTION
                'Relation % field % does not belong to entity version %',
                v_relation_field_owner,
                COALESCE(NEW.fk_field, NEW.source_field),
                v_relation_field_version
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM control.entity target
             WHERE target.entity_code = COALESCE(NEW.target_entity_code, NEW.target_entity)
                OR target.name = COALESCE(NEW.target_entity_code, NEW.target_entity)
                OR target.table_name = COALESCE(NEW.target_entity_code, NEW.target_entity)
        ) THEN
            RAISE EXCEPTION
                'Relation target entity % is not registered',
                COALESCE(NEW.target_entity_code, NEW.target_entity)
                USING ERRCODE = '23503';
        END IF;
        RETURN NEW;
    END IF;

    v_version_id := CASE TG_TABLE_NAME
        WHEN 'entity_surface' THEN NEW.entity_version_id
        WHEN 'entity_operation' THEN NEW.entity_version_id
        WHEN 'entity_policy' THEN NEW.entity_version_id
        WHEN 'entity_numbering_config' THEN NEW.entity_version_id
        WHEN 'entity_lifecycle' THEN NEW.entity_version_id
        WHEN 'entity_lifecycle_state_mask' THEN NEW.entity_version_id
        WHEN 'entity_action_rule' THEN NEW.entity_version_id
        WHEN 'entity_flow' THEN NEW.entity_version_id
        ELSE NULL
    END;

    IF v_version_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT ev.tenant_id, ev.entity_id, e.entity_code
      INTO v_version_tenant, v_version_entity_id, v_entity_code
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ev.id = v_version_id;

    IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM v_version_tenant THEN
        RAISE EXCEPTION
            '% must use the tenant of its entity version', TG_TABLE_NAME
            USING ERRCODE = '23514';
    END IF;

    -- NEW is a polymorphic trigger record. Never reference a table-specific
    -- member in the same SQL expression that checks TG_TABLE_NAME: PostgreSQL
    -- may resolve the missing member before boolean short-circuiting.
    IF TG_TABLE_NAME IN ('entity_surface','entity_policy','entity_numbering_config') THEN
        IF NEW.entity_id IS DISTINCT FROM v_version_entity_id THEN
            RAISE EXCEPTION
                '% entity_id must match its entity version', TG_TABLE_NAME
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME IN ('entity_operation','entity_lifecycle') THEN
        IF NEW.entity_name IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                '% entity_name must match its entity version', TG_TABLE_NAME
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'entity_lifecycle_state_mask' THEN
        IF NEW.entity_name IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                'Lifecycle state mask entity_name must match its entity version'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.lifecycle_state_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM control.lifecycle_state state
                 JOIN control.entity_lifecycle binding
                   ON binding.lifecycle_id = state.lifecycle_id
                  AND binding.entity_version_id = NEW.entity_version_id
                  AND binding.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
                WHERE state.id = NEW.lifecycle_state_id
                  AND state.code = NEW.record_status
           )
        THEN
            RAISE EXCEPTION
                'Lifecycle state mask must reference a state bound to the same entity version and status'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'entity_action_rule' THEN
        IF NEW.entity_code IS DISTINCT FROM v_entity_code THEN
            RAISE EXCEPTION
                'Action rule entity_code must match its entity version'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
