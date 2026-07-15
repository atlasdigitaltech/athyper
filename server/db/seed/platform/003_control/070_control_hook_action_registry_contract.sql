-- Platform-global hook actions for the lifecycle engine (tenant_id=NULL, origin='system').
-- action_key is the FK target from lifecycle_transition_hook.action.
-- Tenants may add custom actions with origin='tenant'.

INSERT INTO control.hook_action_registry (
    tenant_id, action_key, label, description,
    handler_type, handler_config,
    default_contract_role, default_safety_level,
    origin, is_active,
    created_by
) VALUES
-- Core platform actions
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

-- Version lifecycle actions
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

-- Finance document actions
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
    '00000000-0000-0000-0000-000000000000'::uuid),

-- P2P transition hook actions
-- These are wired into control.lifecycle_transition_hook in 034z_p2p_transition_hooks.sql.
-- All are 'contract' role + 'required' safety (cannot be overridden) except
-- notification.publish which is 'extension'/'narrowable'.

(NULL, 'activity_log.write',
    'Write Activity Log',
    'Insert one row into log.activity_log for the firing transition '
    '(domain, activity_type, entity_type/id, actor, detail).',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'snapshot.capture',
    'Capture Document Snapshot',
    'Call snapshot.fn_capture_full() â€” write a snapshot.document_snapshot row '
    'with the full graph (header + lines + components + distributions + '
    'schedules + related). gate_event_kind comes from config.gate_event_kind.',
    'built_in', '{"gate_event_kind": "commitment"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'transaction_flow.dispatch',
    'Dispatch Transaction Flow',
    'Look up control.transaction_flow_template by event_code and flow_code, '
    'then dispatch to the matching imperative posting handler '
    '(GR posting / SES posting / PI posting / payment posting). Idempotent '
    'via control.lifecycle_transition_execution (execution_token).',
    'built_in', '{"event_code": null, "flow_code": null}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.materialize_gl_balance',
    'Materialize GL Balance',
    'Iterate journal_line for the JE just written and call '
    'ledger.upsert_gl_balance() per (period, account, dim_set). Single-source '
    'GL posting helper â€” invoked from the dispatcher.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.materialize_inventory_movement',
    'Materialize Inventory Movement',
    'Receipt post â†’ insert ledger.inventory_movement (RECEIPT, signed) + '
    'upsert ledger.inventory_balance + write ledger.inventory_valuation_layer.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.materialize_commitment_schedule',
    'Materialize Commitment Schedule',
    'PO approve â†’ insert ledger.commitment_schedule rows derived from '
    'document.schedule_line (current versions only).',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.commitment_consume',
    'Consume Commitment',
    'Receipt / service_sheet / PI post â†’ write ledger.commitment_fulfillment '
    'row (kind=GRN | SES | INVOICE | PAYMENT) linking commitment_id + line.',
    'built_in', '{"kind": "GRN"}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.budget_reserve',
    'Reserve Budget',
    'PR approve â†’ write ledger.budget_transaction(RESERVE) + bump '
    'ledger.budget_balance.reserved_amount.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.budget_commit',
    'Commit Budget',
    'PO approve â†’ write ledger.budget_transaction(COMMIT_FROM_RESERVATION) + '
    'transfer balance from PR-reserved to PO-committed.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.budget_consume',
    'Consume Budget',
    'Receipt / service_sheet / PI post â†’ write ledger.budget_transaction(CONSUME) + '
    'bump ledger.budget_balance.consumed_amount.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.budget_release',
    'Release Budget',
    'PO cancel / short_close â†’ write ledger.budget_transaction(RELEASE) + '
    'decrement ledger.budget_balance.reserved_amount.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'ledger.tax_post',
    'Post Tax Calculation',
    'PI post â†’ insert ledger.tax_calculation per line + '
    'ledger.tax_credit_movement for the recoverable portion.',
    'built_in', '{}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'notification.publish',
    'Publish Notification',
    'Routes through control.notification_routing_rule + '
    'control.notification_template (template_key from config). '
    'Narrowable â€” tenants may scope/disable per audience.',
    'built_in', '{"template_key": null}'::jsonb,
    'extension', 'narrowable',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid),

(NULL, 'workflow.start',
    'Start Workflow',
    'Create document.workflow_request from control.workflow_definition '
    '(workflow_definition_id in config). BEFORE-hook on approval gates â€” '
    'blocks the transition until the workflow reaches APPROVED terminal state.',
    'built_in', '{"workflow_definition_id": null}'::jsonb,
    'contract', 'required',
    'system', true,
    '00000000-0000-0000-0000-000000000000'::uuid)

ON CONFLICT ON CONSTRAINT har_key_uq DO NOTHING;

