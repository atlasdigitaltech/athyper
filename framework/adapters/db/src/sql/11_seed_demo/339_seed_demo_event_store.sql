/* ============================================================================
   Athyper v2.4 — DEMO SEED: Event Store Entries
   Table: evt.event (partitioned by month)
   Dependencies: 330–334 (invoices, credit notes, debit notes, payments, JEs)

   Seeds representative domain events for each demo tenant:
     - INVOICE lifecycle events (created, approved, posted, paid)
     - PAYMENT lifecycle events (created, posted, reconciled)
     - JOURNAL_ENTRY lifecycle events (created, posted)
     - PERIOD_CLOSE lifecycle events (opened, soft_closed, hard_closed)

   Events are inserted into the current month's partition (auto-created by
   150_event_store.sql). The seed uses now()-based timestamps to ensure
   partition alignment.

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

-- Ensure current month partition exists
DO $$
DECLARE
    m_start date := date_trunc('month', current_date)::date;
    m_end   date := (date_trunc('month', current_date) + interval '1 month')::date;
    p_name  text := 'evt_event_' || to_char(current_date, 'YYYY_MM');
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'evt' AND c.relname = p_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE evt.%I PARTITION OF evt.event FOR VALUES FROM (%L) TO (%L)',
            p_name, m_start, m_end
        );
    END IF;
END $$;

DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_ou_id      uuid;
    v_sys_user   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_now        timestamptz := now();
    v_seq        bigint;
    v_pi         RECORD;
    v_pay        RECORD;
    v_je         RECORD;
    v_corr_id    uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT entity_code, id INTO v_entity, v_ou_id
        FROM fin.operating_unit WHERE tenant_id = v_tenant ORDER BY entity_code, level LIMIT 1;
        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Initialize sequence counters
        INSERT INTO evt.sequence_counter (tenant_id, partition_domain, partition_key, current_seq)
        VALUES (v_tenant, 'finance', v_entity, 0)
        ON CONFLICT (tenant_id, partition_domain, partition_key) DO NOTHING;

        -- ================================================================
        -- Purchase Invoice events (first 5 invoices — lifecycle snapshots)
        -- ================================================================
        FOR v_pi IN
            SELECT id, txn_id, invoice_number, status
            FROM fin.purchase_invoice
            WHERE tenant_id = v_tenant AND entity_code = v_entity
            ORDER BY invoice_number LIMIT 5
        LOOP
            v_corr_id := gen_random_uuid();
            v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);

            INSERT INTO evt.event (
                event_type, event_version, created_at, source_engine,
                txn_id, doc_id, doc_type, correlation_id, causation_id,
                actor_type, actor_id, tenant_id, entity_code, ou_id,
                payload, payload_hash, metadata,
                partition_domain, partition_key, sequence_no
            ) VALUES (
                'finance.invoice.created', 'v2.4', v_now - interval '20 days', 'posting-engine',
                v_pi.txn_id, v_pi.id, 'INVOICE', v_corr_id, NULL,
                'USER', v_sys_user, v_tenant, v_entity, v_ou_id,
                jsonb_build_object('invoice_number', v_pi.invoice_number, 'action', 'CREATED'),
                md5(v_pi.id::text || 'created'), '{"source": "demo_seed"}',
                'finance', v_entity, v_seq
            );

            -- Posted event
            IF v_pi.status IN ('POSTED', 'PAID', 'PARTIALLY_PAID') THEN
                v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
                INSERT INTO evt.event (
                    event_type, event_version, created_at, source_engine,
                    txn_id, doc_id, doc_type, correlation_id, causation_id,
                    actor_type, actor_id, tenant_id, entity_code, ou_id,
                    payload, payload_hash, metadata,
                    partition_domain, partition_key, sequence_no
                ) VALUES (
                    'finance.invoice.posted', 'v2.4', v_now - interval '18 days', 'posting-engine',
                    v_pi.txn_id, v_pi.id, 'INVOICE', v_corr_id, NULL,
                    'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
                    jsonb_build_object('invoice_number', v_pi.invoice_number, 'action', 'POSTED'),
                    md5(v_pi.id::text || 'posted'), '{"source": "demo_seed"}',
                    'finance', v_entity, v_seq
                );
            END IF;
        END LOOP;

        -- ================================================================
        -- Payment events (first 3 payments)
        -- ================================================================
        FOR v_pay IN
            SELECT id, txn_id, payment_number, status
            FROM fin.payment_entry
            WHERE tenant_id = v_tenant AND entity_code = v_entity
            ORDER BY payment_number LIMIT 3
        LOOP
            v_corr_id := gen_random_uuid();
            v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);

            INSERT INTO evt.event (
                event_type, event_version, created_at, source_engine,
                txn_id, doc_id, doc_type, correlation_id, causation_id,
                actor_type, actor_id, tenant_id, entity_code, ou_id,
                payload, payload_hash, metadata,
                partition_domain, partition_key, sequence_no
            ) VALUES (
                'finance.payment.created', 'v2.4', v_now - interval '15 days', 'posting-engine',
                v_pay.txn_id, v_pay.id, 'PAYMENT', v_corr_id, NULL,
                'USER', v_sys_user, v_tenant, v_entity, v_ou_id,
                jsonb_build_object('payment_number', v_pay.payment_number, 'action', 'CREATED'),
                md5(v_pay.id::text || 'created'), '{"source": "demo_seed"}',
                'finance', v_entity, v_seq
            );

            IF v_pay.status IN ('POSTED', 'RECONCILED') THEN
                v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
                INSERT INTO evt.event (
                    event_type, event_version, created_at, source_engine,
                    txn_id, doc_id, doc_type, correlation_id, causation_id,
                    actor_type, actor_id, tenant_id, entity_code, ou_id,
                    payload, payload_hash, metadata,
                    partition_domain, partition_key, sequence_no
                ) VALUES (
                    'finance.payment.posted', 'v2.4', v_now - interval '14 days', 'posting-engine',
                    v_pay.txn_id, v_pay.id, 'PAYMENT', v_corr_id, NULL,
                    'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
                    jsonb_build_object('payment_number', v_pay.payment_number, 'action', 'POSTED'),
                    md5(v_pay.id::text || 'posted'), '{"source": "demo_seed"}',
                    'finance', v_entity, v_seq
                );
            END IF;
        END LOOP;

        -- ================================================================
        -- Journal Entry events (first 3 JEs)
        -- ================================================================
        FOR v_je IN
            SELECT id, txn_id, je_number, status
            FROM fin.journal_entry
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND doc_type LIKE 'MANUAL_%'
            ORDER BY je_number LIMIT 3
        LOOP
            v_corr_id := gen_random_uuid();
            v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);

            INSERT INTO evt.event (
                event_type, event_version, created_at, source_engine,
                txn_id, doc_id, doc_type, correlation_id, causation_id,
                actor_type, actor_id, tenant_id, entity_code, ou_id,
                payload, payload_hash, metadata,
                partition_domain, partition_key, sequence_no
            ) VALUES (
                'finance.journal.created', 'v2.4', v_now - interval '12 days', 'posting-engine',
                v_je.txn_id, v_je.id, 'JE', v_corr_id, NULL,
                'USER', v_sys_user, v_tenant, v_entity, v_ou_id,
                jsonb_build_object('entry_number', v_je.je_number, 'action', 'CREATED'),
                md5(v_je.id::text || 'created'), '{"source": "demo_seed"}',
                'finance', v_entity, v_seq
            );

            IF v_je.status = 'POSTED' THEN
                v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
                INSERT INTO evt.event (
                    event_type, event_version, created_at, source_engine,
                    txn_id, doc_id, doc_type, correlation_id, causation_id,
                    actor_type, actor_id, tenant_id, entity_code, ou_id,
                    payload, payload_hash, metadata,
                    partition_domain, partition_key, sequence_no
                ) VALUES (
                    'finance.journal.posted', 'v2.4', v_now - interval '11 days', 'posting-engine',
                    v_je.txn_id, v_je.id, 'JE', v_corr_id, NULL,
                    'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
                    jsonb_build_object('entry_number', v_je.je_number, 'action', 'POSTED'),
                    md5(v_je.id::text || 'posted'), '{"source": "demo_seed"}',
                    'finance', v_entity, v_seq
                );
            END IF;
        END LOOP;

        -- ================================================================
        -- Period close lifecycle events
        -- ================================================================
        v_corr_id := gen_random_uuid();

        -- P1 hard closed
        v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
        INSERT INTO evt.event (
            event_type, event_version, created_at, source_engine,
            txn_id, doc_id, doc_type, correlation_id, causation_id,
            actor_type, actor_id, tenant_id, entity_code, ou_id,
            payload, payload_hash, metadata,
            partition_domain, partition_key, sequence_no
        ) VALUES (
            'finance.period.hard_closed', 'v2.4', v_now - interval '30 days', 'posting-engine',
            gen_random_uuid(), gen_random_uuid(), 'OTHER', v_corr_id, NULL,
            'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
            jsonb_build_object('fiscal_year', 2026, 'period', 1, 'action', 'HARD_CLOSE'),
            md5(v_tenant::text || '2026_P1_hard'), '{"source": "demo_seed"}',
            'finance', v_entity, v_seq
        );

        -- P2 soft closed
        v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
        INSERT INTO evt.event (
            event_type, event_version, created_at, source_engine,
            txn_id, doc_id, doc_type, correlation_id, causation_id,
            actor_type, actor_id, tenant_id, entity_code, ou_id,
            payload, payload_hash, metadata,
            partition_domain, partition_key, sequence_no
        ) VALUES (
            'finance.period.soft_closed', 'v2.4', v_now - interval '2 days', 'posting-engine',
            gen_random_uuid(), gen_random_uuid(), 'OTHER', v_corr_id, NULL,
            'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
            jsonb_build_object('fiscal_year', 2026, 'period', 2, 'action', 'SOFT_CLOSE'),
            md5(v_tenant::text || '2026_P2_soft'), '{"source": "demo_seed"}',
            'finance', v_entity, v_seq
        );

        -- P3 opened
        v_seq := evt.next_sequence(v_tenant, 'finance', v_entity);
        INSERT INTO evt.event (
            event_type, event_version, created_at, source_engine,
            txn_id, doc_id, doc_type, correlation_id, causation_id,
            actor_type, actor_id, tenant_id, entity_code, ou_id,
            payload, payload_hash, metadata,
            partition_domain, partition_key, sequence_no
        ) VALUES (
            'finance.period.opened', 'v2.4', v_now - interval '5 days', 'posting-engine',
            gen_random_uuid(), gen_random_uuid(), 'OTHER', v_corr_id, NULL,
            'SYSTEM', v_sys_user, v_tenant, v_entity, v_ou_id,
            jsonb_build_object('fiscal_year', 2026, 'period', 3, 'action', 'OPEN'),
            md5(v_tenant::text || '2026_P3_open'), '{"source": "demo_seed"}',
            'finance', v_entity, v_seq
        );

        RAISE NOTICE 'Event store entries (~25) seeded for tenant %', v_code;
    END LOOP;
END $$;
