/* ============================================================================
   Athyper — Hook Action Registry

   Centralised registry of all hook actions (built-in and tenant-defined).
   Replaces the closed CHECK constraint on lifecycle_transition_hook.action
   with a trigger-validated, extensible registry.

   Key design decisions:
     - Surrogate PK (uuid), scoped uniqueness (system globally, tenant per tenant_id)
     - Only 'built_in' and 'emit_event' handler types (no direct webhook/script)
     - External integrations route through EventGateway → wf.outbox → DeliveryScheduler
     - Registry changes invalidate lifecycle definition_hash for cache coherence

   Dependencies: 068_governed_versioning.sql, 077_hook_foundation.sql
   ============================================================================ */

-- ============================================================================
-- 1. REGISTRY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.hook_action_registry (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid REFERENCES core.tenant(id) ON DELETE CASCADE,
    action_key          text NOT NULL,

    -- Origin: system actions are platform-provided, tenant actions are customer-defined
    origin              text NOT NULL DEFAULT 'system',

    label               text NOT NULL,
    description         text,

    -- Handler type: how this action is executed at runtime
    --   built_in:   dispatched via switch/case in LifecycleManagerService
    --   emit_event: publishes a domain event to MetaEventBus / outbox
    handler_type        text NOT NULL DEFAULT 'built_in',

    -- Handler-specific config (e.g. event_type for emit_event handlers)
    handler_config      jsonb,

    -- Default safety classification for hooks using this action
    default_contract_role text NOT NULL DEFAULT 'extension',
    default_safety_level  text NOT NULL DEFAULT 'replaceable',

    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text NOT NULL,

    -- Constraints
    CONSTRAINT chk_registry_origin CHECK (origin IN ('system', 'tenant')),
    CONSTRAINT chk_registry_handler_type CHECK (handler_type IN ('built_in', 'emit_event')),
    CONSTRAINT chk_registry_contract_role CHECK (default_contract_role IN ('contract', 'extension')),
    CONSTRAINT chk_registry_safety_level CHECK (default_safety_level IN ('narrowable', 'replaceable')),

    -- System actions must not have tenant_id; tenant actions must have tenant_id
    CONSTRAINT chk_registry_origin_tenant CHECK (
        (origin = 'system' AND tenant_id IS NULL) OR
        (origin = 'tenant' AND tenant_id IS NOT NULL)
    )
);

-- System-level action keys must be globally unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_registry_system_action
    ON meta.hook_action_registry (action_key)
    WHERE origin = 'system';

-- Tenant-level action keys must be unique per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_registry_tenant_action
    ON meta.hook_action_registry (tenant_id, action_key)
    WHERE origin = 'tenant';

COMMENT ON TABLE meta.hook_action_registry IS
  'Extensible registry of hook actions. System actions are platform-provided; tenant actions are customer-defined extensions.';

COMMENT ON COLUMN meta.hook_action_registry.handler_type IS
  'built_in: dispatched via runtime switch. emit_event: publishes domain event to EventBus/outbox.';


-- ============================================================================
-- 2. DROP CLOSED CHECK CONSTRAINT, ADD TRIGGER-BASED VALIDATION
-- ============================================================================

-- Remove the closed-set CHECK that blocks tenant/custom actions
ALTER TABLE meta.lifecycle_transition_hook
    DROP CONSTRAINT IF EXISTS chk_hook_action;

