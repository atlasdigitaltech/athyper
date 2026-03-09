/* ============================================================================
   Athyper — Finance Document Lifecycle Definitions & Entity Bindings

   Seeds lifecycle state machines for finance transactional documents and binds
   them to their registered meta.entity rows. This integrates the financial
   document registry with the meta engine's lifecycle governance.

   Lifecycle codes:
     LC-20: FIN_PURCHASE_INVOICE
       DRAFT → SUBMITTED → APPROVED → POSTED → PARTIALLY_PAID → PAID → CANCELLED

     LC-21: FIN_PAYMENT_ENTRY
       DRAFT → SUBMITTED → APPROVED → POSTED → RECONCILED → VOIDED/CANCELLED

     LC-22: FIN_JOURNAL_ENTRY
       CREATED → POSTED → REVERSED

   Dependencies:
     - meta.lifecycle, meta.lifecycle_state, meta.lifecycle_transition
     - meta.lifecycle_transition_gate, meta.lifecycle_transition_hook
     - meta.entity_lifecycle
     - 300_meta_entity_registration.sql (needs entity rows)
     - 315_meta_entity_lifecycles.sql (established pattern)
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_lc_id  uuid;
    v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
    v_s5 uuid; v_s6 uuid; v_s7 uuid;
    v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;
    v_t5 uuid; v_t6 uuid; v_t7 uuid; v_t8 uuid;
    v_t9 uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- LC-20: FIN_PURCHASE_INVOICE
        -- DRAFT → SUBMITTED → APPROVED → POSTED → PARTIALLY_PAID → PAID
        --   ↘ CANCELLED (from DRAFT, SUBMITTED, APPROVED)
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_PURCHASE_INVOICE', 'Purchase Invoice Lifecycle',
                'Full document lifecycle for purchase invoices with approval gate and settlement tracking', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN

            -- States
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',          'Draft',           false, 10,
                 '{"editable": true, "description": "Editable working copy"}'::jsonb, 'system')
                RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUBMITTED',      'Submitted',       false, 20,
                 '{"editable": false, "description": "Submitted for review, locked for edits"}'::jsonb, 'system')
                RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',       'Approved',        false, 30,
                 '{"editable": false, "description": "Approved, ready for posting"}'::jsonb, 'system')
                RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',         'Posted',          false, 40,
                 '{"editable": false, "description": "Posted to general ledger"}'::jsonb, 'system')
                RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'PARTIALLY_PAID', 'Partially Paid',  false, 50,
                 '{"editable": false, "description": "Partial payment allocated"}'::jsonb, 'system')
                RETURNING id INTO v_s5;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'PAID',           'Paid',            true,  60,
                 '{"editable": false, "description": "Fully settled"}'::jsonb, 'system')
                RETURNING id INTO v_s6;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CANCELLED',      'Cancelled',       true,  70,
                 '{"editable": false, "description": "Document cancelled"}'::jsonb, 'system')
                RETURNING id INTO v_s7;

            -- Transitions (happy path)
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'submit',  'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'approve', 'system') RETURNING id INTO v_t2;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s1, 'deny',    'system') RETURNING id INTO v_t3;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s3, v_s4, 'post',    'system') RETURNING id INTO v_t4;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s5, 'reconcile', 'system') RETURNING id INTO v_t5;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s5, v_s6, 'reconcile', 'system') RETURNING id INTO v_t6;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s6, 'reconcile', 'system') RETURNING id INTO v_t7;

            -- Cancellation transitions
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s7, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s7, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s7, 'cancel', 'system');

            -- ================================================================
            -- Transition Gates
            -- ================================================================

            -- submit: require all mandatory fields populated
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t1,
                 '{"type": "field_validation", "rules": ["supplier_id IS NOT NULL", "total_amount > 0", "invoice_date IS NOT NULL"]}'::jsonb,
                 'system');

            -- approve: require approval workflow
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t2,
                 '{"type": "approval_required", "description": "Approval gate — routed via decision grid"}'::jsonb,
                 'system');

            -- post: require fiscal period is OPEN
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t4,
                 '{"type": "period_gate", "description": "Fiscal period must be OPEN for posting date"}'::jsonb,
                 'system');

            -- ================================================================
            -- Transition Hooks (side effects)
            -- ================================================================

            -- submit: lock document for edits
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'lock_document',
                 '{"reason": "submitted_for_approval"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t1, 'on_success', 'emit_event',
                 '{"event_type": "finance.invoice.submitted"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- approve: emit approval event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t2, 'on_success', 'emit_event',
                 '{"event_type": "finance.invoice.approved"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- deny: unlock document, return to draft
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t3, 'on_success', 'unlock_document',
                 '{"reason": "approval_denied"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'emit_event',
                 '{"event_type": "finance.invoice.denied"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- post: create journal entry, sync document registry, emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t4, 'on_success', 'create_journal_entry',
                 '{"posting_mode": "auto", "source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'emit_event',
                 '{"event_type": "finance.invoice.posted"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- Entity binding
            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'PurchaseInvoice', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;

        END IF;

        -- ====================================================================
        -- LC-21: FIN_PAYMENT_ENTRY
        -- DRAFT → SUBMITTED → APPROVED → POSTED → RECONCILED
        --   ↘ VOIDED (from POSTED)
        --   ↘ CANCELLED (from DRAFT, SUBMITTED, APPROVED)
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_PAYMENT_ENTRY', 'Payment Entry Lifecycle',
                'Full document lifecycle for payment entries with approval gate and reconciliation', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN

            -- States
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',       'Draft',       false, 10,
                 '{"editable": true, "description": "Editable working copy"}'::jsonb, 'system')
                RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUBMITTED',   'Submitted',   false, 20,
                 '{"editable": false, "description": "Submitted for review"}'::jsonb, 'system')
                RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',    'Approved',    false, 30,
                 '{"editable": false, "description": "Approved, ready for posting"}'::jsonb, 'system')
                RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',      'Posted',      false, 40,
                 '{"editable": false, "description": "Posted to general ledger"}'::jsonb, 'system')
                RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'RECONCILED',  'Reconciled',  true,  50,
                 '{"editable": false, "description": "Matched against bank statement"}'::jsonb, 'system')
                RETURNING id INTO v_s5;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'VOIDED',      'Voided',      true,  60,
                 '{"editable": false, "description": "Payment voided after posting"}'::jsonb, 'system')
                RETURNING id INTO v_s6;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CANCELLED',   'Cancelled',   true,  70,
                 '{"editable": false, "description": "Payment cancelled before posting"}'::jsonb, 'system')
                RETURNING id INTO v_s7;

            -- Transitions (happy path)
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'submit',    'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'approve',   'system') RETURNING id INTO v_t2;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s1, 'deny',      'system') RETURNING id INTO v_t3;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s3, v_s4, 'post',      'system') RETURNING id INTO v_t4;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s5, 'reconcile', 'system') RETURNING id INTO v_t5;

            -- Void (only from POSTED)
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s6, 'reverse',   'system') RETURNING id INTO v_t6;

            -- Cancellation transitions
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s7, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s7, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s7, 'cancel', 'system');

            -- ================================================================
            -- Transition Gates
            -- ================================================================

            -- submit: require payment allocations
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t1,
                 '{"type": "field_validation", "rules": ["supplier_id IS NOT NULL", "total_amount > 0", "payment_method IS NOT NULL"]}'::jsonb,
                 'system');

            -- approve: require approval workflow
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t2,
                 '{"type": "approval_required", "description": "Approval gate — routed via decision grid"}'::jsonb,
                 'system');

            -- post: require fiscal period is OPEN
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t4,
                 '{"type": "period_gate", "description": "Fiscal period must be OPEN for payment date"}'::jsonb,
                 'system');

            -- void: require void reason
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t6,
                 '{"type": "field_validation", "rules": ["void_reason IS NOT NULL"]}'::jsonb,
                 'system');

            -- ================================================================
            -- Transition Hooks
            -- ================================================================

            -- submit: lock document
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'lock_document',
                 '{"reason": "submitted_for_approval"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t1, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.submitted"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- approve: emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t2, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.approved"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- deny: unlock document
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t3, 'on_success', 'unlock_document',
                 '{"reason": "approval_denied"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.denied"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- post: create journal entry, sync registry, emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t4, 'on_success', 'create_journal_entry',
                 '{"posting_mode": "auto", "source_module": "finance.payments"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.posted"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- reconcile: emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t5, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.reconciled"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- void: create reversal JE, sync registry, emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t6, 'on_success', 'create_reversal_entry',
                 '{"source_module": "finance.payments"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t6, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t6, 'on_success', 'emit_event',
                 '{"event_type": "finance.payment.voided"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- Entity binding
            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'PaymentEntry', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;

        END IF;

        -- ====================================================================
        -- LC-22: FIN_JOURNAL_ENTRY
        -- CREATED → POSTED → REVERSED
        -- Simpler lifecycle — manual JEs posted directly, no approval flow.
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_JOURNAL_ENTRY', 'Journal Entry Lifecycle',
                'Simple posting lifecycle for manual journal entries', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN

            -- States
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CREATED',  'Created',  false, 10,
                 '{"editable": true, "description": "Draft journal entry"}'::jsonb, 'system')
                RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',   'Posted',   false, 20,
                 '{"editable": false, "description": "Posted to general ledger"}'::jsonb, 'system')
                RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'REVERSED', 'Reversed', true,  30,
                 '{"editable": false, "description": "Reversed via counter-entry"}'::jsonb, 'system')
                RETURNING id INTO v_s3;

            -- Transitions
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'post',    'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'reverse', 'system') RETURNING id INTO v_t2;

            -- ================================================================
            -- Transition Gates
            -- ================================================================

            -- post: require balanced debits/credits and fiscal period OPEN
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t1,
                 '{"type": "compound", "all": [{"type": "field_validation", "rules": ["total_debit = total_credit", "total_debit > 0"]}, {"type": "period_gate", "description": "Fiscal period must be OPEN for posting date"}]}'::jsonb,
                 'system');

            -- reverse: require reversal reason and period OPEN
            INSERT INTO meta.lifecycle_transition_gate
                (tenant_id, transition_id, conditions, created_by)
            VALUES
                (v_tenant, v_t2,
                 '{"type": "compound", "all": [{"type": "field_validation", "rules": ["reversal_reason IS NOT NULL"]}, {"type": "period_gate", "description": "Fiscal period must be OPEN for reversal date"}]}'::jsonb,
                 'system');

            -- ================================================================
            -- Transition Hooks
            -- ================================================================

            -- post: sync registry, emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t1, 'on_success', 'emit_event',
                 '{"event_type": "finance.journal.posted"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- reverse: create counter-entry, sync registry, emit event
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t2, 'on_success', 'create_reversal_entry',
                 '{"source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t2, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t2, 'on_success', 'emit_event',
                 '{"event_type": "finance.journal.reversed"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- Entity binding
            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'ManualJournalEntry', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;

        END IF;

    END LOOP;

    RAISE NOTICE 'Finance document lifecycles seeded. Lifecycles: %, States: %, Transitions: %, Gates: %, Hooks: %',
        (SELECT count(*) FROM meta.lifecycle WHERE code IN ('FIN_PURCHASE_INVOICE', 'FIN_PAYMENT_ENTRY', 'FIN_JOURNAL_ENTRY')),
        (SELECT count(*) FROM meta.lifecycle_state ls
         JOIN meta.lifecycle l ON ls.lifecycle_id = l.id WHERE l.code IN ('FIN_PURCHASE_INVOICE', 'FIN_PAYMENT_ENTRY', 'FIN_JOURNAL_ENTRY')),
        (SELECT count(*) FROM meta.lifecycle_transition lt
         JOIN meta.lifecycle l ON lt.lifecycle_id = l.id WHERE l.code IN ('FIN_PURCHASE_INVOICE', 'FIN_PAYMENT_ENTRY', 'FIN_JOURNAL_ENTRY')),
        (SELECT count(*) FROM meta.lifecycle_transition_gate tg
         JOIN meta.lifecycle_transition lt ON tg.transition_id = lt.id
         JOIN meta.lifecycle l ON lt.lifecycle_id = l.id WHERE l.code IN ('FIN_PURCHASE_INVOICE', 'FIN_PAYMENT_ENTRY', 'FIN_JOURNAL_ENTRY')),
        (SELECT count(*) FROM meta.lifecycle_transition_hook th
         JOIN meta.lifecycle_transition lt ON th.transition_id = lt.id
         JOIN meta.lifecycle l ON lt.lifecycle_id = l.id WHERE l.code IN ('FIN_PURCHASE_INVOICE', 'FIN_PAYMENT_ENTRY', 'FIN_JOURNAL_ENTRY'));
END $$;
