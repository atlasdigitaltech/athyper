-- LookupDomain/master/holiday_weekend_pattern.sql
-- Lookup values for domain: master.holiday_weekend_pattern
-- Used by: holiday_calendar.weekend_pattern
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('sat_sun', 'Saturday & Sunday', 'master.holiday_weekend_pattern', 'Standard Western weekend (Sat + Sun)',              10),
    ('fri_sat', 'Friday & Saturday', 'master.holiday_weekend_pattern', 'GCC / Middle East weekend (Fri + Sat)',             20),
    ('fri_only','Friday Only',       'master.holiday_weekend_pattern', 'Single-day Friday weekend',                         30),
    ('sat_only','Saturday Only',     'master.holiday_weekend_pattern', 'Single-day Saturday weekend',                       40),
    ('sun_only','Sunday Only',       'master.holiday_weekend_pattern', 'Single-day Sunday weekend',                         50),
    ('thu_fri', 'Thursday & Friday', 'master.holiday_weekend_pattern', 'Some Gulf states — Thursday & Friday weekend',      60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
