INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('manual',       'Manual',       'master.cc_provenance', 'Human-assigned classification',         10),
    ('ai_generated', 'AI generated', 'master.cc_provenance', 'Machine-learning suggestion',           20),
    ('ai_verified',  'AI verified',  'master.cc_provenance', 'AI suggestion confirmed by human',      30),
    ('imported',     'Imported',     'master.cc_provenance', 'Bulk import from external system',      40),
    ('official',     'Official',     'master.cc_provenance', 'Authoritative source (manufacturer)',   50),
    ('seed',         'Seed',         'master.cc_provenance', 'Platform seed data — loaded by blueprint seed scripts', 60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
