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

-- ── Template: comment_mention / in_app ───────────────────────────────────────

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'comment_mention',
    'in_app',
    'en',
    1,
    '{{mentioner_name}} mentioned you',
    '{{mentioner_name}} mentioned you in a comment on {{entity_type}} {{entity_id}}: "{{excerpt}}"',
    '{"mentioner_name": "string", "excerpt": "string", "entity_type": "string", "entity_id": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'comment_mention'
      AND  channel      = 'in_app'
      AND  locale       = 'en'
      AND  version      = 1
);

-- ── Template: comment_mention / email ────────────────────────────────────────

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'comment_mention',
    'email',
    'en',
    1,
    'You were mentioned by {{mentioner_name}}',
    E'Hi,\n\n{{mentioner_name}} mentioned you in a comment:\n\n"{{excerpt}}"\n\nView it here: {{entity_url}}',
    '{"mentioner_name": "string", "excerpt": "string", "entity_type": "string", "entity_id": "string", "entity_url": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'comment_mention'
      AND  channel      = 'email'
      AND  locale       = 'en'
      AND  version      = 1
);
