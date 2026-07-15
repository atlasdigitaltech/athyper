-- Co-located with notification.channel and notification.priority in control/ — all three
-- are delivery-infrastructure config, not master data.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('hourly_digest',  'Hourly Digest',
     'notification.digest_frequency',
     'Batch all pending low/normal notifications for a recipient and channel '
     'into a single digest message every hour.',
     10, '{"window_minutes": 60, "cron": "0 * * * *"}'),

    ('daily_digest',   'Daily Digest',
     'notification.digest_frequency',
     'Batch all pending notifications for a recipient and channel '
     'into a single digest message once per day (typically 08:00 tenant timezone).',
     20, '{"window_minutes": 1440, "cron": "0 8 * * *"}'),

    ('weekly_digest',  'Weekly Digest',
     'notification.digest_frequency',
     'Batch all pending notifications for a recipient and channel '
     'into a single digest message once per week (typically Monday 08:00).',
     30, '{"window_minutes": 10080, "cron": "0 8 * * 1"}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
