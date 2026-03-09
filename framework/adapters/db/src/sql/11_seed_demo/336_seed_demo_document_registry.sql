/* ============================================================================
   Athyper v2.4 — DEMO SEED: Financial Document Registry (CN + DN)
   Table: fin.financial_document
   Dependencies: 331_seed_demo_credit_notes.sql, 332_seed_demo_debit_notes.sql

   Purchase invoices, payments, and journal entries are auto-synced to the
   financial_document registry via INSERT triggers (trg_fin_pi_sync_doc_registry,
   trg_fin_pay_sync_doc_registry, trg_fin_je_sync_doc_registry).

   Credit notes and debit notes do NOT have sync triggers, so this seed
   manually inserts registry rows for them to ensure complete document coverage.

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_currency text;
    v_sys_user uuid := '00000000-0000-0000-0000-000000000001'::uuid;

    -- Credit note cursor
    v_cn       RECORD;
    v_dn       RECORD;
    v_status   text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        -- ================================================================
        -- Credit Notes → financial_document
        -- ================================================================
        FOR v_cn IN
            SELECT cn.id, cn.txn_id, cn.entity_code, cn.credit_note_number,
                   cn.credit_note_date, cn.posting_date, cn.total_amount,
                   cn.currency_code, cn.status, cn.supplier_id,
                   cn.posted_at, cn.posted_by, cn.submitted_by
            FROM fin.credit_note cn
            WHERE cn.tenant_id = v_tenant
        LOOP
            -- Map CN status to canonical status
            CASE v_cn.status
                WHEN 'DRAFT' THEN v_status := 'DRAFT';
                WHEN 'SUBMITTED' THEN v_status := 'IN_REVIEW';
                WHEN 'APPROVED' THEN v_status := 'APPROVED';
                WHEN 'POSTED' THEN v_status := 'POSTED';
                WHEN 'APPLIED' THEN v_status := 'SETTLED';
                WHEN 'CANCELLED' THEN v_status := 'CANCELLED';
                WHEN 'FAILED' THEN v_status := 'FAILED';
                ELSE v_status := 'DRAFT';
            END CASE;

            INSERT INTO fin.financial_document (
                id, tenant_id, doc_id, txn_id, doc_type, doc_no,
                entity_code, source_module, source_table, source_ref_id,
                status, source_status,
                doc_date, posting_date,
                currency_code, total_amount,
                counterparty_type, counterparty_id,
                posted_at, posted_by,
                created_by, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_tenant, v_cn.id, v_cn.txn_id,
                'CREDIT_NOTE', v_cn.credit_note_number,
                v_cn.entity_code, 'finance.accounting', 'fin.credit_note', v_cn.id,
                v_status, v_cn.status,
                v_cn.credit_note_date, v_cn.posting_date,
                v_cn.currency_code, v_cn.total_amount,
                'SUPPLIER', v_cn.supplier_id,
                v_cn.posted_at, v_cn.posted_by,
                COALESCE(v_cn.submitted_by, v_sys_user), now(), now()
            )
            ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
                status        = EXCLUDED.status,
                source_status = EXCLUDED.source_status,
                updated_at    = now();
        END LOOP;

        -- ================================================================
        -- Debit Notes → financial_document
        -- ================================================================
        FOR v_dn IN
            SELECT dn.id, dn.txn_id, dn.entity_code, dn.debit_note_number,
                   dn.debit_note_date, dn.posting_date, dn.total_amount,
                   dn.currency_code, dn.status, dn.supplier_id,
                   dn.posted_at, dn.posted_by, dn.submitted_by
            FROM fin.debit_note dn
            WHERE dn.tenant_id = v_tenant
        LOOP
            CASE v_dn.status
                WHEN 'DRAFT' THEN v_status := 'DRAFT';
                WHEN 'SUBMITTED' THEN v_status := 'IN_REVIEW';
                WHEN 'APPROVED' THEN v_status := 'APPROVED';
                WHEN 'POSTED' THEN v_status := 'POSTED';
                WHEN 'CANCELLED' THEN v_status := 'CANCELLED';
                WHEN 'FAILED' THEN v_status := 'FAILED';
                ELSE v_status := 'DRAFT';
            END CASE;

            INSERT INTO fin.financial_document (
                id, tenant_id, doc_id, txn_id, doc_type, doc_no,
                entity_code, source_module, source_table, source_ref_id,
                status, source_status,
                doc_date, posting_date,
                currency_code, total_amount,
                counterparty_type, counterparty_id,
                posted_at, posted_by,
                created_by, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_tenant, v_dn.id, v_dn.txn_id,
                'DEBIT_NOTE', v_dn.debit_note_number,
                v_dn.entity_code, 'finance.accounting', 'fin.debit_note', v_dn.id,
                v_status, v_dn.status,
                v_dn.debit_note_date, v_dn.posting_date,
                v_dn.currency_code, v_dn.total_amount,
                'SUPPLIER', v_dn.supplier_id,
                v_dn.posted_at, v_dn.posted_by,
                COALESCE(v_dn.submitted_by, v_sys_user), now(), now()
            )
            ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
                status        = EXCLUDED.status,
                source_status = EXCLUDED.source_status,
                updated_at    = now();
        END LOOP;

        RAISE NOTICE 'Document registry (CN + DN) seeded for tenant %', v_code;
    END LOOP;
END $$;
