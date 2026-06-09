-- LookupDomain/master/owner_type_category.sql
-- Lookup values for domain: master.owner_type_category
-- Used by: owner_type.category
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('principal', 'Principal', 'master.owner_type_category', 'Owned by a user / service account principal', 10),
    ('group',     'Group',     'master.owner_type_category', 'Owned by an auth group or team',              20),
    ('system',    'System',    'master.owner_type_category', 'Owned by the platform system',                30),
    ('external',  'External',  'master.owner_type_category', 'Owned by an external entity or integration',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
