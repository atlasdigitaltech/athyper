/* ============================================================================
   Athyper — Hook Override Directives

   Separate override directive table mirroring meta.overlay_change pattern.
   Allows tenants to suppress, replace, or extend system hooks per lifecycle
   transition, with safety enforcement based on contract_role and safety_level.

   Design principles:
     - Directive table (not executable): directives are resolved at runtime
       by the resolution engine, which produces a final execution plan
     - Contract hooks cannot be overridden (enforced by trigger guard)
     - Narrowable hooks can only be extended (add_after), not suppressed
     - Replaceable hooks can be suppressed or replaced
     - Cache invalidation on every override change

   Dependencies: 077_hook_foundation.sql, 078_hook_action_registry.sql
   ============================================================================ */

-- ============================================================================
-- 1. OVERRIDE DIRECTIVE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.lifecycle_hook_override (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,

    -- Target: which hook is being overridden
    target_hook_id      uuid NOT NULL REFERENCES meta.lifecycle_transition_hook(id) ON DELETE CASCADE,

    -- Override operation
    --   suppress:   skip the target hook entirely
    --   replace:    execute replacement_action instead of target hook
    --   add_before: insert a new action before the target hook
    --   add_after:  insert a new action after the target hook
    override_kind       text NOT NULL,

    -- Replacement action (required for replace, add_before, add_after)
    replacement_action  text,
    replacement_config  jsonb,

    -- Ordering within the same kind (for multiple add_before/add_after on same target)
    sort_order          int NOT NULL DEFAULT 0,

    -- Audit
    reason              text,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text NOT NULL,

    -- Constraints
    CONSTRAINT chk_override_kind CHECK (override_kind IN ('suppress', 'replace', 'add_before', 'add_after')),

    -- Replacement action required for replace/add_before/add_after, forbidden for suppress
    CONSTRAINT chk_override_replacement CHECK (
        (override_kind = 'suppress' AND replacement_action IS NULL)
        OR (override_kind != 'suppress' AND replacement_action IS NOT NULL)
    ),

    -- Only one active override per target hook per tenant (prevent conflicting directives)
    CONSTRAINT uq_override_active_target UNIQUE (tenant_id, target_hook_id)
);

COMMENT ON TABLE meta.lifecycle_hook_override IS
  'Override directives for lifecycle hooks. Resolved at runtime by the hook resolution engine. Mirrors meta.overlay_change pattern.';


-- ============================================================================
-- 2. SAFETY GUARD TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.fn_hook_override_guard()
RETURNS trigger AS $$
DECLARE
    v_target_contract_role text;
    v_target_safety_level  text;
    v_target_origin        text;
    v_target_tenant_id     uuid;
BEGIN
    -- Resolve the target hook's governance attributes
    SELECT contract_role, safety_level, origin, tenant_id
    INTO v_target_contract_role, v_target_safety_level, v_target_origin, v_target_tenant_id
    FROM meta.lifecycle_transition_hook
    WHERE id = NEW.target_hook_id;

    -- Rule 1: Cannot override contract hooks (invariants are permanent)
    IF v_target_contract_role = 'contract' THEN
        RAISE EXCEPTION 'Cannot override a contract hook (id=%, target_hook_id=%)', NEW.id, NEW.target_hook_id;
    END IF;

    -- Rule 2: Narrowable hooks can only be extended (add_before, add_after), not suppressed/replaced
    IF v_target_safety_level = 'narrowable' AND NEW.override_kind IN ('suppress', 'replace') THEN
        RAISE EXCEPTION 'Cannot % a narrowable hook (id=%, target_hook_id=%). Use add_before or add_after instead.',
            NEW.override_kind, NEW.id, NEW.target_hook_id;
    END IF;

    -- Rule 3: Tenant can only override hooks visible to their tenant
    -- System hooks are overridable by any tenant; tenant hooks only by the same tenant
    IF v_target_origin = 'tenant' AND v_target_tenant_id != NEW.tenant_id THEN
        RAISE EXCEPTION 'Cannot override another tenant''s hook (override_tenant=%, hook_tenant=%)',
            NEW.tenant_id, v_target_tenant_id;
    END IF;

    -- Rule 4: Replacement action must exist in the registry
    IF NEW.replacement_action IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM meta.hook_action_registry
            WHERE action_key = NEW.replacement_action
              AND is_active = true
              AND (
                  origin = 'system'
                  OR (origin = 'tenant' AND tenant_id = NEW.tenant_id)
              )
        ) THEN
            RAISE EXCEPTION 'Replacement action "%" is not registered in meta.hook_action_registry for tenant %',
                NEW.replacement_action, NEW.tenant_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hook_override_guard
    BEFORE INSERT OR UPDATE ON meta.lifecycle_hook_override
    FOR EACH ROW EXECUTE FUNCTION meta.fn_hook_override_guard();


-- ============================================================================
-- 3. CACHE INVALIDATION
-- ============================================================================

-- Override changes invalidate the lifecycle definition_hash for affected lifecycle
CREATE OR REPLACE FUNCTION meta.fn_override_change_invalidate()
RETURNS trigger AS $$
DECLARE
    v_lifecycle_id uuid;
BEGIN
    -- Resolve lifecycle_id from target hook → transition → lifecycle
    SELECT lt.lifecycle_id INTO v_lifecycle_id
    FROM meta.lifecycle_transition_hook lth
    JOIN meta.lifecycle_transition lt ON lt.id = lth.transition_id
    WHERE lth.id = COALESCE(NEW.target_hook_id, OLD.target_hook_id);

    IF v_lifecycle_id IS NOT NULL THEN
        UPDATE meta.lifecycle
        SET definition_hash = NULL,
            updated_at = now()
        WHERE id = v_lifecycle_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_override_change_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON meta.lifecycle_hook_override
    FOR EACH ROW EXECUTE FUNCTION meta.fn_override_change_invalidate();


-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_override_target
    ON meta.lifecycle_hook_override (target_hook_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_override_tenant
    ON meta.lifecycle_hook_override (tenant_id, target_hook_id)
    WHERE is_active = true;


-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON COLUMN meta.lifecycle_hook_override.override_kind IS
  'suppress: skip hook. replace: execute replacement instead. add_before/add_after: inject adjacent action.';

COMMENT ON COLUMN meta.lifecycle_hook_override.replacement_action IS
  'Action key from meta.hook_action_registry. Required for replace/add_before/add_after.';

COMMENT ON FUNCTION meta.fn_hook_override_guard() IS
  'Enforces override safety: contract hooks are non-overridable, narrowable hooks cannot be suppressed/replaced.';

COMMENT ON FUNCTION meta.fn_override_change_invalidate() IS
  'Invalidates lifecycle definition_hash when override directives change.';