-- Trigger: validate that hook.action exists in the registry
CREATE OR REPLACE FUNCTION meta.fn_hook_action_registry_guard()
RETURNS trigger AS $$
BEGIN
    -- System hooks must reference a system-registered action
    IF NEW.origin = 'system' THEN
        IF NOT EXISTS (
            SELECT 1 FROM meta.hook_action_registry
            WHERE action_key = NEW.action
              AND origin = 'system'
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Hook action "%" is not registered as a system action in meta.hook_action_registry', NEW.action;
        END IF;
    ELSE
        -- Tenant/overlay hooks: check system registry OR tenant registry for matching tenant
        IF NOT EXISTS (
            SELECT 1 FROM meta.hook_action_registry
            WHERE action_key = NEW.action
              AND is_active = true
              AND (
                  origin = 'system'
                  OR (origin = 'tenant' AND tenant_id = NEW.tenant_id)
              )
        ) THEN
            RAISE EXCEPTION 'Hook action "%" is not registered for tenant % in meta.hook_action_registry', NEW.action, NEW.tenant_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hook_action_registry_guard
    BEFORE INSERT OR UPDATE OF action ON meta.lifecycle_transition_hook
    FOR EACH ROW EXECUTE FUNCTION meta.fn_hook_action_registry_guard();


-- ============================================================================
-- 3. CACHE INVALIDATION: registry changes invalidate lifecycle definitions
-- ============================================================================

-- When a registry entry changes, invalidate ALL lifecycles that have hooks using that action.
-- This ensures the definition_hash is recomputed on next access.
CREATE OR REPLACE FUNCTION meta.fn_registry_change_invalidate()
RETURNS trigger AS $$
BEGIN
    UPDATE meta.lifecycle l
    SET definition_hash = NULL,
        updated_at = now()
    FROM meta.lifecycle_transition lt
    JOIN meta.lifecycle_transition_hook lth ON lth.transition_id = lt.id
    WHERE lt.lifecycle_id = l.id
      AND lth.action = COALESCE(NEW.action_key, OLD.action_key);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_registry_change_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON meta.hook_action_registry
    FOR EACH ROW EXECUTE FUNCTION meta.fn_registry_change_invalidate();


-- ============================================================================
-- 4. SEED BUILT-IN SYSTEM ACTIONS
-- ============================================================================

INSERT INTO meta.hook_action_registry (tenant_id, action_key, origin, label, description, handler_type, default_contract_role, default_safety_level, created_by) VALUES
    -- Version governance (contract-level invariants)
    (NULL, 'freeze_version',            'system', 'Freeze Version',           'Mark version as immutable for review',                      'built_in', 'contract',  'narrowable',  'system'),
    (NULL, 'mark_version_approved',     'system', 'Mark Version Approved',    'Set approved_at/approved_by on version',                    'built_in', 'contract',  'narrowable',  'system'),
    (NULL, 'promote_to_effective',      'system', 'Promote to Effective',     'Mark version as currently effective',                       'built_in', 'contract',  'narrowable',  'system'),
    (NULL, 'archive_previous_effective','system', 'Archive Previous Effective','Supersede old effective version when new one activates',    'built_in', 'contract',  'narrowable',  'system'),

    -- Version management (extension-level, replaceable)
    (NULL, 'spawn_next_draft',          'system', 'Spawn Next Draft',         'Clone effective version into a new draft for revision',     'built_in', 'extension', 'replaceable', 'system'),
    (NULL, 'update_version_status',     'system', 'Update Version Status',    'Set version.status to config.target_status',                'built_in', 'extension', 'replaceable', 'system'),

    -- Events and notifications (extension-level, narrowable)
    (NULL, 'emit_event',                'system', 'Emit Event',               'Publish a domain event to MetaEventBus',                    'emit_event','extension','narrowable',  'system'),
    (NULL, 'notify',                    'system', 'Send Notification',        'Trigger notification via notification service',             'built_in', 'extension', 'narrowable',  'system'),
    (NULL, 'cancel_approval',           'system', 'Cancel Approval',          'Cancel pending approval instance',                         'built_in', 'extension', 'narrowable',  'system'),
    (NULL, 'schedule_activation',       'system', 'Schedule Activation',      'Schedule future effective date via timer service',          'built_in', 'extension', 'replaceable', 'system'),

    -- Finance document actions (previously orphaned by CHECK constraint)
    (NULL, 'lock_document',             'system', 'Lock Document',            'Lock document for period-close or freeze',                  'built_in', 'extension', 'narrowable',  'system'),
    (NULL, 'unlock_document',           'system', 'Unlock Document',          'Unlock document after period-close or review',              'built_in', 'extension', 'narrowable',  'system'),
    (NULL, 'sync_document_registry',    'system', 'Sync Document Registry',   'Synchronise document state with financial document registry','built_in','extension', 'narrowable',  'system'),
    (NULL, 'create_journal_entry',      'system', 'Create Journal Entry',     'Create journal entry on document approval/posting',         'built_in', 'extension', 'narrowable',  'system'),
    (NULL, 'create_reversal_entry',     'system', 'Create Reversal Entry',    'Create reversal journal entry on document cancellation',    'built_in', 'extension', 'narrowable',  'system')
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 5. ADD FK FROM HOOK TABLE TO REGISTRY (soft reference via action_key)
-- ============================================================================
-- We use trigger-based validation (section 2) rather than a hard FK because:
-- (a) The hook.action is a text key, not the registry's surrogate uuid
-- (b) System and tenant actions have different scoping rules
-- (c) The trigger provides better error messages than FK violations

-- Add an index on hook.action for the trigger's EXISTS check
CREATE INDEX IF NOT EXISTS idx_hook_action
    ON meta.lifecycle_transition_hook (action);


-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION meta.fn_hook_action_registry_guard() IS
  'Validates that hook.action is registered in meta.hook_action_registry. Replaces closed CHECK constraint.';

COMMENT ON FUNCTION meta.fn_registry_change_invalidate() IS
  'Invalidates lifecycle definition_hash when registry entries change, ensuring cache coherence.';
