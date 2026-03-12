/* ============================================================================
   Athyper — Mass-update field origin: system / standard / business (custom)

   Three-tier origin model:
     - system   → Infrastructure & lifecycle columns (hidden, read-only)
     - standard → Came with the entity definition via introspection (visible,
                  not user-deletable)
     - business → User-added custom fields (visible, fully editable)

   Logic:
     1. Mark known infrastructure columns → origin='system'
     2. Mark known lifecycle/workflow columns → origin='system'
     3. Set hidden UI type for internal-only system columns
     4. Mark all remaining 'business' fields created by introspection
        (created_by='system') → origin='standard'
     5. Truly user-added fields (created_by ≠ 'system') stay 'business'

   Runs across ALL tenants. Idempotent — safe to re-run.
   ============================================================================ */

DO $$
DECLARE
    v_updated  int := 0;
    v_hidden   int := 0;
    v_standard int := 0;

    -- ── Infrastructure columns (normally skipped by introspection) ──
    v_infra_cols text[] := ARRAY[
        'id', 'tenant_id', 'realm_id',
        'created_at', 'created_by', 'updated_at', 'updated_by',
        'deleted_at', 'deleted_by'
    ];

    -- ── System-managed columns (lifecycle, workflow, audit) ──
    v_system_cols text[] := ARRAY[
        -- Lifecycle / status
        'status', 'version',
        -- Posting
        'posted_at', 'posted_by',
        -- Approval
        'approved_at', 'approved_by',
        'submitted_at', 'submitted_by',
        -- Cancellation
        'cancelled_at', 'cancelled_by',
        -- Reversal
        'reversed_at', 'reversed_by', 'reversed_by_id', 'reversal_of_id',
        'is_reversal',
        -- Reconciliation
        'reconciled_at', 'reconciled_by',
        -- Application
        'applied_at', 'applied_by',
        -- Close
        'closed_at', 'closed_by',
        -- Void
        'voided_at', 'voided_by',
        -- Approval workflow internals
        'decision_score', 'approval_route', 'approval_instance_id',
        -- Finance internals
        'je_id', 'ic_transaction_id', 'derived_from_je_id',
        'posting_rule_id', 'book_idempotency_key',
        -- Computed aggregates
        'paid_amount', 'functional_amount', 'line_count',
        -- Import tracking
        'imported_at', 'imported_by',
        -- Transaction
        'txn_id'
    ];

    -- ── Columns that should also be hidden in UI ──
    v_hidden_cols text[] := ARRAY[
        'txn_id', 'decision_score', 'approval_route', 'approval_instance_id',
        'je_id', 'ic_transaction_id', 'derived_from_je_id',
        'posting_rule_id', 'book_idempotency_key',
        'imported_at', 'imported_by', 'is_reversal', 'reversal_of_id',
        'reversed_by_id', 'reversed_by', 'version',
        'line_count', 'paid_amount', 'functional_amount',
        'posted_at', 'posted_by', 'reconciled_at', 'reconciled_by',
        'applied_at', 'applied_by', 'closed_at', 'closed_by',
        'voided_at', 'voided_by', 'cancelled_at', 'cancelled_by',
        'submitted_at', 'submitted_by', 'approved_at', 'approved_by',
        'reversed_at'
    ];

BEGIN
    -- ─── Step 1: Mark infrastructure columns as system ───────────────────
    UPDATE meta.field
       SET origin      = 'system',
           is_read_only = true,
           updated_at   = now()
     WHERE column_name = ANY(v_infra_cols)
       AND origin <> 'system';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE '[Step 1] Infrastructure columns → system: % rows', v_updated;

    -- ─── Step 2: Mark system-managed columns as system ───────────────────
    UPDATE meta.field
       SET origin      = 'system',
           is_read_only = true,
           updated_at   = now()
     WHERE column_name = ANY(v_system_cols)
       AND origin <> 'system';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE '[Step 2] System-managed columns → system: % rows', v_updated;

    -- ─── Step 3: Set hidden UI type for internal columns ─────────────────
    UPDATE meta.field
       SET ui_type    = 'hidden',
           updated_at = now()
     WHERE column_name = ANY(v_hidden_cols)
       AND ui_type <> 'hidden';

    GET DIAGNOSTICS v_hidden = ROW_COUNT;
    RAISE NOTICE '[Step 3] Internal columns → ui_type=hidden: % rows', v_hidden;

    -- ─── Step 4: Mark introspected non-system fields as standard ─────────
    -- Fields created by introspection (created_by='system') that are still
    -- 'business' are standard entity fields, not user-created custom fields.
    UPDATE meta.field
       SET origin     = 'standard',
           updated_at = now()
     WHERE origin = 'business'
       AND created_by = 'system';

    GET DIAGNOSTICS v_standard = ROW_COUNT;
    RAISE NOTICE '[Step 4] Introspected fields → standard: % rows', v_standard;

    -- ─── Summary ─────────────────────────────────────────────────────────
    RAISE NOTICE '── Field origin update complete ──';
    RAISE NOTICE 'Total system fields:   %',
        (SELECT count(*) FROM meta.field WHERE origin = 'system');
    RAISE NOTICE 'Total standard fields: %',
        (SELECT count(*) FROM meta.field WHERE origin = 'standard');
    RAISE NOTICE 'Total custom fields:   %',
        (SELECT count(*) FROM meta.field WHERE origin = 'business');
END $$;
