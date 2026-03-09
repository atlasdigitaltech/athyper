/* ============================================================================
   Standard Notification Rules for Risk Signal Events
   Seed: meta.notification_rule

   Data-driven routing: the finance module emits domain events
   (fin.risk_signal.*), the notification orchestrator matches them
   to these rules and routes to appropriate channels/recipients.

   Severity → channel mapping (defaults):
     critical → email + push + teams
     high     → email + in_app
     medium   → in_app
     low      → digest (daily)

   These are generic notification_rule rows — the same pattern is
   reusable by any module that emits domain events.
   ============================================================================ */

DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Demo tenant not found — skipping risk notification rule seeding';
        RETURN;
    END IF;

    -- ── fin.risk_signal.fired — critical severity ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_critical', 'Risk Signal Fired (Critical)',
        'fin.risk_signal.fired', 'close_risk_signal',
        'risk_signal_fired_critical',
        ARRAY['email', 'push', 'in_app']::text[],
        'critical',
        '{"match": {"severity": "critical"}, "recipients": [{"type": "role", "field": "escalationRole"}, {"type": "actor", "role": "CONTROLLER"}]}'::jsonb,
        30, 300000,
        true,
        'Route critical risk signal firings to email + push + in-app. Recipients: escalation role + controller.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.fired — high severity ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_high', 'Risk Signal Fired (High)',
        'fin.risk_signal.fired', 'close_risk_signal',
        'risk_signal_fired_high',
        ARRAY['email', 'in_app']::text[],
        'high',
        '{"match": {"severity": "high"}, "recipients": [{"type": "role", "field": "escalationRole"}]}'::jsonb,
        60, 300000,
        true,
        'Route high severity risk signal firings to email + in-app.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.fired — medium severity ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_medium', 'Risk Signal Fired (Medium)',
        'fin.risk_signal.fired', 'close_risk_signal',
        'risk_signal_fired_medium',
        ARRAY['in_app']::text[],
        'normal',
        '{"match": {"severity": "medium"}, "recipients": [{"type": "role", "field": "escalationRole"}]}'::jsonb,
        null, 300000,
        true,
        'Route medium severity risk signal firings to in-app only.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.fired — low severity (digest) ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_low', 'Risk Signal Fired (Low)',
        'fin.risk_signal.fired', 'close_risk_signal',
        'risk_signal_fired_low',
        ARRAY['in_app']::text[],
        'low',
        '{"match": {"severity": "low"}, "recipients": [{"type": "role", "field": "escalationRole"}], "frequency": "daily_digest"}'::jsonb,
        null, 600000,
        true,
        'Route low severity risk signals to daily digest.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.escalated — always urgent ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_escalated', 'Risk Signal Escalated',
        'fin.risk_signal.escalated', 'close_risk_signal',
        'risk_signal_escalated',
        ARRAY['email', 'push', 'in_app']::text[],
        'critical',
        '{"recipients": [{"type": "role", "field": "escalationRole"}, {"type": "actor", "role": "CFO"}]}'::jsonb,
        15, 300000,
        true,
        'Route escalated risk signals to email + push + in-app. Includes CFO for visibility.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.resolved — informational ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_resolved', 'Risk Signal Resolved',
        'fin.risk_signal.resolved', 'close_risk_signal',
        'risk_signal_resolved',
        ARRAY['in_app']::text[],
        'low',
        '{"recipients": [{"type": "signal_stakeholders"}]}'::jsonb,
        null, 60000,
        true,
        'Notify stakeholders when a risk signal is resolved (auto or manual).',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    -- ── fin.risk_signal.acknowledged — informational ──
    INSERT INTO meta.notification_rule (
        tenant_id, code, name, event_type, entity_type,
        template_key, channels, priority,
        recipient_rules, sla_minutes, dedup_window_ms,
        is_enabled, description, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_acknowledged', 'Risk Signal Acknowledged',
        'fin.risk_signal.acknowledged', 'close_risk_signal',
        'risk_signal_acknowledged',
        ARRAY['in_app']::text[],
        'low',
        '{"recipients": [{"type": "signal_stakeholders"}]}'::jsonb,
        null, 60000,
        true,
        'Notify stakeholders when a risk signal is acknowledged.',
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_rule_tenant_code_uniq DO NOTHING;

    RAISE NOTICE 'Seeded 7 notification rules for fin.risk_signal.* events';
END $$;
