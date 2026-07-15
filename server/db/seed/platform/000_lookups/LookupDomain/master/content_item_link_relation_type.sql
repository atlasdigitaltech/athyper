INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('related',
     'Related',
     'master.content_item_link_relation_type',
     'General-purpose related content link (e.g. "See also").',
     10),
    ('embed',
     'Embed',
     'master.content_item_link_relation_type',
     'Target content is embedded inline within the source page body.',
     20),
    ('see_also',
     'See Also',
     'master.content_item_link_relation_type',
     'Explicit editorial cross-reference suggesting supplementary reading.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
