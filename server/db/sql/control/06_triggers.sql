-- ============================================================================
-- control/06_triggers.sql
-- Concept: Governance Triggers — lifecycle, workflow, lookup, and policy automation triggers
-- Depends on: 04_tables/002_control.sql, 08_functions/002_control.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================

-- lookup_domain
DROP TRIGGER IF EXISTS trg_lookup_domain_updated_at ON control.lookup_domain;
CREATE TRIGGER trg_lookup_domain_updated_at BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lookup_domain_status_changed ON control.lookup_domain;
CREATE TRIGGER trg_lookup_domain_status_changed BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- lookup_value
DROP TRIGGER IF EXISTS trg_lookup_value_updated_at ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_updated_at BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lookup_value_status_changed ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_status_changed BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- lookup_value extensibility guard — tenant rows only into is_extensible=true domains
DROP TRIGGER IF EXISTS trg_lookup_value_extensibility ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_extensibility BEFORE INSERT OR UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_extensibility();


-- mfa_config
DROP TRIGGER IF EXISTS trg_mfa_config_updated_at ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_updated_at BEFORE UPDATE ON control.mfa_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- mfa_config: validate contact_link channel type and principal ownership
DROP TRIGGER IF EXISTS trg_mfa_config_contact_link_guard ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_contact_link_guard
    BEFORE INSERT OR UPDATE OF contact_link_id, method_type, principal_id, tenant_id
    ON control.mfa_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mfa_contact_link();

-- mfa_config.method_type — lookup validation (replaces session-dependent CHECK)
DROP TRIGGER IF EXISTS trg_mfa_config_method_type_lookup ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_method_type_lookup
    BEFORE INSERT OR UPDATE OF method_type ON control.mfa_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.mfa_method_type', 'method_type');


-- ============================================================================
-- NOTIFICATION CONFIG TABLES
-- ============================================================================

-- —— A. UPDATED_AT STAMPS ————————————————————————————————————————————————

DROP TRIGGER IF EXISTS trg_nprov_updated_at ON control.notification_provider;
CREATE TRIGGER trg_nprov_updated_at
    BEFORE UPDATE ON control.notification_provider
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_nrr_updated_at ON control.notification_routing_rule;
CREATE TRIGGER trg_nrr_updated_at
    BEFORE UPDATE ON control.notification_routing_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ntmpl_updated_at ON control.notification_template;
CREATE TRIGGER trg_ntmpl_updated_at
    BEFORE UPDATE ON control.notification_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- —— B. LOOKUP VALIDATION ————————————————————————————————————————————————

-- notification_provider.channel
DROP TRIGGER IF EXISTS trg_nprov_channel_lookup ON control.notification_provider;
CREATE TRIGGER trg_nprov_channel_lookup
    BEFORE INSERT OR UPDATE OF channel ON control.notification_provider
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.channel', 'channel');

-- notification_template.channel
DROP TRIGGER IF EXISTS trg_ntmpl_channel_lookup ON control.notification_template;
CREATE TRIGGER trg_ntmpl_channel_lookup
    BEFORE INSERT OR UPDATE OF channel ON control.notification_template
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.channel', 'channel');

-- notification_routing_rule.priority
DROP TRIGGER IF EXISTS trg_nrr_priority_lookup ON control.notification_routing_rule;
CREATE TRIGGER trg_nrr_priority_lookup
    BEFORE INSERT OR UPDATE OF priority ON control.notification_routing_rule
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.priority', 'priority');


-- —— C. ROUTING_RULE CHANNELS[] ARRAY VALIDATION —————————————————————————
-- control.trg_validate_lookup_columns handles scalar text columns only.
-- For text[] we use a dedicated trigger function that iterates the array.

CREATE OR REPLACE FUNCTION control.trg_validate_notification_channels_array()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = control
AS $$
DECLARE
    v_ch text;
BEGIN
    IF NEW.channels IS NOT NULL THEN
        FOREACH v_ch IN ARRAY NEW.channels LOOP
            IF NOT control.fn_valid_lookup('notification.channel', v_ch) THEN
                RAISE EXCEPTION
                    'control.notification_routing_rule.channels: invalid channel code "%". '
                    'Must be a valid notification.channel lookup value.',
                    v_ch
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_validate_notification_channels_array() IS
    'Validates each element of notification_routing_rule.channels[] against '
    'control.lookup_domain notification.channel. '
    'Iterates the array because control.trg_validate_lookup_columns handles scalar only.';

DROP TRIGGER IF EXISTS trg_nrr_channels_array_lookup ON control.notification_routing_rule;
CREATE TRIGGER trg_nrr_channels_array_lookup
    BEFORE INSERT OR UPDATE OF channels ON control.notification_routing_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_notification_channels_array();


-- ── LIFECYCLE ENGINE triggers ──────────────────────────────────────────
-- =============================================================================
-- 09_triggers/014_lifecycle.sql
-- Lifecycle Engine — trigger functions and triggers for all 13 tables
-- Depends on: 04_tables/014_lifecycle.sql, 08_functions/001_shared.sql
-- =============================================================================


