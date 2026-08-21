-- Cross-plane collaboration notification defaults. Plane/product events are
-- seeded by their own overlay so Admin, Neon, and Mesh do not inherit each
-- other's business vocabulary.
INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'comment_mention', 'in_app', 'en', 1,
     '{{mentioner_name}} mentioned you',
     '{{mentioner_name}} mentioned you in a comment on {{entity_type}} {{entity_id}}: "{{excerpt}}"',
     '{"mentioner_name":"string","excerpt":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'comment_mention', 'email', 'en', 1,
     'You were mentioned by {{mentioner_name}}',
     E'Hi,\n\n{{mentioner_name}} mentioned you in a comment:\n\n"{{excerpt}}"\n\nView it here: {{entity_url}}',
     '{"mentioner_name":"string","excerpt":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET
    subject = EXCLUDED.subject,
    body_text = EXCLUDED.body_text,
    variables_schema = EXCLUDED.variables_schema,
    status = EXCLUDED.status,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

INSERT INTO control.notification_routing_rule (
    tenant_id, code, name, description, event_type, template_key, channels,
    priority, recipient_rules, dedup_window_ms, is_enabled, sort_order, created_by
) VALUES (
    NULL, 'collab.comment_mention', 'Comment Mention',
    'Notify a principal when they are @-mentioned in a comment.',
    'comment.mention', 'comment_mention', ARRAY['in_app','email'], 'normal',
    '{"explicit_ids":[]}'::jsonb, 300000, true, 10,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    event_type = EXCLUDED.event_type,
    template_key = EXCLUDED.template_key,
    channels = EXCLUDED.channels,
    recipient_rules = EXCLUDED.recipient_rules,
    dedup_window_ms = EXCLUDED.dedup_window_ms,
    is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;
