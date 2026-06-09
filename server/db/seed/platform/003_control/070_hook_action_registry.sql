-- Table-owned seed for control.hook_action_registry
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/003_control/002_hook_actions.sql
-- ============================================================

-- =============================================================================
-- 900_seed_data/014_lifecycle/001_hook_actions.sql
-- Platform system hook actions for the lifecycle engine
-- Depends on: 04_tables/014_lifecycle.sql (control.hook_action_registry)
-- =============================================================================
-- These are platform-global actions (tenant_id=NULL, origin='system').
-- Tenants can register additional custom actions (origin='tenant').
-- lifecycle_transition_hook.action references action_key here.

INSERT INTO control.hook_action_registry (
    tenant_id, action_key, label, description,
    handler_type, handler_config,
    default_contract_role, default_safety_level,
    origin, is_active,
    created_by
) VALUES
-- ─── Core platform actions ───────────────────────────────────────────────────
(NULL, 'send_notification',
    'Send Notification',
    'Dispatch notification via routing rules (event.notification_message).',
    'emit_event', '{"event_type": "notification.requested"}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'emit_event',
    'Emit Domain Event',
    'Emit a domain event to event.outbox for async processing by consumers.',
    'emit_event', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_approval_request',
    'Create Approval Request',
    'Initiate an approval workflow (governance.approval_instance). '
    'Typically used as a BEFORE hook to gate transitions on approval.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'schedule_timer',
    'Schedule Timer',
    'Create a delayed timer entry in event.lifecycle_timer_schedule. '
    'Used for auto-transition, auto-cancel, reminders, and escalations.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'cancel_timer',
    'Cancel Timer',
    'Cancel all pending timers for the entity in the departed state. '
    'Automatically used on state exit.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'update_entity_field',
    'Update Entity Field',
    'Set a field value on the entity record. Config: {field, value}. '
    'Used for automatic field updates on state entry (e.g. locked_at, approved_by).',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'execute_webhook',
    'Execute Webhook',
    'Make an HTTP POST call to an external endpoint. '
    'handler_config.url is the target. Payload includes entity + transition context.',
    'webhook', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

-- ─── Version lifecycle actions ───────────────────────────────────────────────
(NULL, 'freeze_version',
    'Freeze Version',
    'Lock the entity version for editing. Sets version status to frozen.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'mark_version_approved',
    'Mark Version Approved',
    'Set version status to approved after approval workflow completes.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'promote_to_effective',
    'Promote to Effective',
    'Make the version the currently effective version. '
    'Archives the previous effective version automatically.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'archive_previous_effective',
    'Archive Previous Effective',
    'Archive the previously effective version when a new version is promoted.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'spawn_next_draft',
    'Spawn Next Draft',
    'Create a new draft version from the current effective version.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'update_version_status',
    'Update Version Status',
    'Set version status to a specific value. Config: {target_status}.',
    'built_in', '{}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

-- ─── Finance document actions ────────────────────────────────────────────────
(NULL, 'lock_document',
    'Lock Document',
    'Lock a financial document for editing. Emits document.locked event.',
    'emit_event', '{"event_type": "document.locked"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'unlock_document',
    'Unlock Document',
    'Unlock a financial document. Emits document.unlocked event.',
    'emit_event', '{"event_type": "document.unlocked"}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'sync_document_registry',
    'Sync Document Registry',
    'Update the financial document registry entry for the entity. '
    'Emits document.registry_sync_requested event.',
    'emit_event', '{"event_type": "document.registry_sync_requested"}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_journal_entry',
    'Create Journal Entry',
    'Trigger journal entry creation for a posted financial document. '
    'Emits document.journal_entry_requested event.',
    'emit_event', '{"event_type": "document.journal_entry_requested"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'create_reversal_entry',
    'Create Reversal Entry',
    'Trigger reversal journal entry for a reversed financial document. '
    'Emits document.reversal_entry_requested event.',
    'emit_event', '{"event_type": "document.reversal_entry_requested"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'schedule_activation',
    'Schedule Activation',
    'Schedule future activation of an entity via the timer system. '
    'Used for deferred publishing, planned go-live dates.',
    'built_in', '{}'::jsonb,
    'extension', 'replaceable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid)

ON CONFLICT ON CONSTRAINT har_key_uq DO NOTHING;