-- =============================================================================
-- A. updated_at stamps
-- =============================================================================
DROP TRIGGER IF EXISTS trg_lc_updated_at  ON control.lifecycle;
CREATE TRIGGER trg_lc_updated_at  BEFORE UPDATE ON control.lifecycle
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ls_updated_at  ON control.lifecycle_state;
CREATE TRIGGER trg_ls_updated_at  BEFORE UPDATE ON control.lifecycle_state
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ltp_updated_at ON control.lifecycle_timer_policy;
CREATE TRIGGER trg_ltp_updated_at BEFORE UPDATE ON control.lifecycle_timer_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lt_updated_at ON control.lifecycle_transition;
CREATE TRIGGER trg_lt_updated_at BEFORE UPDATE ON control.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ltg_updated_at ON control.lifecycle_transition_gate;
CREATE TRIGGER trg_ltg_updated_at BEFORE UPDATE ON control.lifecycle_transition_gate
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lth_updated_at ON control.lifecycle_transition_hook;
CREATE TRIGGER trg_lth_updated_at BEFORE UPDATE ON control.lifecycle_transition_hook
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lho_updated_at ON control.lifecycle_hook_override;
CREATE TRIGGER trg_lho_updated_at BEFORE UPDATE ON control.lifecycle_hook_override
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_har_updated_at ON control.hook_action_registry;
CREATE TRIGGER trg_har_updated_at BEFORE UPDATE ON control.hook_action_registry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lts_updated_at ON event.lifecycle_timer_schedule;
CREATE TRIGGER trg_lts_updated_at BEFORE UPDATE ON event.lifecycle_timer_schedule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sr_updated_at  ON snapshot.status_route;
CREATE TRIGGER trg_sr_updated_at  BEFORE UPDATE ON snapshot.status_route
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- B. lifecycle_version IMMUTABILITY guard
-- =============================================================================
-- snapshot.lifecycle_version is append-only — no UPDATE or DELETE.

CREATE OR REPLACE FUNCTION snapshot.trg_lifecycle_version_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = snapshot AS $$
BEGIN
    RAISE EXCEPTION
        'snapshot.lifecycle_version is append-only. '
        'DELETE and UPDATE are not permitted. '
        'Create a new version instead by recompiling the lifecycle.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

DROP TRIGGER IF EXISTS trg_lv_immutable ON snapshot.lifecycle_version;
CREATE TRIGGER trg_lv_immutable
    BEFORE UPDATE OR DELETE ON snapshot.lifecycle_version
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_lifecycle_version_immutable();


-- =============================================================================
-- C. L18: cross-lifecycle state guard on lifecycle_transition
-- =============================================================================
-- Ensures from_state_id and to_state_id both belong to the same lifecycle_id
-- as the transition row. Prevents wiring states from different lifecycles.

CREATE OR REPLACE FUNCTION control.trg_lt_cross_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_from_lc uuid;
    v_to_lc   uuid;
BEGIN
    SELECT lifecycle_id INTO v_from_lc
      FROM control.lifecycle_state WHERE id = NEW.from_state_id;
    SELECT lifecycle_id INTO v_to_lc
      FROM control.lifecycle_state WHERE id = NEW.to_state_id;

    IF v_from_lc IS DISTINCT FROM NEW.lifecycle_id THEN
        RAISE EXCEPTION
            'control.lifecycle_transition: from_state_id % belongs to lifecycle %, '
            'not to transition lifecycle_id %.',
            NEW.from_state_id, v_from_lc, NEW.lifecycle_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_to_lc IS DISTINCT FROM NEW.lifecycle_id THEN
        RAISE EXCEPTION
            'control.lifecycle_transition: to_state_id % belongs to lifecycle %, '
            'not to transition lifecycle_id %.',
            NEW.to_state_id, v_to_lc, NEW.lifecycle_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_lt_cross_lifecycle_guard() IS
    'L18 fix: ensures from_state_id and to_state_id both belong to '
    'the same lifecycle_id as the transition. Prevents cross-lifecycle wiring.';

DROP TRIGGER IF EXISTS trg_lt_cross_lifecycle_guard ON control.lifecycle_transition;
CREATE TRIGGER trg_lt_cross_lifecycle_guard
    BEFORE INSERT OR UPDATE OF from_state_id, to_state_id, lifecycle_id
    ON control.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION control.trg_lt_cross_lifecycle_guard();


-- =============================================================================
-- D. L10: required safety_level guard on lifecycle_hook_override
-- =============================================================================
-- Prevents creating an override for a hook with safety_level='required'.

CREATE OR REPLACE FUNCTION control.trg_lho_safety_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_safety text;
BEGIN
    SELECT safety_level INTO v_safety
      FROM control.lifecycle_transition_hook
     WHERE id = NEW.target_hook_id;

    IF v_safety = 'required' THEN
        RAISE EXCEPTION
            'control.lifecycle_hook_override: cannot override hook % because '
            'its safety_level is ''required''. Required hooks cannot be '
            'suppressed, replaced, or augmented by tenant overrides.',
            NEW.target_hook_id
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_lho_safety_guard() IS
    'L10 fix: blocks creation of overrides targeting hooks with safety_level=''required''. '
    'Required hooks (compliance-critical) cannot be suppressed or replaced.';

DROP TRIGGER IF EXISTS trg_lho_safety_guard ON control.lifecycle_hook_override;
CREATE TRIGGER trg_lho_safety_guard
    BEFORE INSERT OR UPDATE OF target_hook_id ON control.lifecycle_hook_override
    FOR EACH ROW EXECUTE FUNCTION control.trg_lho_safety_guard();


-- =============================================================================
-- E2. R3: action registry guard on lifecycle_hook_override.replacement_action
-- =============================================================================
-- Validates that override.replacement_action exists in hook_action_registry.
-- Trigger (not FK) because validation is existence + is_active + tenant-scope
-- combined — a plain FK can only enforce existence on a single unique column.
-- Skips 'suppress' overrides where replacement_action IS NULL (guaranteed by
-- lho_replacement_chk CHECK constraint on the table).

