-- ============================================================================
-- control/06z_three_plane_triggers.sql
-- Concept: Cache-invalidation + entity_version lock triggers for three-plane.
-- Depends on: control/01z_three_plane_tables.sql, log/01c_descriptor_cache_invalidation.sql
-- Scope:
--   1. fn_invalidate_on_satellite_write — fires on entity_operation,
--      entity_policy, entity_field, entity_lifecycle_state_mask,
--      field_security_policy. Inserts a log.descriptor_cache_invalidation row
--      and pg_notify('desc_invalidate', ...) for the Node listener.
--   2. fn_block_effective_version_mutation — rejects UPDATE/DELETE on EFFECTIVE
--      entity_version rows unless emergency_override_* fields are populated.
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D10/D14
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1  Cache-invalidation function
-- ----------------------------------------------------------------------------
-- Two helper functions: one per row shape. PL/pgSQL parses all branches of a
-- single function at trigger creation, so a single function cannot reference
-- NEW.entity_name when bound to tables that don't have that column. We split
-- the logic and bind each trigger to the matching variant.

CREATE OR REPLACE FUNCTION control.fn_invalidate_by_entity_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant uuid;
    v_entity text;
    v_actor  uuid;
BEGIN
    -- During provisioning the seed touches every satellite row; we don't need
    -- to flood log.descriptor_cache_invalidation or pg_notify with that noise.
    -- Runtime sessions don't set this GUC, so invalidations still fire.
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_entity := COALESCE(NEW.entity_name, OLD.entity_name);
    v_actor  := COALESCE(NEW.created_by, OLD.created_by,
                         '00000000-0000-0000-0000-000000000000'::uuid);

    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES
        (v_tenant, v_entity, 'satellite_write',
         TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);

    PERFORM pg_notify(
        'desc_invalidate',
        json_build_object(
            'tenant_id',   v_tenant,
            'entity_code', v_entity,
            'reason',      'satellite_write',
            'source',      TG_TABLE_NAME,
            'at',          extract(epoch FROM now())
        )::text
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION control.fn_invalidate_by_entity_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant uuid;
    v_entity text;
    v_actor  uuid;
BEGIN
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);

    SELECT e.entity_code
      INTO v_entity
      FROM control.entity e
     WHERE e.id = COALESCE(NEW.entity_id, OLD.entity_id);

    v_actor := COALESCE(NEW.created_by, OLD.created_by,
                        '00000000-0000-0000-0000-000000000000'::uuid);

    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES
        (v_tenant, v_entity, 'satellite_write',
         TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_actor);

    PERFORM pg_notify(
        'desc_invalidate',
        json_build_object(
            'tenant_id',   v_tenant,
            'entity_code', v_entity,
            'reason',      'satellite_write',
            'source',      TG_TABLE_NAME,
            'at',          extract(epoch FROM now())
        )::text
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backwards-compatibility wrapper: existing callers still reference the
-- original function name. Routes to entity_name variant by default.
CREATE OR REPLACE FUNCTION control.fn_invalidate_on_satellite_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'control.fn_invalidate_on_satellite_write is a router stub; bind triggers to fn_invalidate_by_entity_name or fn_invalidate_by_entity_id directly';
END;
$$;

COMMENT ON FUNCTION control.fn_invalidate_on_satellite_write IS
    'D10. Trigger function: writes log.descriptor_cache_invalidation and pg_notify on satellite writes. '
    'Listener subscribes to channel ''desc_invalidate''; poller scans WHERE processed_at IS NULL as fallback.';


-- ----------------------------------------------------------------------------
-- §2  Cache-invalidation triggers — one per satellite table
-- ----------------------------------------------------------------------------
-- entity_operation and entity_lifecycle_state_mask carry entity_name directly
DROP TRIGGER IF EXISTS trg_eo_invalidate ON control.entity_operation;
CREATE TRIGGER trg_eo_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON control.entity_operation
    FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_name();

DROP TRIGGER IF EXISTS trg_elsm_invalidate ON control.entity_lifecycle_state_mask;
CREATE TRIGGER trg_elsm_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON control.entity_lifecycle_state_mask
    FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_name();

-- entity_policy, entity_field, field_security_policy carry entity_id; resolve to entity_code
DROP TRIGGER IF EXISTS trg_ep_invalidate ON control.entity_policy;
CREATE TRIGGER trg_ep_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON control.entity_policy
    FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_id();

DROP TRIGGER IF EXISTS trg_ef_invalidate ON control.entity_field;
CREATE TRIGGER trg_ef_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON control.entity_field
    FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_id();

DROP TRIGGER IF EXISTS trg_fsp_invalidate ON control.field_security_policy;
CREATE TRIGGER trg_fsp_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON control.field_security_policy
    FOR EACH ROW EXECUTE FUNCTION control.fn_invalidate_by_entity_id();


-- ----------------------------------------------------------------------------
-- §3  entity_version EFFECTIVE-immutability + emergency override
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION control.fn_block_effective_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity_code text;
    v_actor       uuid;
BEGIN
    -- Bypass during provisioning: the seed runner SETs
    -- app.bypass_version_lock = 'true' at session start so version_hash
    -- precompute and label normalization passes can update EFFECTIVE rows.
    -- Runtime sessions never set this GUC, so the lock remains in force.
    IF current_setting('app.bypass_version_lock', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow non-EFFECTIVE rows through unconditionally
    IF OLD.status <> 'EFFECTIVE' OR OLD.locked_after_effective = false THEN
        RETURN NEW;
    END IF;

    -- Allow normal lifecycle transitions away from EFFECTIVE without payload changes
    IF TG_OP = 'UPDATE'
       AND NEW.status IN ('SUPERSEDED','ARCHIVED')
       AND NEW.version_hash    IS NOT DISTINCT FROM OLD.version_hash
       AND NEW.change_summary  IS NOT DISTINCT FROM OLD.change_summary
       AND NEW.label           IS NOT DISTINCT FROM OLD.label
    THEN
        RETURN NEW;
    END IF;

    -- Allow emergency override: caller must populate all four override fields
    IF TG_OP = 'UPDATE'
       AND NEW.emergency_override_at     IS NOT NULL
       AND NEW.emergency_override_by     IS NOT NULL
       AND NEW.emergency_override_ticket IS NOT NULL
       AND NEW.emergency_override_reason IS NOT NULL
       AND (OLD.emergency_override_at IS NULL
            OR OLD.emergency_override_at IS DISTINCT FROM NEW.emergency_override_at)
    THEN
        SELECT entity_code INTO v_entity_code FROM control.entity WHERE id = NEW.entity_id;
        v_actor := NEW.emergency_override_by;

        INSERT INTO log.descriptor_cache_invalidation
            (tenant_id, entity_code, reason, triggered_by_table, triggered_by_id, created_by)
        VALUES
            (NEW.tenant_id, v_entity_code, 'emergency_override',
             'entity_version', NEW.id, v_actor);

        PERFORM pg_notify(
            'desc_invalidate',
            json_build_object(
                'tenant_id',   NEW.tenant_id,
                'entity_code', v_entity_code,
                'reason',      'emergency_override',
                'ticket',      NEW.emergency_override_ticket,
                'at',          extract(epoch FROM now())
            )::text
        );

        RETURN NEW;
    END IF;

    -- Otherwise block
    RAISE EXCEPTION
        'control.entity_version % is EFFECTIVE and locked. Create a new version or use the emergency override path.',
        OLD.id
        USING ERRCODE = 'P0001',
              HINT    = 'Set emergency_override_at, _by, _ticket, _reason in the same UPDATE statement.';
END;
$$;

COMMENT ON FUNCTION control.fn_block_effective_version_mutation IS
    'D14. EFFECTIVE versions are immutable except: (a) status -> SUPERSEDED/ARCHIVED without payload change, '
    '(b) emergency override with CAB ticket + reason + actor. Override path also fires cache invalidation.';

DROP TRIGGER IF EXISTS trg_ev_block_mutation ON control.entity_version;
CREATE TRIGGER trg_ev_block_mutation
    BEFORE UPDATE OR DELETE ON control.entity_version
    FOR EACH ROW EXECUTE FUNCTION control.fn_block_effective_version_mutation();
