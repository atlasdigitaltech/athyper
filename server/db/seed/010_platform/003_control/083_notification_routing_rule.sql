-- Table-owned seed for control.notification_routing_rule
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/003_control/010_flows_and_routing.sql
-- ============================================================


-- NOTIFICATION ROUTING

-- control/011_notification_routing_collab.sql
-- Notification routing rules for collaboration events.
-- Platform global (tenant_id = NULL) — apply to all tenants.
-- Idempotent: ON CONFLICT DO NOTHING on the (tenant_id, code) unique key.

-- ── Routing rule: comment.mention → in_app + email ────────────────────────────

INSERT INTO control.notification_routing_rule
    (code, name, description,
     event_type, entity_type, template_key,
     channels, priority, recipient_rules,
     dedup_window_ms, is_enabled, sort_order, created_by)
SELECT
    'collab.comment_mention',
    'Comment Mention',
    'Notify a principal when they are @-mentioned in a comment.',
    'comment.mention',
    NULL,                        -- applies to all entity types
    'comment_mention',
    ARRAY['in_app', 'email'],
    'normal',
    '{"explicit_ids": []}',      -- recipient resolved by MentionService directly
    300000,                      -- 5-minute dedup window (same as MentionService)
    true,
    10,
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_routing_rule
    WHERE  tenant_id IS NULL AND code = 'collab.comment_mention'
);