CREATE OR REPLACE FUNCTION control.trg_lho_action_registry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
BEGIN
    -- suppress overrides have NULL replacement_action — nothing to validate.
    IF NEW.override_kind = 'suppress' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM control.hook_action_registry
        WHERE action_key = NEW.replacement_action
          AND is_active   = true
          AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
    ) THEN
        RAISE EXCEPTION
            'control.lifecycle_hook_override: replacement_action ''%'' is not '
            'registered in control.hook_action_registry or is inactive. '
            'Register the action before creating an override.',
            NEW.replacement_action
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_lho_action_registry_guard() IS
    'R3: validates lifecycle_hook_override.replacement_action against '
    'hook_action_registry (existence + is_active + tenant scope). '
    'Mirrors trg_lth_action_registry_guard on lifecycle_transition_hook. '
    'suppress overrides (replacement_action IS NULL) are skipped.';

DROP TRIGGER IF EXISTS trg_lho_action_registry_guard ON control.lifecycle_hook_override;
CREATE TRIGGER trg_lho_action_registry_guard
    BEFORE INSERT OR UPDATE OF replacement_action, override_kind
    ON control.lifecycle_hook_override
    FOR EACH ROW EXECUTE FUNCTION control.trg_lho_action_registry_guard();


-- =============================================================================
-- E. hook action registry guard on lifecycle_transition_hook
-- =============================================================================
-- Validates that hook.action exists in control.hook_action_registry.

CREATE OR REPLACE FUNCTION control.trg_lth_action_registry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM control.hook_action_registry
        WHERE action_key = NEW.action AND is_active = true
          AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
    ) THEN
        RAISE EXCEPTION
            'control.lifecycle_transition_hook: action ''%'' is not registered '
            'in control.hook_action_registry or is inactive.',
            NEW.action
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.trg_lth_action_registry_guard() IS
    'Validates lifecycle_transition_hook.action against hook_action_registry. '
    'Only active, registered action keys (platform or tenant) are accepted.';

DROP TRIGGER IF EXISTS trg_lth_action_registry_guard ON control.lifecycle_transition_hook;
CREATE TRIGGER trg_lth_action_registry_guard
    BEFORE INSERT OR UPDATE OF action ON control.lifecycle_transition_hook
    FOR EACH ROW EXECUTE FUNCTION control.trg_lth_action_registry_guard();


-- =============================================================================
-- F. child-changed invalidation trigger
-- =============================================================================
-- Nulls definition_hash on parent lifecycle when child tables change.
-- Signals that snapshot.lifecycle_version needs recompile.

CREATE OR REPLACE FUNCTION control.trg_lifecycle_child_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_lifecycle_id uuid;
BEGIN
    -- Use IF-ELSIF rather than CASE so each branch only accesses fields that
    -- exist on the specific table's NEW/OLD record (lazy evaluation guarantee).
    IF TG_TABLE_NAME IN ('lifecycle_state', 'lifecycle_transition') THEN
        v_lifecycle_id := COALESCE(NEW.lifecycle_id, OLD.lifecycle_id);
    ELSIF TG_TABLE_NAME = 'lifecycle_transition_gate' THEN
        SELECT lifecycle_id INTO v_lifecycle_id FROM control.lifecycle_transition
        WHERE id = COALESCE(NEW.transition_id, OLD.transition_id);
    ELSIF TG_TABLE_NAME = 'lifecycle_transition_hook' THEN
        SELECT lt.lifecycle_id INTO v_lifecycle_id FROM control.lifecycle_transition lt
        WHERE lt.id = COALESCE(NEW.transition_id, OLD.transition_id);
    END IF;

    IF v_lifecycle_id IS NOT NULL THEN
        UPDATE control.lifecycle
           SET definition_hash = NULL,
               updated_at      = now()
         WHERE id = v_lifecycle_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION control.trg_lifecycle_child_changed() IS
    'Nulls lifecycle.definition_hash when any child table changes '
    '(state, transition, gate, hook). Signals stale compiled snapshots. '
    'Works across lifecycle_state, lifecycle_transition, '
    'lifecycle_transition_gate, lifecycle_transition_hook.';

-- Attach to all child tables
DROP TRIGGER IF EXISTS trg_ls_child_changed  ON control.lifecycle_state;
DROP TRIGGER IF EXISTS trg_lt_child_changed  ON control.lifecycle_transition;
DROP TRIGGER IF EXISTS trg_ltg_child_changed ON control.lifecycle_transition_gate;
DROP TRIGGER IF EXISTS trg_lth_child_changed ON control.lifecycle_transition_hook;

CREATE TRIGGER trg_ls_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.lifecycle_state
    FOR EACH ROW EXECUTE FUNCTION control.trg_lifecycle_child_changed();

CREATE TRIGGER trg_lt_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION control.trg_lifecycle_child_changed();

CREATE TRIGGER trg_ltg_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.lifecycle_transition_gate
    FOR EACH ROW EXECUTE FUNCTION control.trg_lifecycle_child_changed();

CREATE TRIGGER trg_lth_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.lifecycle_transition_hook
    FOR EACH ROW EXECUTE FUNCTION control.trg_lifecycle_child_changed();


-- =============================================================================
-- G. single initial state enforcement
-- =============================================================================
-- Enforces exactly one is_initial=true state per lifecycle.
-- Handled by partial UNIQUE index ls_single_initial_uidx in 07_indexes/014_lifecycle.sql:
--   CREATE UNIQUE INDEX ls_single_initial_uidx
--       ON control.lifecycle_state (lifecycle_id) WHERE is_initial = true;
-- No additional trigger needed — the UNIQUE filtered index is sufficient.


-- ── WORKFLOW ENGINE triggers ───────────────────────────────────────────
-- =============================================================================
-- 09_triggers/015_workflow.sql
-- Workflow Engine — trigger functions and triggers for all 8 tables
-- Depends on: 04_tables/015_workflow.sql, 08_functions/001_shared.sql,
--             900_seed_data/015_workflow/001_lookup_domains.sql (lookup values)
-- =============================================================================


