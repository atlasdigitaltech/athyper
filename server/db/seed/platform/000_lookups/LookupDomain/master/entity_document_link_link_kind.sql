INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('primary',    'Primary',    'master.entity_document_link.link_kind', 'Primary attachment.',    10),
    ('related',    'Related',    'master.entity_document_link.link_kind', 'Related attachment.',    20),
    ('supporting', 'Supporting', 'master.entity_document_link.link_kind', 'Supporting attachment.', 30),
    ('compliance', 'Compliance', 'master.entity_document_link.link_kind', 'Compliance attachment.', 40),
    ('audit',      'Audit',      'master.entity_document_link.link_kind', 'Audit attachment.',      50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
