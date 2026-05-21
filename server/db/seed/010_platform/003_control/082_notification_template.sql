-- Table-owned seed for control.notification_template
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/003_control/010_flows_and_routing.sql
-- ============================================================


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