-- =============================================================================
-- A. updated_at stamps
-- =============================================================================
DROP TRIGGER IF EXISTS trg_wdef_updated_at ON control.workflow_definition;
CREATE TRIGGER trg_wdef_updated_at BEFORE UPDATE ON control.workflow_definition
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wtpl_updated_at ON control.workflow_template;
CREATE TRIGGER trg_wtpl_updated_at BEFORE UPDATE ON control.workflow_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wts_updated_at ON control.workflow_template_stage;
CREATE TRIGGER trg_wts_updated_at BEFORE UPDATE ON control.workflow_template_stage
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wsla_updated_at ON control.workflow_sla_policy;
CREATE TRIGGER trg_wsla_updated_at BEFORE UPDATE ON control.workflow_sla_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wtr_updated_at ON control.workflow_template_rule;
CREATE TRIGGER trg_wtr_updated_at BEFORE UPDATE ON control.workflow_template_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wreq_updated_at ON document.workflow_request;
CREATE TRIGGER trg_wreq_updated_at BEFORE UPDATE ON document.workflow_request
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wstg_updated_at ON document.workflow_stage;
CREATE TRIGGER trg_wstg_updated_at BEFORE UPDATE ON document.workflow_stage
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wi_updated_at ON event.work_item;
CREATE TRIGGER trg_wi_updated_at BEFORE UPDATE ON event.work_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- B. Lookup validation triggers
-- =============================================================================

-- work_item.task_type
DROP TRIGGER IF EXISTS trg_wi_task_type_lookup ON event.work_item;
CREATE TRIGGER trg_wi_task_type_lookup
    BEFORE INSERT OR UPDATE OF task_type ON event.work_item
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('work_item.task_type', 'task_type');

-- work_request.workflow_type on workflow_request
DROP TRIGGER IF EXISTS trg_wreq_workflow_type_lookup ON document.workflow_request;
CREATE TRIGGER trg_wreq_workflow_type_lookup
    BEFORE INSERT OR UPDATE OF workflow_type ON document.workflow_request
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('work_request.workflow_type', 'workflow_type');


-- =============================================================================
-- C. A10: template child-changed — null compiled_hash
-- =============================================================================
CREATE OR REPLACE FUNCTION control.trg_template_child_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_template_id uuid;
BEGIN
    v_template_id := CASE TG_TABLE_NAME
        WHEN 'workflow_template_stage' THEN COALESCE(NEW.workflow_template_id, OLD.workflow_template_id)
        WHEN 'workflow_template_rule'  THEN COALESCE(NEW.workflow_template_id, OLD.workflow_template_id)
        ELSE NULL
    END;

    IF v_template_id IS NOT NULL THEN
        UPDATE control.workflow_template
           SET compiled_hash = NULL,
               updated_at    = now()
         WHERE id = v_template_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION control.trg_template_child_changed() IS
    'A10 fix: nulls workflow_template.compiled_hash when a stage or rule changes. '
    'Signals that workflow_request creation must recompile the template snapshot.';

DROP TRIGGER IF EXISTS trg_wts_child_changed ON control.workflow_template_stage;
CREATE TRIGGER trg_wts_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.workflow_template_stage
    FOR EACH ROW EXECUTE FUNCTION control.trg_template_child_changed();

DROP TRIGGER IF EXISTS trg_wtr_child_changed ON control.workflow_template_rule;
CREATE TRIGGER trg_wtr_child_changed
    AFTER INSERT OR UPDATE OR DELETE ON control.workflow_template_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_template_child_changed();


-- =============================================================================
-- D. A07: work_item designated_id immutability guard
-- =============================================================================
CREATE OR REPLACE FUNCTION event.trg_wi_designation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = event AS $$
BEGIN
    IF OLD.designated_id IS DISTINCT FROM NEW.designated_id
    OR OLD.designated_group_id IS DISTINCT FROM NEW.designated_group_id
    THEN
        RAISE EXCEPTION
            'event.work_item: designated_id and designated_group_id are immutable '
            'after creation. They record the original assignment. '
            'To reassign, update assignee_id instead.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION event.trg_wi_designation_guard() IS
    'A07 fix: designated_id and designated_group_id are immutable after INSERT. '
    'Original assignment is preserved for audit trail. '
    'Reassignments update assignee_id only.';

DROP TRIGGER IF EXISTS trg_wi_designation_guard ON event.work_item;
CREATE TRIGGER trg_wi_designation_guard
    BEFORE UPDATE OF designated_id, designated_group_id ON event.work_item
    FOR EACH ROW EXECUTE FUNCTION event.trg_wi_designation_guard();


-- =============================================================================
-- E. Decision validation against task_type metadata
-- =============================================================================
CREATE OR REPLACE FUNCTION event.trg_wi_decision_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = event AS $$
DECLARE
    v_meta        jsonb;
    v_valid       text[];
BEGIN
    -- Only validate when decision is being set
    IF NEW.decision IS NULL THEN
        RETURN NEW;
    END IF;

    -- Read valid_decisions from lookup metadata
    SELECT lv.metadata INTO v_meta
      FROM control.lookup_value lv
     WHERE lv.domain_code = 'work_item.task_type'
       AND lv.code        = NEW.task_type
       AND lv.tenant_id IS NULL
       AND lv.status = 'active';

    IF v_meta IS NULL THEN
        -- Unknown task_type — let lookup trigger handle it
        RETURN NEW;
    END IF;

    -- Build valid decisions array from metadata
    SELECT array_agg(d::text)
      INTO v_valid
      FROM jsonb_array_elements_text(v_meta->'valid_decisions') d;

    IF v_valid IS NOT NULL AND NOT (NEW.decision = ANY(v_valid)) THEN
        RAISE EXCEPTION
            'event.work_item: decision "%" is not valid for task_type "%". '
            'Valid decisions for this task type: %.',
            NEW.decision, NEW.task_type, array_to_string(v_valid, ', ')
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION event.trg_wi_decision_guard() IS
    'Validates work_item.decision against the valid_decisions array '
    'in the task_type lookup_value.metadata. '
    'approval — approve|reject|escalate. '
    'review — acknowledge|flag|escalate. '
    'watcher — read.';

