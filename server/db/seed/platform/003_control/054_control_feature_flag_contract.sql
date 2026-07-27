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
        'atlas_agent_enabled',
        'Atlas Agent',
        'Tenant release gate for the governed Atlas conversational assistant.',
        'release_gate',
        true,
        '{"owner":"ai-platform","rollout_intent":"neon_base_holder","preprod_note":"Globally enabled for all tenants during pre-prod pilot.","production_note":"In production, flip is_enabled back to false and enable per-tenant only after review."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas_agent_neon_enabled',
        'Atlas Agent — Neon',
        'Tenant release gate for Atlas chat in the Neon product plane.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"allowlisted_neon_text_pilot","requires":["atlas_agent_enabled"],"phase0":{"chat":"allowlisted","persistence":false,"read_tools":false,"mutations":false},"production_note":"Default off. Enable only for the approved Neon text-only cohort; later Atlas feature gates remain independently conjunctive."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas_agent_mesh_enabled',
        'Atlas Agent — Mesh',
        'Reserved tenant release gate for Atlas chat in the Mesh product plane.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"reserved","requires":["atlas_agent_enabled","atlas_mesh_actor_mapping_verified"],"phase0":{"chat":false,"persistence":false,"read_tools":false,"mutations":false},"production_note":"Must remain disabled until the server plane policy, canonical Mesh actor mapping, and RLS/FK certification are approved."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas_agent_admin_enabled',
        'Atlas Agent — Admin',
        'Tenant release gate for Admin product-help-only Atlas chat.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"admin_product_help_internal_pilot","requires":["atlas_agent_enabled","atlas_admin_product_help_reviewed"],"phase6_1":{"chat":true,"persistence":false,"read_tools":false,"mutations":false,"public_models":["atlas-fast"]},"production_note":"Product documentation and safe navigation help only. Tenant records, IAM traces, customer history and all tools remain unavailable. Support-session data access requires separate Security approval."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas_conversation_persistence_enabled',
        'Atlas Conversation Persistence',
        'Tenant release gate for private durable Atlas threads, history, retention, export, and purge.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"allowlisted_internal_pilot","requires":["atlas_agent_enabled","atlas_thread_rls_verified","atlas_retention_purge_verified"],"production_note":"Keep disabled by default. Enable per tenant only after privacy notice and retention policy approval."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas_agent_tools_enabled',
        'Atlas Governed Tools',
        'Tenant release gate for server-authorized Atlas tool discovery and execution.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"allowlisted_read_only_pilot","requires":["atlas_agent_enabled","atlas_conversation_persistence_enabled","atlas_tool_invocation_ledger_verified","atlas_tool_authorization_verified"],"production_note":"Keep disabled by default. Phase 7C.1 permits only certified read-only tools; mutation and confirmation execution remain unavailable."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas.tools.catalog_help',
        'Atlas Catalog Help Tool',
        'Per-tool release gate for the read-only, code-owned Atlas catalog and help capability.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"first_read_only_tool","allowed_planes":["neon"],"requires":["atlas_agent_enabled","atlas_conversation_persistence_enabled","atlas_agent_tools_enabled"],"production_note":"Enable only for the supervised Neon read-only pilot after provider and authorization conformance pass. Mesh requires a canonical actor mapping first."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
    (
        'atlas.tools.record_lookup',
        'Atlas Company Code Lookup Tool',
        'Per-tool release gate for exact-identifier, read-only company-code summaries through the canonical Atlas data gateway.',
        'release_gate',
        false,
        '{"owner":"ai-platform","rollout_intent":"second_read_only_tool","allowed_planes":["neon"],"certified_entities":["company_code"],"requires":["atlas_agent_enabled","atlas_conversation_persistence_enabled","atlas_agent_tools_enabled","atlas.tools.catalog_help"],"production_note":"Keep disabled by default. Enable only after company scope, field masking, source revision, revocation and prompt-injection tests pass."}'::jsonb,
        '00000000-0000-0000-0000-000000000000'
    ),
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
