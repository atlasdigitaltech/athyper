/* ============================================================================
   Athyper — Entity Operations & Lifecycles for Future Finance Document Types

   Seeds entity registrations, short codes, operation capabilities, and lifecycle
   bindings for finance document types that exist in the document registry but
   were not yet fully registered in the meta engine:

     - CreditNote         (CREDIT_NOTE)
     - DebitNote           (DEBIT_NOTE)
     - AccrualDocument     (ACCRUAL)
     - ReclassDocument     (RECLASS)
     - FxRevaluation       (FX_REVALUATION)     — already registered as audit_only
     - IcElimination       (IC_ELIMINATION)      — already registered as audit_only

   Also seeds lifecycle definitions for each (LC-23 through LC-26).

   Dependencies:
     - 300_meta_entity_registration.sql (existing registrations)
     - 302_seed_entity_config.sql (pg_temp.seed_entity_op helper)
     - 317_seed_finance_document_lifecycles.sql
   ============================================================================ */

-- ============================================================================
-- §1  Register new finance document entities in meta.entity
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP
        -- Credit Note — full governance, posting-engine owned
        INSERT INTO meta.entity (
            tenant_id, module_id, name, kind, table_schema, table_name,
            governance_level, engine_tag, entity_short,
            identity_config, feature_flags, created_by
        ) VALUES (
            v_tenant, 'ACC', 'CreditNote', 'doc', 'fin', 'credit_note',
            'full', 'posting-engine', 'CN',
            '{"primaryLabelField": "doc_number", "primaryCodeField": "doc_number", "displayTemplate": "{doc_number} – {supplier_name}"}'::jsonb,
            '{"hasApproval": true, "hasPosting": true, "hasSettlement": true}'::jsonb,
            'system'
        ) ON CONFLICT DO NOTHING;

        -- Debit Note — full governance, posting-engine owned
        INSERT INTO meta.entity (
            tenant_id, module_id, name, kind, table_schema, table_name,
            governance_level, engine_tag, entity_short,
            identity_config, feature_flags, created_by
        ) VALUES (
            v_tenant, 'ACC', 'DebitNote', 'doc', 'fin', 'debit_note',
            'full', 'posting-engine', 'DN',
            '{"primaryLabelField": "doc_number", "primaryCodeField": "doc_number", "displayTemplate": "{doc_number} – {counterparty_name}"}'::jsonb,
            '{"hasApproval": true, "hasPosting": true}'::jsonb,
            'system'
        ) ON CONFLICT DO NOTHING;

        -- Accrual Document — full governance, posting-engine owned
        INSERT INTO meta.entity (
            tenant_id, module_id, name, kind, table_schema, table_name,
            governance_level, engine_tag, entity_short,
            identity_config, feature_flags, created_by
        ) VALUES (
            v_tenant, 'ACC', 'AccrualDocument', 'doc', 'fin', 'accrual_document',
            'full', 'posting-engine', 'ACR',
            '{"primaryLabelField": "doc_number", "primaryCodeField": "doc_number", "displayTemplate": "{doc_number} – {description}"}'::jsonb,
            '{"hasApproval": false, "hasPosting": true, "hasReversal": true}'::jsonb,
            'system'
        ) ON CONFLICT DO NOTHING;

        -- Reclass Document — full governance, posting-engine owned
        INSERT INTO meta.entity (
            tenant_id, module_id, name, kind, table_schema, table_name,
            governance_level, engine_tag, entity_short,
            identity_config, feature_flags, created_by
        ) VALUES (
            v_tenant, 'ACC', 'ReclassDocument', 'doc', 'fin', 'reclass_document',
            'full', 'posting-engine', 'RCL',
            '{"primaryLabelField": "doc_number", "primaryCodeField": "doc_number", "displayTemplate": "{doc_number} – {description}"}'::jsonb,
            '{"hasApproval": true, "hasPosting": true, "hasReversal": true}'::jsonb,
            'system'
        ) ON CONFLICT DO NOTHING;

        -- IcElimination — upgrade from audit_only to full governance
        UPDATE meta.entity SET
            governance_level = 'full',
            entity_short = COALESCE(entity_short, 'ICELM'),
            feature_flags = '{"hasApproval": false, "hasPosting": true, "hasReversal": true}'::jsonb
        WHERE tenant_id = v_tenant AND name = 'ConsolidationElimination'
          AND governance_level = 'audit_only';

    END LOOP;