DROP TRIGGER IF EXISTS trg_wi_decision_guard ON event.work_item;
CREATE TRIGGER trg_wi_decision_guard
    BEFORE INSERT OR UPDATE OF decision ON event.work_item
    FOR EACH ROW EXECUTE FUNCTION event.trg_wi_decision_guard();

-- ─── A. updated_at stamps ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_entity_updated_at ON control.entity;
CREATE TRIGGER trg_entity_updated_at BEFORE UPDATE ON control.entity
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ev_updated_at ON control.entity_version;
CREATE TRIGGER trg_ev_updated_at BEFORE UPDATE ON control.entity_version
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ef_updated_at ON control.entity_field;
CREATE TRIGGER trg_ef_updated_at BEFORE UPDATE ON control.entity_field
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ov_updated_at ON control.overlay;
CREATE TRIGGER trg_ov_updated_at BEFORE UPDATE ON control.overlay
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_eo_updated_at ON control.entity_operation;
CREATE TRIGGER trg_eo_updated_at BEFORE UPDATE ON control.entity_operation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ep_updated_at ON control.entity_policy;
CREATE TRIGGER trg_ep_updated_at BEFORE UPDATE ON control.entity_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_el_updated_at ON control.entity_lifecycle;
CREATE TRIGGER trg_el_updated_at BEFORE UPDATE ON control.entity_lifecycle
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_er_updated_at ON control.entity_relation;
CREATE TRIGGER trg_er_updated_at BEFORE UPDATE ON control.entity_relation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_fsp_updated_at ON control.field_security_policy;
CREATE TRIGGER trg_fsp_updated_at BEFORE UPDATE ON control.field_security_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ─── B. Auto-create entity_publish_state on entity INSERT ────────────────────

DROP TRIGGER IF EXISTS trg_entity_ensure_publish_state ON control.entity;
CREATE TRIGGER trg_entity_ensure_publish_state
    AFTER INSERT ON control.entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_ensure_entity_publish_state();

-- ─── C. Field flag defaults ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_ef_flag_defaults ON control.entity_field;
CREATE TRIGGER trg_ef_flag_defaults
    BEFORE INSERT ON control.entity_field
    FOR EACH ROW EXECUTE FUNCTION control.trg_field_flag_defaults();


-- =============================================================================
-- §  control.book_posting_rule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bpr_updated_at ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_updated_at BEFORE UPDATE ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bpr_status_changed ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_status_changed BEFORE UPDATE ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bpr_status_lookup ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.book_posting_rule_status', 'status');

DROP TRIGGER IF EXISTS trg_bpr_account_strategy_lookup ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_account_strategy_lookup
    BEFORE INSERT OR UPDATE OF account_strategy ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bpr_account_strategy', 'account_strategy');

DROP TRIGGER IF EXISTS trg_bpr_amount_strategy_lookup ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_amount_strategy_lookup
    BEFORE INSERT OR UPDATE OF amount_strategy ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bpr_amount_strategy', 'amount_strategy');

DROP TRIGGER IF EXISTS trg_bpr_timing_lookup ON control.book_posting_rule;
CREATE TRIGGER trg_bpr_timing_lookup
    BEFORE INSERT OR UPDATE OF recognition_timing ON control.book_posting_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.bpr_recognition_timing', 'recognition_timing');

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- control.transaction_flow_template
-- ============================================================================

DROP TRIGGER IF EXISTS trg_tft_updated_at ON control.transaction_flow_template;
CREATE TRIGGER trg_tft_updated_at
    BEFORE UPDATE ON control.transaction_flow_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tft_status_changed ON control.transaction_flow_template;
CREATE TRIGGER trg_tft_status_changed
    BEFORE UPDATE ON control.transaction_flow_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_config
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apc_updated_at ON control.acct_profile_config;
CREATE TRIGGER trg_apc_updated_at
    BEFORE UPDATE ON control.acct_profile_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apc_status_changed ON control.acct_profile_config;
CREATE TRIGGER trg_apc_status_changed
    BEFORE UPDATE ON control.acct_profile_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_commitment_config
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apcc_updated_at ON control.acct_profile_commitment_config;
CREATE TRIGGER trg_apcc_updated_at
    BEFORE UPDATE ON control.acct_profile_commitment_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apcc_status_changed ON control.acct_profile_commitment_config;
CREATE TRIGGER trg_apcc_status_changed
    BEFORE UPDATE ON control.acct_profile_commitment_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_revenue_config
-- ============================================================================

DROP TRIGGER IF EXISTS trg_aprc_updated_at ON control.acct_profile_revenue_config;
CREATE TRIGGER trg_aprc_updated_at
    BEFORE UPDATE ON control.acct_profile_revenue_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_aprc_status_changed ON control.acct_profile_revenue_config;
CREATE TRIGGER trg_aprc_status_changed
    BEFORE UPDATE ON control.acct_profile_revenue_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_settlement_config
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apsc_updated_at ON control.acct_profile_settlement_config;
CREATE TRIGGER trg_apsc_updated_at
    BEFORE UPDATE ON control.acct_profile_settlement_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apsc_status_changed ON control.acct_profile_settlement_config;
