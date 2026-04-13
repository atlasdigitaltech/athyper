-- LookupDomain/master/content_item_kind.sql
-- Lookup values for domain: master.content_item_kind
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('page',
     'Page',
     'master.content_item_kind',
     'A standalone navigable page (e.g. About Us, Contact, Home).',
     10),
    ('article',
     'Article',
     'master.content_item_kind',
     'A long-form authored content piece (e.g. blog post, knowledge base article).',
     20),
    ('snippet',
     'Snippet',
     'master.content_item_kind',
     'A reusable inline content fragment embedded in other pages or templates.',
     30),
    ('announcement',
     'Announcement',
     'master.content_item_kind',
     'A time-sensitive broadcast message shown to users (e.g. maintenance notice, news).',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
