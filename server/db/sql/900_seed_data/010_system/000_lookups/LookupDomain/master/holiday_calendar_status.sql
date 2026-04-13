-- LookupDomain/master/holiday_calendar_status.sql
-- Lookup domain + values for master.holiday_calendar_status
-- is_extensible = false — statuses are platform-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.holiday_calendar_status',
       'Holiday calendar status',
       'Lifecycle status of a holiday calendar: active, inactive, archived.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.holiday_calendar_status'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',   'Active',   'master.holiday_calendar_status', 'Calendar is in use',              10),
    ('inactive', 'Inactive', 'master.holiday_calendar_status', 'Calendar is temporarily disabled', 20),
    ('archived', 'Archived', 'master.holiday_calendar_status', 'Calendar is archived',            30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