CREATE TRIGGER trg_apsc_status_changed
    BEFORE UPDATE ON control.acct_profile_settlement_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_event
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ape_updated_at ON control.acct_profile_event;
CREATE TRIGGER trg_ape_updated_at
    BEFORE UPDATE ON control.acct_profile_event
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ape_status_changed ON control.acct_profile_event;
CREATE TRIGGER trg_ape_status_changed
    BEFORE UPDATE ON control.acct_profile_event
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_entry_template
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apet_updated_at ON control.acct_profile_entry_template;
CREATE TRIGGER trg_apet_updated_at
    BEFORE UPDATE ON control.acct_profile_entry_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apet_status_changed ON control.acct_profile_entry_template;
CREATE TRIGGER trg_apet_status_changed
    BEFORE UPDATE ON control.acct_profile_entry_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_book_rule
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apbr_updated_at ON control.acct_profile_book_rule;
CREATE TRIGGER trg_apbr_updated_at
    BEFORE UPDATE ON control.acct_profile_book_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apbr_status_changed ON control.acct_profile_book_rule;
CREATE TRIGGER trg_apbr_status_changed
    BEFORE UPDATE ON control.acct_profile_book_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.acct_profile_dimension_rule
-- ============================================================================

DROP TRIGGER IF EXISTS trg_apdr_updated_at ON control.acct_profile_dimension_rule;
CREATE TRIGGER trg_apdr_updated_at
    BEFORE UPDATE ON control.acct_profile_dimension_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_apdr_status_changed ON control.acct_profile_dimension_rule;
CREATE TRIGGER trg_apdr_status_changed
    BEFORE UPDATE ON control.acct_profile_dimension_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.classification_to_intent_rule
-- ============================================================================

DROP TRIGGER IF EXISTS trg_cir_updated_at ON control.classification_to_intent_rule;
CREATE TRIGGER trg_cir_updated_at
    BEFORE UPDATE ON control.classification_to_intent_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cir_status_changed ON control.classification_to_intent_rule;
CREATE TRIGGER trg_cir_status_changed
    BEFORE UPDATE ON control.classification_to_intent_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.intent_to_accounting_profile_rule
-- ============================================================================

DROP TRIGGER IF EXISTS trg_iprr_updated_at ON control.intent_to_accounting_profile_rule;
CREATE TRIGGER trg_iprr_updated_at
    BEFORE UPDATE ON control.intent_to_accounting_profile_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_iprr_status_changed ON control.intent_to_accounting_profile_rule;
CREATE TRIGGER trg_iprr_status_changed
    BEFORE UPDATE ON control.intent_to_accounting_profile_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- control.intent_profile_override
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ipo_updated_at ON control.intent_profile_override;
CREATE TRIGGER trg_ipo_updated_at
    BEFORE UPDATE ON control.intent_profile_override
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ipo_status_changed ON control.intent_profile_override;
CREATE TRIGGER trg_ipo_status_changed
    BEFORE UPDATE ON control.intent_profile_override
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §DP1  control.dimension_policy
-- Trigger naming: trg_dp_{purpose}
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dp_updated_at ON control.dimension_policy;
CREATE TRIGGER trg_dp_updated_at
    BEFORE UPDATE ON control.dimension_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dp_status_changed ON control.dimension_policy;
CREATE TRIGGER trg_dp_status_changed
    BEFORE UPDATE ON control.dimension_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Lookup validation: dimension_policy.behavior via domain control.dimension_policy_behavior
DROP TRIGGER IF EXISTS trg_dp_behavior_lookup ON control.dimension_policy;
CREATE TRIGGER trg_dp_behavior_lookup
    BEFORE INSERT OR UPDATE OF behavior ON control.dimension_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.dimension_policy_behavior', 'behavior');


-- =============================================================================
-- §DS1  control.document_sequence_config
-- Trigger naming: trg_dsc_{purpose}
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dsc_updated_at ON control.document_sequence_config;
CREATE TRIGGER trg_dsc_updated_at
    BEFORE UPDATE ON control.document_sequence_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dsc_status_changed ON control.document_sequence_config;
CREATE TRIGGER trg_dsc_status_changed
    BEFORE UPDATE ON control.document_sequence_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Lookup validation: document_sequence_config.doc_type via domain control.document_sequence_doc_type
DROP TRIGGER IF EXISTS trg_dsc_doc_type_lookup ON control.document_sequence_config;
CREATE TRIGGER trg_dsc_doc_type_lookup
    BEFORE INSERT OR UPDATE OF doc_type ON control.document_sequence_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.document_sequence_doc_type', 'doc_type');

-- Lookup validation: document_sequence_config.reset_strategy via domain control.document_sequence_reset_strategy
DROP TRIGGER IF EXISTS trg_dsc_reset_strategy_lookup ON control.document_sequence_config;
CREATE TRIGGER trg_dsc_reset_strategy_lookup
    BEFORE INSERT OR UPDATE OF reset_strategy ON control.document_sequence_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.document_sequence_reset_strategy', 'reset_strategy');

-- §DS2  control.document_sequence_counter — no lifecycle triggers (natural PK hot counter)


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — control schema triggers
-- =============================================================================

-- =============================================================================
-- §CCRR  control.commodity_to_spend_category_rule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ccrr_updated_at ON control.commodity_to_spend_category_rule;
CREATE TRIGGER trg_ccrr_updated_at
    BEFORE UPDATE ON control.commodity_to_spend_category_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccrr_status_changed ON control.commodity_to_spend_category_rule;
