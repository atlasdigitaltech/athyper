-- Used by: holiday_calendar_day.observance_type.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('fixed',       'Fixed Date',    'master.holiday_observance_type', 'Same calendar date every year (e.g. Jan 1)',          10),
    ('floating',    'Floating',      'master.holiday_observance_type', 'Specific weekday in a month (e.g. 3rd Monday)',        20),
    ('calculated',  'Calculated',    'master.holiday_observance_type', 'Date derived from formula (e.g. Easter algorithm)',    30),
    ('transferred', 'Transferred',   'master.holiday_observance_type', 'Observed date moved when it falls on a weekend',      40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
