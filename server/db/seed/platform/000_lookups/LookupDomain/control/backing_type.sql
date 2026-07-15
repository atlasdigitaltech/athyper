INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('table',              'Table',              'entity.backing_type', 10),
    ('view',               'View',               'entity.backing_type', 20),
    ('materialized_view',  'Materialized View',  'entity.backing_type', 30),
    ('virtual',            'Virtual',            'entity.backing_type', 40),
    ('external',           'External',           'entity.backing_type', 50),
    ('event_stream',       'Event Stream',       'entity.backing_type', 60),
    ('partitioned_table',  'Partitioned Table',  'entity.backing_type', 70),
    ('inherited_table',    'Inherited Table',    'entity.backing_type', 80),
    ('compiled_table',     'Compiled Table',     'entity.backing_type', 90)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