CREATE TRIGGER trg_ccrr_status_changed
    BEFORE UPDATE OF status ON control.commodity_to_spend_category_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ── §BK5 bank_format_rule ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bfr_updated_at ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_updated_at BEFORE UPDATE ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bfr_status_changed ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_status_changed BEFORE UPDATE ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bfr_status_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_status', 'status');

DROP TRIGGER IF EXISTS trg_bfr_payment_network_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_payment_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

DROP TRIGGER IF EXISTS trg_bfr_direction_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_direction', 'direction');

DROP TRIGGER IF EXISTS trg_bfr_acct_id_type_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_acct_id_type_lookup
    BEFORE INSERT OR UPDATE OF account_id_type ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_id_type', 'account_id_type');

DROP TRIGGER IF EXISTS trg_bfr_bank_id_type_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_bank_id_type_lookup
    BEFORE INSERT OR UPDATE OF bank_id_type ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_bank_id_type', 'bank_id_type');


-- ── §PM2 payment_method_company_policy ──────────────────────────────────────

DROP TRIGGER IF EXISTS trg_pmcp_updated_at ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_updated_at BEFORE UPDATE ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pmcp_status_changed ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_status_changed BEFORE UPDATE ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pmcp_status_lookup ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_method_company_policy_status', 'status');

DROP TRIGGER IF EXISTS trg_pmcp_direction_lookup ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_pmcp_validate_bank_link ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_validate_bank_link
    BEFORE INSERT OR UPDATE OF bank_account_link_id, company_code_id
    ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_pmcp_validate_bank_link_company();

-- ── §PM3 bank_interface_profile ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bip_updated_at ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_updated_at BEFORE UPDATE ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bip_status_changed ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_status_changed BEFORE UPDATE ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bip_status_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_interface_profile_status', 'status');

DROP TRIGGER IF EXISTS trg_bip_type_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_type_lookup
    BEFORE INSERT OR UPDATE OF interface_type ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_interface_profile_type', 'interface_type');

