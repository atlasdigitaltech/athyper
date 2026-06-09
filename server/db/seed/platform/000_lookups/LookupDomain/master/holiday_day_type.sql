-- LookupDomain/master/holiday_day_type.sql
-- Lookup values for domain: master.holiday_day_type
-- Used by: holiday_calendar_day.day_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('national',      'National',      'master.holiday_day_type', 'Nationally mandated public holiday',           10),
    ('regional',      'Regional',      'master.holiday_day_type', 'State or regional government holiday',         20),
    ('local',         'Local',         'master.holiday_day_type', 'Company-specific or local area holiday',       30),
    ('religious',     'Religious',     'master.holiday_day_type', 'Religious observance holiday',                 40),
    ('observance',    'Observance',    'master.holiday_day_type', 'Non-mandatory commemorative day',              50),
    ('compensatory',  'Compensatory',  'master.holiday_day_type', 'Substitute holiday for a moved official one',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
