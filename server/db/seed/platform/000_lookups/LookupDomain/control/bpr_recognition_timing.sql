INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('simultaneous', 'Simultaneous', 'control.bpr_recognition_timing', 'Post to target book at same time as source',  10),
    ('deferred',     'Deferred',     'control.bpr_recognition_timing', 'Post to target book on next batch run',       20),
    ('on_close',     'On Close',     'control.bpr_recognition_timing', 'Post to target book during period close',     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
