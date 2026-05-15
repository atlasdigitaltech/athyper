-- LookupDomain/control/notification_priority.sql
-- Lookup values for domain: notification.priority
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('low',    'Low',
     'notification.priority',
     'Low-priority notification. Eligible for digest batching. '
     'Delivery may be deferred up to 24 hours.',
     10, '{"sla_minutes": 1440, "max_retries": 3, "eligible_for_digest": true}'),

    ('normal', 'Normal',
     'notification.priority',
     'Standard priority. Delivered within 15 minutes. '
     'Default for all routing rules.',
     20, '{"sla_minutes": 15, "max_retries": 5, "eligible_for_digest": true}'),

    ('high',   'High',
     'notification.priority',
     'High-priority notification. Delivered within 2 minutes. '
     'Not eligible for digest batching.',
     30, '{"sla_minutes": 2, "max_retries": 7, "eligible_for_digest": false}'),

    ('urgent', 'Urgent',
     'notification.priority',
     'Urgent notification requiring immediate delivery (e.g. security alerts, '
     'system failures). Bypasses all batching and throttling. '
     'Retried aggressively with exponential backoff.',
     40, '{"sla_minutes": 1, "max_retries": 10, "eligible_for_digest": false, "bypass_throttle": true}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
