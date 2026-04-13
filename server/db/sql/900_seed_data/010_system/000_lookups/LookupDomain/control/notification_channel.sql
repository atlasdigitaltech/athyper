-- LookupDomain/control/notification_channel.sql
-- Lookup values for domain: notification.channel
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('in_app',    'In-App',
     'notification.channel',
     'Real-time in-app notification displayed in the notification bell/panel. '
     'Delivered via WebSocket or SSE. No external provider required.',
     10, '{"requires_provider": false, "supports_read_receipt": true, "supports_dismiss": true}'),

    ('email',     'Email',
     'notification.channel',
     'Email notification via a configured email provider (e.g. SendGrid, SES). '
     'Supports HTML and plain-text bodies. Tracks opens and clicks via pixel.',
     20, '{"requires_provider": true, "supports_open_tracking": true, "supports_click_tracking": true}'),

    ('sms',       'SMS',
     'notification.channel',
     'SMS text message via a configured SMS provider (e.g. Twilio, Vonage). '
     'Body limited to 160 chars per segment. Supports concatenated messages.',
     30, '{"requires_provider": true, "max_body_chars": 1600, "supports_e164_only": true}'),

    ('push',      'Push Notification',
     'notification.channel',
     'Mobile or web push notification via FCM or APNs. '
     'Requires a registered push subscription (device token).',
     40, '{"requires_provider": true, "requires_subscription": true, "supports_rich_content": true}'),

    ('webhook',   'Webhook',
     'notification.channel',
     'HTTP callback to a subscriber-configured endpoint. '
     'Uses HMAC-SHA256 signature verification. Retried on non-2xx response.',
     50, '{"requires_provider": false, "requires_subscription": true, "uses_hmac_signing": true}'),

    ('whatsapp',  'WhatsApp',
     'notification.channel',
     'WhatsApp Business API message via a configured provider. '
     'Requires prior opt-in from the recipient. Uses template messages for outbound.',
     60, '{"requires_provider": true, "requires_optin": true, "uses_template_messages": true}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
