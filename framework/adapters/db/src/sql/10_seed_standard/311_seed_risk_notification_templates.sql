/* ============================================================================
   Standard Notification Templates for Risk Signal Events
   Seed: meta.notification_template

   Templates referenced by the notification rules in 310_seed_risk_notification_rules.sql.
   Each template covers in_app + email channels with appropriate copy.

   Template variables (from RiskSignalEventPayload):
     {{title}}              — Human-readable signal title
     {{message}}            — Detailed signal message
     {{severity}}           — critical | high | medium | low
     {{ruleCode}}           — Rule identifier
     {{entityCode}}         — Entity (e.g., "ENT01")
     {{fiscalYear}}         — Fiscal year number
     {{periodNumber}}       — Period number
     {{escalationLevel}}    — Current escalation level (0+)
     {{signalId}}           — Signal UUID
     {{targetStatus}}       — SOFT_CLOSE | HARD_CLOSE
   ============================================================================ */

DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Demo tenant not found — skipping risk notification template seeding';
        RETURN;
    END IF;

    -- ========================================================================
    -- risk_signal_fired_critical
    -- ========================================================================

    -- In-app
    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_critical', 'in_app', 'en', 1, 'active',
        '🔴 Critical Risk: {{title}}',
        '{{message}} — Entity {{entityCode}}, Period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"severity":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- Email
    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, body_html, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_critical', 'email', 'en', 1, 'active',
        '[CRITICAL] Period Close Risk: {{title}}',
        E'A critical risk signal has been fired for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.\n\n{{message}}\n\nPlease investigate immediately. This signal requires acknowledgement within the configured SLA.',
        E'<h2 style="color:#dc2626">Critical Risk Signal</h2><p><strong>{{title}}</strong></p><p>{{message}}</p><p>Entity: {{entityCode}} | Period: {{fiscalYear}}/{{periodNumber}}</p><p style="color:#dc2626;font-weight:bold">This signal requires immediate attention.</p>',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"severity":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_fired_high
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_high', 'in_app', 'en', 1, 'active',
        '🟠 High Risk: {{title}}',
        '{{message}} — Entity {{entityCode}}, Period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_high', 'email', 'en', 1, 'active',
        '[HIGH] Period Close Risk: {{title}}',
        E'A high-severity risk signal has been fired for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.\n\n{{message}}\n\nPlease review and acknowledge.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_fired_medium
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_medium', 'in_app', 'en', 1, 'active',
        '🟡 Risk Signal: {{title}}',
        '{{message}} — Entity {{entityCode}}, Period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_fired_low
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_fired_low', 'in_app', 'en', 1, 'active',
        'ℹ️ Low Risk: {{title}}',
        '{{message}} — Entity {{entityCode}}, Period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_escalated
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_escalated', 'in_app', 'en', 1, 'active',
        '⬆️ Escalated: {{title}} (Level {{escalationLevel}})',
        '{{message}} — Escalation level {{escalationLevel}} for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"escalationLevel":{"type":"number"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, body_html, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_escalated', 'email', 'en', 1, 'active',
        '[ESCALATED] Risk Signal: {{title}} — Level {{escalationLevel}}',
        E'A risk signal has been escalated to level {{escalationLevel}} for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.\n\n{{message}}\n\nThis signal has not been resolved within the configured SLA. Immediate action is required.',
        E'<h2 style="color:#dc2626">Risk Signal Escalated — Level {{escalationLevel}}</h2><p><strong>{{title}}</strong></p><p>{{message}}</p><p>Entity: {{entityCode}} | Period: {{fiscalYear}}/{{periodNumber}}</p><p style="color:#dc2626;font-weight:bold">This signal has exceeded its SLA and requires immediate action.</p>',
        '{"type":"object","properties":{"title":{"type":"string"},"message":{"type":"string"},"escalationLevel":{"type":"number"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_resolved
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_resolved', 'in_app', 'en', 1, 'active',
        '✅ Resolved: {{title}}',
        'Risk signal resolved for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    -- ========================================================================
    -- risk_signal_acknowledged
    -- ========================================================================

    INSERT INTO meta.notification_template (
        tenant_id, template_key, channel, locale, version, status,
        subject, body_text, variables_schema, created_by
    ) VALUES (
        v_tenant_id, 'risk_signal_acknowledged', 'in_app', 'en', 1, 'active',
        '👁️ Acknowledged: {{title}}',
        'Risk signal acknowledged for {{entityCode}} period {{fiscalYear}}/{{periodNumber}}.',
        '{"type":"object","properties":{"title":{"type":"string"},"entityCode":{"type":"string"},"fiscalYear":{"type":"number"},"periodNumber":{"type":"number"}}}'::jsonb,
        'system:seed'
    ) ON CONFLICT ON CONSTRAINT notification_template_key_channel_locale_version_uniq DO NOTHING;

    RAISE NOTICE 'Seeded 11 notification templates for risk signal events (7 in-app + 4 email)';
END $$;
