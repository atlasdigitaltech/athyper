-- LookupDomain/master/content_item_access_grant_access_level.sql
-- Lookup values for domain: master.content_item_access_grant.access_level
-- Access grant level for CMS content items.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('read',    'Read',    'master.content_item_access_grant.access_level', 'Read access.',            10),
    ('write',   'Write',   'master.content_item_access_grant.access_level', 'Write access.',           20),
    ('publish', 'Publish', 'master.content_item_access_grant.access_level', 'Publish access.',         30),
    ('admin',   'Admin',   'master.content_item_access_grant.access_level', 'Administrative access.',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
