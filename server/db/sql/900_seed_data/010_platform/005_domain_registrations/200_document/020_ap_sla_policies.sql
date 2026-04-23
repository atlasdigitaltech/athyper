-- ============================================================================
-- FILE: 200_document/020_ap_sla_policies.sql
-- Purpose: Seed control.workflow_sla_policy records for AP invoice approvals
--
-- Policies:
--   ap_std_review_24h   — Standard AP approval: 24 h target
--   ap_hv_review_48h    — High-value AP approval: 48 h target
--
-- Timer escalation ladder (per policy):
--   75 % of SLA → reminder notification
--   100% of SLA → escalate to finance_controller
--   200% of SLA → auto-reject (prevent indefinite blocking)
--
-- Idempotent: ON CONFLICT DO NOTHING
-- ============================================================================

DO $ap_sla$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ── Standard AP Review — 24 h ─────────────────────────────────────────────
    -- Timer ladder: remind at 18 h, escalate at 24 h, auto-reject at 48 h
    INSERT INTO control.workflow_sla_policy (
        tenant_id, code, name, description,
        timers, escalation_chain, created_by
    ) VALUES (
        NULL,
        'ap_std_review_24h',
        'AP Standard Review — 24 h',
        'Standard purchase invoice approval SLA. '
        'Target: 24 h. Reminder at 18 h, escalation at 24 h, auto-reject at 48 h.',
        '[
            {
                "after_minutes": 1080,
                "action": "reminder",
                "notify_roles": [],
                "message_template_key": "wfl.sla_reminder"
            },
            {
                "after_minutes": 1440,
                "action": "escalate",
                "notify_roles": [],
                "message_template_key": "wfl.sla_breach"
            },
            {
                "after_minutes": 2880,
                "action": "auto_reject",
                "notify_roles": [],
                "message_template_key": "wfl.sla_auto_reject"
            }
        ]'::jsonb,
        '[
            {"type": "role", "value": "finance_controller", "notify": true}
        ]'::jsonb,
        v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ── High-Value AP Review — 48 h ───────────────────────────────────────────
    -- Timer ladder: remind at 36 h, escalate at 48 h, auto-reject at 96 h
    INSERT INTO control.workflow_sla_policy (
        tenant_id, code, name, description,
        timers, escalation_chain, created_by
    ) VALUES (
        NULL,
        'ap_hv_review_48h',
        'AP High-Value Review — 48 h',
        'High-value purchase invoice approval SLA (≥ 50,000 base currency). '
        'Target: 48 h. Reminder at 36 h, escalation at 48 h, auto-reject at 96 h.',
        '[
            {
                "after_minutes": 2160,
                "action": "reminder",
                "notify_roles": [],
                "message_template_key": "wfl.sla_reminder"
            },
            {
                "after_minutes": 2880,
                "action": "escalate",
                "notify_roles": [],
                "message_template_key": "wfl.sla_breach"
            },
            {
                "after_minutes": 5760,
                "action": "auto_reject",
                "notify_roles": [],
                "message_template_key": "wfl.sla_auto_reject"
            }
        ]'::jsonb,
        '[
            {"type": "role", "value": "finance_controller", "notify": true},
            {"type": "role", "value": "cfo",                "notify": true}
        ]'::jsonb,
        v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[020_ap_sla_policies] 2 AP SLA policies seeded (ap_std_review_24h, ap_hv_review_48h)';

END $ap_sla$;
