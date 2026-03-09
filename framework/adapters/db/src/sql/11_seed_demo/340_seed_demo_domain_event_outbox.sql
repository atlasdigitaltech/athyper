/* ============================================================================
   Athyper v2.4 — DEMO SEED: Domain Event Outbox
   Table: fin.domain_event_outbox
   Dependencies: 338_seed_demo_close_intelligence.sql

   Seeds representative domain events from BFF actions:
     - risk_signal.acknowledged (COMPLETED — already processed)
     - risk_signal.resolved (COMPLETED — already processed)
     - checklist.task_completed (COMPLETED — already processed)
     - checklist.task_failed (PENDING — awaiting worker pickup)
     - anomaly.acknowledged (PENDING — awaiting worker pickup)

   Demonstrates the full outbox lifecycle: PENDING → COMPLETED,
   plus a DEAD_LETTER entry for observability.

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_now      timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT entity_code INTO v_entity
        FROM fin.operating_unit WHERE tenant_id = v_tenant
        ORDER BY entity_code, level LIMIT 1;
        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Event 1: Risk signal acknowledged (COMPLETED)
        INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type,
            entity_code, aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload,
            status, retry_count,
            created_at, processed_at
        ) VALUES (
            v_tenant, 'close.risk_signal.acknowledged',
            v_entity, 'FAILED_24H', 'close_risk_signal',
            'controller@demo', 'USER', 'bff',
            gen_random_uuid(),
            jsonb_build_object(
                'rule_code', 'FAILED_24H',
                'fiscal_year', 2026,
                'period_number', 2,
                'acknowledged_by', 'controller@demo'
            ),
            'COMPLETED', 0,
            v_now - interval '4 hours', v_now - interval '4 hours' + interval '2 seconds'
        );

        -- Event 2: Risk signal resolved (COMPLETED)
        INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type,
            entity_code, aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload,
            status, retry_count,
            created_at, processed_at
        ) VALUES (
            v_tenant, 'close.risk_signal.resolved',
            v_entity, 'FORECAST_SLIP_2H', 'close_risk_signal',
            'controller@demo', 'USER', 'bff',
            gen_random_uuid(),
            jsonb_build_object(
                'rule_code', 'FORECAST_SLIP_2H',
                'fiscal_year', 2026,
                'period_number', 2,
                'resolution_notes', 'Additional resources assigned'
            ),
            'COMPLETED', 0,
            v_now - interval '1 day', v_now - interval '1 day' + interval '3 seconds'
        );

        -- Event 3: Checklist task completed (COMPLETED)
        INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type,
            entity_code, aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload,
            status, retry_count,
            created_at, processed_at
        ) VALUES (
            v_tenant, 'close.checklist.task_completed',
            v_entity, 'AR_RECON', 'period_close_checklist',
            'accountant@demo', 'USER', 'bff',
            gen_random_uuid(),
            jsonb_build_object(
                'task_code', 'AR_RECON',
                'fiscal_year', 2026,
                'period_number', 2,
                'completion_notes', 'AR reconciliation completed within tolerance'
            ),
            'COMPLETED', 0,
            v_now - interval '3 days', v_now - interval '3 days' + interval '1 second'
        );

        -- Event 4: Anomaly acknowledged (PENDING — awaiting worker)
        INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type,
            entity_code, aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload,
            status, retry_count,
            created_at
        ) VALUES (
            v_tenant, 'atlas.anomaly.acknowledged',
            v_entity, 'AMOUNT_OUTLIER', 'atlas_anomaly',
            'controller@demo', 'USER', 'bff',
            gen_random_uuid(),
            jsonb_build_object(
                'anomaly_type', 'AMOUNT_OUTLIER',
                'fiscal_year', 2026,
                'period_number', 2,
                'severity', 'WARNING'
            ),
            'PENDING', 0,
            v_now - interval '30 seconds'
        );

        -- Event 5: Dead letter example (failed after retries)
        INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type,
            entity_code, aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload,
            status, retry_count, last_error,
            created_at
        ) VALUES (
            v_tenant, 'close.checklist.task_failed',
            v_entity, 'INV_VALUATION', 'period_close_checklist',
            'system', 'SYSTEM', 'runtime',
            gen_random_uuid(),
            jsonb_build_object(
                'task_code', 'INV_VALUATION',
                'fiscal_year', 2026,
                'period_number', 2,
                'failure_reason', 'Reconciliation variance exceeds tolerance'
            ),
            'DEAD_LETTER', 3,
            'EventBus publish failed after 3 retries: ECONNREFUSED to message broker',
            v_now - interval '20 hours'
        );

        RAISE NOTICE 'Domain event outbox (5) seeded for tenant %', v_code;
    END LOOP;
END $$;
