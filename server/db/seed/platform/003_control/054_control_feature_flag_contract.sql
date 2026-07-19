INSERT INTO control.feature_flag (
    code,
    name,
    description,
    flag_type,
    is_enabled,
    metadata,
    created_by
)
VALUES
    (
        'workflow_runtime.enabled',
        'Workflow Runtime Kernel',
        'Global release gate for the WorkflowLifecycleRuntime execution path.',
        'release_gate',
        false,
        '{"owner":"workflow-platform","rollout_intent":"phase_1_guarded_pilot","production_note":"Enable only after tenant-specific review and runtime parity validation."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'workflow_runtime.entity.purchase_invoice',
        'Workflow Runtime Purchase Invoice Pilot',
        'Entity release gate for purchase_invoice draft submit to pending approval through WorkflowLifecycleRuntime.',
        'release_gate',
        false,
        '{"owner":"workflow-platform","rollout_intent":"phase_1_purchase_invoice_only","production_note":"Requires workflow_runtime.enabled and purchase-invoice pilot review."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'workflow_runtime.entity.payment_entry',
        'Workflow Runtime Payment Entry Pilot',
        'Reserved entity release gate for payment_entry workflow runtime migration after purchase invoice parity.',
        'release_gate',
        false,
        '{"owner":"workflow-platform","rollout_intent":"phase_1_5_reserved","production_note":"Must remain disabled for Phase 1 merge."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'workflow_runtime.entity.journal_entry',
        'Workflow Runtime Journal Entry Pilot',
        'Reserved entity release gate for journal_entry workflow runtime migration after payment parity.',
        'release_gate',
        false,
        '{"owner":"workflow-platform","rollout_intent":"phase_1_5_or_later_reserved","production_note":"Must remain disabled for Phase 1 merge."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'finance.posting_readiness_gate',
        'Finance Posting Readiness Gate',
        'Blocks production journal posting unless the company has a current FINANCE_POSTING_READY certification.',
        'release_gate',
        false,
        '{"owner":"finance-platform","rollout_intent":"observe_then_tenant_pilot_then_enforce","production_note":"Keep globally disabled; enable with tenant_overrides only after readiness cycles are operational. Test and opening-balance journals remain governed by their dedicated workflows."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    )
ON CONFLICT (code) DO UPDATE
SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    flag_type   = EXCLUDED.flag_type,
    metadata    = control.feature_flag.metadata || EXCLUDED.metadata,
    updated_at  = now(),
    updated_by  = EXCLUDED.created_by;