END $$;


-- ============================================================================
-- §2  Entity Operation Capabilities (system defaults)
-- ============================================================================
-- Reuse the seed helper from 302_seed_entity_config.sql
CREATE OR REPLACE FUNCTION pg_temp.seed_entity_op(
  p_entity_name text,
  p_op_code     text,
  p_surface     text DEFAULT 'BOTH',
  p_placement   text DEFAULT 'TOOLBAR',
  p_handler     text DEFAULT 'API',
  p_target      text DEFAULT NULL,
  p_req_record  boolean DEFAULT false,
  p_sort        int DEFAULT 0,
  p_label       text DEFAULT NULL,
  p_tcode       text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO meta.entity_operation
    (tenant_id, entity_name, operation_code, surface, placement,
     handler_type, handler_target, requires_record, sort_order,
     label_override, tcode_alias, created_by)
  VALUES
    (NULL, p_entity_name, p_op_code, p_surface, p_placement,
     p_handler, p_target, p_req_record, p_sort,
     p_label, p_tcode, 'system')
  ON CONFLICT (entity_name, operation_code) WHERE tenant_id IS NULL DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- CreditNote (DRAFT → SUBMITTED → APPROVED → POSTED → APPLIED)
SELECT pg_temp.seed_entity_op('CreditNote', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Credit Note');
SELECT pg_temp.seed_entity_op('CreditNote', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CreditNote', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CreditNote', 'submit',  'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Submit Credit Note');
SELECT pg_temp.seed_entity_op('CreditNote', 'approve', 'DETAIL', 'PRIMARY',  'API',      NULL, true,  5,  'Approve Credit Note');
SELECT pg_temp.seed_entity_op('CreditNote', 'deny',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  6,  'Reject Credit Note');
SELECT pg_temp.seed_entity_op('CreditNote', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  7,  'Post Credit Note');
SELECT pg_temp.seed_entity_op('CreditNote', 'cancel',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);
SELECT pg_temp.seed_entity_op('CreditNote', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 9);
SELECT pg_temp.seed_entity_op('CreditNote', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 10);

-- DebitNote (DRAFT → SUBMITTED → APPROVED → POSTED)
SELECT pg_temp.seed_entity_op('DebitNote', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Debit Note');
SELECT pg_temp.seed_entity_op('DebitNote', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('DebitNote', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('DebitNote', 'submit',  'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Submit Debit Note');
SELECT pg_temp.seed_entity_op('DebitNote', 'approve', 'DETAIL', 'PRIMARY',  'API',      NULL, true,  5,  'Approve Debit Note');
SELECT pg_temp.seed_entity_op('DebitNote', 'deny',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  6,  'Reject Debit Note');
SELECT pg_temp.seed_entity_op('DebitNote', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  7,  'Post Debit Note');
SELECT pg_temp.seed_entity_op('DebitNote', 'cancel',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);
SELECT pg_temp.seed_entity_op('DebitNote', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 9);
SELECT pg_temp.seed_entity_op('DebitNote', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 10);

-- AccrualDocument (DRAFT → POSTED → REVERSED)
SELECT pg_temp.seed_entity_op('AccrualDocument', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Accrual');
SELECT pg_temp.seed_entity_op('AccrualDocument', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('AccrualDocument', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  3,  'Post Accrual');
SELECT pg_temp.seed_entity_op('AccrualDocument', 'reverse', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4,  'Reverse Accrual');
SELECT pg_temp.seed_entity_op('AccrualDocument', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 5);
SELECT pg_temp.seed_entity_op('AccrualDocument', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 6);

-- ReclassDocument (DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED)
SELECT pg_temp.seed_entity_op('ReclassDocument', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ReclassDocument', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('ReclassDocument', 'submit',  'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Submit Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'approve', 'DETAIL', 'PRIMARY',  'API',      NULL, true,  5,  'Approve Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'deny',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  6,  'Reject Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  7,  'Post Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'reverse', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8,  'Reverse Reclass');
SELECT pg_temp.seed_entity_op('ReclassDocument', 'cancel',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  9);
SELECT pg_temp.seed_entity_op('ReclassDocument', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 10);

-- FxRevaluation (already registered, add operation capabilities)
SELECT pg_temp.seed_entity_op('FxRevaluation', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New FX Reval');
SELECT pg_temp.seed_entity_op('FxRevaluation', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('FxRevaluation', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  3,  'Post FX Reval');
SELECT pg_temp.seed_entity_op('FxRevaluation', 'reverse', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4,  'Reverse FX Reval');
SELECT pg_temp.seed_entity_op('FxRevaluation', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ConsolidationElimination (IC Elimination)
SELECT pg_temp.seed_entity_op('ConsolidationElimination', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New IC Elimination');
SELECT pg_temp.seed_entity_op('ConsolidationElimination', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ConsolidationElimination', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  3,  'Post Elimination');
SELECT pg_temp.seed_entity_op('ConsolidationElimination', 'reverse', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4,  'Reverse Elimination');
SELECT pg_temp.seed_entity_op('ConsolidationElimination', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 5);


-- ============================================================================
-- §3  Lifecycle Definitions for Future Document Types
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_lc_id  uuid;
    v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid;
    v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- LC-23: FIN_CREDIT_NOTE
        -- DRAFT → SUBMITTED → APPROVED → POSTED → APPLIED → CANCELLED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_CREDIT_NOTE', 'Credit Note Lifecycle',
                'Approval-gated credit note with application tracking', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',     'Draft',     false, 10, '{"editable": true}'::jsonb,  'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUBMITTED', 'Submitted', false, 20, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',  'Approved',  false, 30, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',    'Posted',    false, 40, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPLIED',   'Applied',   true,  50, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s5;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CANCELLED', 'Cancelled', true,  60, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s6;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'submit',  'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'approve', 'system') RETURNING id INTO v_t2;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s1, 'deny',    'system');
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s3, v_s4, 'post',    'system') RETURNING id INTO v_t3;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s5, 'reconcile', 'system');
            -- Cancellation
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s6, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s6, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s6, 'cancel', 'system');

            -- Gates
            INSERT INTO meta.lifecycle_transition_gate (tenant_id, transition_id, conditions, created_by) VALUES
                (v_tenant, v_t2, '{"type": "approval_required"}'::jsonb, 'system'),
                (v_tenant, v_t3, '{"type": "period_gate"}'::jsonb, 'system');

            -- Hooks
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'lock_document',
                 '{"reason": "submitted"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'create_journal_entry',
                 '{"posting_mode": "auto", "source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'emit_event',
                 '{"event_type": "finance.credit_note.posted"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'CreditNote', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-24: FIN_DEBIT_NOTE
        -- DRAFT → SUBMITTED → APPROVED → POSTED → CANCELLED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_DEBIT_NOTE', 'Debit Note Lifecycle',
                'Approval-gated debit note', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',     'Draft',     false, 10, '{"editable": true}'::jsonb,  'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUBMITTED', 'Submitted', false, 20, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',  'Approved',  false, 30, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',    'Posted',    true,  40, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CANCELLED', 'Cancelled', true,  50, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s5;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'submit',  'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'approve', 'system') RETURNING id INTO v_t2;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s1, 'deny',    'system');
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s3, v_s4, 'post',    'system') RETURNING id INTO v_t3;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s5, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s5, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s5, 'cancel', 'system');

            INSERT INTO meta.lifecycle_transition_gate (tenant_id, transition_id, conditions, created_by) VALUES
                (v_tenant, v_t2, '{"type": "approval_required"}'::jsonb, 'system'),
                (v_tenant, v_t3, '{"type": "period_gate"}'::jsonb, 'system');

            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'lock_document',
                 '{"reason": "submitted"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'create_journal_entry',
                 '{"posting_mode": "auto", "source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'emit_event',
                 '{"event_type": "finance.debit_note.posted"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'DebitNote', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-25: FIN_ACCRUAL — Simple post-reversal lifecycle (no approval)
        -- DRAFT → POSTED → REVERSED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_ACCRUAL', 'Accrual Document Lifecycle',
                'Simple posting lifecycle for accrual entries', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',    'Draft',    false, 10, '{"editable": true}'::jsonb,  'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',   'Posted',   false, 20, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'REVERSED', 'Reversed', true,  30, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s3;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'post',    'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'reverse', 'system') RETURNING id INTO v_t2;

            INSERT INTO meta.lifecycle_transition_gate (tenant_id, transition_id, conditions, created_by) VALUES
                (v_tenant, v_t1, '{"type": "period_gate"}'::jsonb, 'system'),
                (v_tenant, v_t2, '{"type": "period_gate"}'::jsonb, 'system');

            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t1, 'on_success', 'emit_event',
                 '{"event_type": "finance.accrual.posted"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t2, 'on_success', 'create_reversal_entry',
                 '{"source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t2, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t2, 'on_success', 'emit_event',
                 '{"event_type": "finance.accrual.reversed"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'AccrualDocument', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-26: FIN_RECLASS — Approval-gated reclass with reversal
        -- DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_RECLASS', 'Reclass Document Lifecycle',
                'Approval-gated reclassification with reversal', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',     'Draft',     false, 10, '{"editable": true}'::jsonb,  'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUBMITTED', 'Submitted', false, 20, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',  'Approved',  false, 30, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'POSTED',    'Posted',    false, 40, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'REVERSED',  'Reversed',  true,  50, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s5;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'CANCELLED', 'Cancelled', true,  60, '{"editable": false}'::jsonb, 'system') RETURNING id INTO v_s6;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'submit',  'system') RETURNING id INTO v_t1;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s3, 'approve', 'system') RETURNING id INTO v_t2;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s2, v_s1, 'deny',    'system');
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s3, v_s4, 'post',    'system') RETURNING id INTO v_t3;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s4, v_s5, 'reverse', 'system') RETURNING id INTO v_t4;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s6, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s6, 'cancel', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s6, 'cancel', 'system');

            INSERT INTO meta.lifecycle_transition_gate (tenant_id, transition_id, conditions, created_by) VALUES
                (v_tenant, v_t2, '{"type": "approval_required"}'::jsonb, 'system'),
                (v_tenant, v_t3, '{"type": "period_gate"}'::jsonb, 'system'),
                (v_tenant, v_t4, '{"type": "period_gate"}'::jsonb, 'system');

            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t1, 'on_success', 'lock_document',
                 '{"reason": "submitted"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'create_journal_entry',
                 '{"posting_mode": "auto", "source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t3, 'on_success', 'emit_event',
                 '{"event_type": "finance.reclass.posted"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'create_reversal_entry',
                 '{"source_module": "finance.accounting"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'sync_document_registry',
                 '{"registry_table": "fin.financial_document"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'narrowable'),
                (v_tenant, v_t4, 'on_success', 'emit_event',
                 '{"event_type": "finance.reclass.reversed"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'narrowable');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'ReclassDocument', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

    END LOOP;

    RAISE NOTICE 'Future finance document lifecycles seeded. New lifecycles: %, New entity bindings: %',
        (SELECT count(*) FROM meta.lifecycle WHERE code IN ('FIN_CREDIT_NOTE', 'FIN_DEBIT_NOTE', 'FIN_ACCRUAL', 'FIN_RECLASS')),
        (SELECT count(*) FROM meta.entity_lifecycle WHERE entity_name IN ('CreditNote', 'DebitNote', 'AccrualDocument', 'ReclassDocument'));
END $$;