DROP TRIGGER IF EXISTS trg_bip_network_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.bank_interface_profile
    FOR EACH ROW WHEN (NEW.payment_network IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

DROP TRIGGER IF EXISTS trg_bip_format_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_format_lookup
    BEFORE INSERT OR UPDATE OF file_format_code ON control.bank_interface_profile
    FOR EACH ROW WHEN (NEW.file_format_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_interface_file_format', 'file_format_code');

-- ── §PM4 payment_method_interface_binding ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_pmib_updated_at ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_updated_at BEFORE UPDATE ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pmib_status_changed ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_status_changed BEFORE UPDATE ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pmib_status_lookup ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_method_interface_binding_status', 'status');

DROP TRIGGER IF EXISTS trg_pmib_direction_lookup ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_pmib_network_lookup ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.payment_method_interface_binding
    FOR EACH ROW WHEN (NEW.payment_network IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

-- ── §PM5 payment_settlement_rule ────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_psr_updated_at ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_updated_at BEFORE UPDATE ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_psr_status_changed ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_status_changed BEFORE UPDATE ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_psr_status_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_rule_status', 'status');

DROP TRIGGER IF EXISTS trg_psr_direction_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_psr_clearing_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_clearing_role_lookup
    BEFORE INSERT OR UPDATE OF clearing_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'clearing_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_settlement_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_settlement_role_lookup
    BEFORE INSERT OR UPDATE OF settlement_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'settlement_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_bank_fee_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_bank_fee_role_lookup
    BEFORE INSERT OR UPDATE OF bank_fee_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.bank_fee_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'bank_fee_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_discount_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_discount_role_lookup
    BEFORE INSERT OR UPDATE OF discount_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.discount_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'discount_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_fx_gain_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_fx_gain_role_lookup
    BEFORE INSERT OR UPDATE OF fx_gain_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.fx_gain_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'fx_gain_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_fx_loss_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_fx_loss_role_lookup
    BEFORE INSERT OR UPDATE OF fx_loss_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.fx_loss_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'fx_loss_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_chargeback_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_chargeback_role_lookup
    BEFORE INSERT OR UPDATE OF chargeback_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.chargeback_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'chargeback_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_suspense_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_suspense_role_lookup
    BEFORE INSERT OR UPDATE OF suspense_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.suspense_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'suspense_posting_role_code');


-- =============================================================================
-- §ACP1  control.asset_class_book_policy
-- =============================================================================

-- updated_at / status_changed
DROP TRIGGER IF EXISTS trg_acbp_updated_at ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_updated_at BEFORE UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_acbp_status_changed ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_status_changed BEFORE UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Lookup validations
DROP TRIGGER IF EXISTS trg_acbp_status_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.asset_class_book_policy_status', 'status');

DROP TRIGGER IF EXISTS trg_acbp_depr_method_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_depr_method_lookup
    BEFORE INSERT OR UPDATE OF depreciation_method ON control.asset_class_book_policy
    FOR EACH ROW WHEN (NEW.depreciation_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_method', 'depreciation_method');

DROP TRIGGER IF EXISTS trg_acbp_convention_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_convention_lookup
    BEFORE INSERT OR UPDATE OF convention ON control.asset_class_book_policy
    FOR EACH ROW WHEN (NEW.convention IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_convention', 'convention');

DROP TRIGGER IF EXISTS trg_acbp_prorate_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_prorate_lookup
    BEFORE INSERT OR UPDATE OF prorate_basis ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.asset_prorate_basis', 'prorate_basis');

DROP TRIGGER IF EXISTS trg_acbp_start_rule_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_start_rule_lookup
    BEFORE INSERT OR UPDATE OF depreciation_start_rule ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.depreciation_start_rule', 'depreciation_start_rule');

DROP TRIGGER IF EXISTS trg_acbp_residual_mode_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_residual_mode_lookup
    BEFORE INSERT OR UPDATE OF residual_value_mode ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.residual_value_mode', 'residual_value_mode');

-- Book code validation: ensures book_code exists in ledger_book AND is assigned
-- to the policy's company_code_id via company_code_book_assignment.
DROP TRIGGER IF EXISTS trg_acbp_book_code_validate ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_book_code_validate
    BEFORE INSERT OR UPDATE OF book_code, company_code_id ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_book_code();

-- Class-policy consistency: land/cwip → is_depreciable = false
DROP TRIGGER IF EXISTS trg_acbp_class_consistency ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_class_consistency
    BEFORE INSERT OR UPDATE OF is_depreciable, asset_class_id ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_class_consistency();

-- Posting role code format validation
DROP TRIGGER IF EXISTS trg_acbp_posting_roles_validate ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_posting_roles_validate
    BEFORE INSERT OR UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_posting_roles();


-- ── Policy rule versioning trigger ──────────────────────────────────────────
-- BEFORE UPDATE on control.policy_rule:
--   1. Close the current open version (effective_until = now()).
--   2. Insert a snapshot of the OLD row as a new policy_rule_version row.
-- Routes should SET LOCAL app.principal_id = '<uuid>' before each UPDATE.

CREATE OR REPLACE FUNCTION control.trg_fn_version_policy_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version integer;
  v_principal_id uuid;
BEGIN
  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO v_next_version
    FROM control.policy_rule_version
   WHERE policy_rule_id = OLD.id;

  BEGIN
    v_principal_id := current_setting('app.principal_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_principal_id := NULL;
  END;

  UPDATE control.policy_rule_version
     SET effective_until = now(),
         updated_at      = now()
   WHERE policy_rule_id = OLD.id
     AND effective_until IS NULL;

  INSERT INTO control.policy_rule_version (
    tenant_id,
    policy_rule_id,
    policy_id,
    version_no,
    rule_snapshot,
    effective_from,
    effective_until,
    published_by,
    published_at
  ) VALUES (
    OLD.tenant_id,
    OLD.id,
    OLD.policy_id,
    v_next_version,
    to_jsonb(OLD),
    COALESCE(OLD.updated_at, OLD.created_at, now()),
    now(),
    v_principal_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_policy_rule ON control.policy_rule;

CREATE TRIGGER trg_version_policy_rule
  BEFORE UPDATE ON control.policy_rule
  FOR EACH ROW
  EXECUTE FUNCTION control.trg_fn_version_policy_rule();

COMMENT ON FUNCTION control.trg_fn_version_policy_rule() IS
  'BEFORE UPDATE trigger on control.policy_rule. Closes the previous '
  'policy_rule_version row (sets effective_until) and inserts a snapshot '
  'of the OLD row as a new version. Enables full rule change audit trail.';


-- ─── D. Entity binding validation (P1) ──────────────────────────────────────
-- Validates entity_name / target_entity against control.entity.entity_code.
-- Prevents orphaned lifecycle, operation, and relation rows at write time.
-- Functions defined in 08_functions/002_control.sql §Entity binding validators.

-- entity_lifecycle: validate entity_name on insert/update
DROP TRIGGER IF EXISTS trg_el_validate_entity_binding ON control.entity_lifecycle;
CREATE TRIGGER trg_el_validate_entity_binding
    BEFORE INSERT OR UPDATE OF entity_name
    ON control.entity_lifecycle
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

-- entity_operation: validate entity_name on insert/update
DROP TRIGGER IF EXISTS trg_eo_validate_entity_binding ON control.entity_operation;
CREATE TRIGGER trg_eo_validate_entity_binding
    BEFORE INSERT OR UPDATE OF entity_name
    ON control.entity_operation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

-- entity_relation: validate target_entity on insert/update
DROP TRIGGER IF EXISTS trg_er_validate_target_entity ON control.entity_relation;
CREATE TRIGGER trg_er_validate_target_entity
    BEFORE INSERT OR UPDATE OF target_entity
    ON control.entity_relation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_target_entity();


-- =============================================================================
-- §R5  updated_at maintenance for outbox_routing_rule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_orr_updated_at ON control.outbox_routing_rule;
CREATE TRIGGER trg_orr_updated_at
    BEFORE UPDATE ON control.outbox_routing_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §R11  updated_at maintenance for budget_check_config
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bcc_updated_at ON control.budget_check_config;
CREATE TRIGGER trg_bcc_updated_at
    BEFORE UPDATE ON control.budget_check_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §R7-A  updated_at maintenance for wht_threshold_config
-- =============================================================================

DROP TRIGGER IF EXISTS trg_wtc_updated_at ON control.wht_threshold_config;
CREATE TRIGGER trg_wtc_updated_at
    BEFORE UPDATE ON control.wht_threshold_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §TEC  updated_at maintenance for transaction_event_catalog
-- =============================================================================
-- R1: new catalog table — updated_at trigger follows schema convention.

DROP TRIGGER IF EXISTS trg_tec_updated_at ON control.transaction_event_catalog;
CREATE TRIGGER trg_tec_updated_at
    BEFORE UPDATE ON control.transaction_event_catalog
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §PROV  updated_at maintenance for blueprint tables
-- =============================================================================
-- R6: blueprint_registry and tenant_blueprint_application migrated from seed
-- file into main DDL; updated_at triggers added here to match schema convention.

DROP TRIGGER IF EXISTS trg_br_updated_at ON control.blueprint_registry;
CREATE TRIGGER trg_br_updated_at
    BEFORE UPDATE ON control.blueprint_registry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tba_updated_at ON control.tenant_blueprint_application;
CREATE TRIGGER trg_tba_updated_at
    BEFORE UPDATE ON control.tenant_blueprint_application
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
