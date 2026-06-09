-- Table-owned seed for control.notification_template
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/003_control/010_flows_and_routing.sql
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


-- Template: purchase_invoice.lifecycle.changed / in_app

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'purchase_invoice.lifecycle.changed',
    'in_app',
    'en',
    1,
    'Purchase invoice {{invoice_number}} moved to {{to_status}}',
    '{{actor_name}} changed purchase invoice {{invoice_number}} from {{from_status}} to {{to_status}}.',
    '{"invoice_number": "string", "from_status": "string", "to_status": "string", "actor_name": "string", "entity_type": "string", "entity_id": "string", "entity_url": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'purchase_invoice.lifecycle.changed'
      AND  channel      = 'in_app'
      AND  locale       = 'en'
      AND  version      = 1
);


-- Template: purchase_invoice.lifecycle.changed / push

INSERT INTO control.notification_template
    (tenant_id, template_key, channel, locale, version,
     subject, body_text, variables_schema,
     status, created_by)
SELECT
    NULL,
    'purchase_invoice.lifecycle.changed',
    'push',
    'en',
    1,
    'Purchase invoice updated',
    '{{invoice_number}} is now {{to_status}}.',
    '{"invoice_number": "string", "from_status": "string", "to_status": "string", "actor_name": "string", "entity_type": "string", "entity_id": "string", "entity_url": "string"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE  tenant_id IS NULL
      AND  template_key = 'purchase_invoice.lifecycle.changed'
      AND  channel      = 'push'
      AND  locale       = 'en'
      AND  version      = 1
);
