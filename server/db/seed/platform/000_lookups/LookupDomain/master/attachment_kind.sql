INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('attachment',     'Attachment',
     'master.attachment_kind',
     'Generic file attachment on a business entity.',       10),
    ('letterhead',     'Letterhead',
     'master.attachment_kind',
     'Branded page header/footer asset for document generation.', 20),
    ('template_asset', 'Template Asset',
     'master.attachment_kind',
     'Image or resource file embedded in a document template.', 30),
    ('avatar',         'Avatar',
     'master.attachment_kind',
     'Principal or entity profile picture.',                40),
    ('evidence',       'Evidence',
     'master.attachment_kind',
     'Compliance or audit evidence file attached to a governance record.', 50),
    ('report',         'Report',
     'master.attachment_kind',
     'Generated report output (PDF, Excel).',               60),
    ('signature',      'Signature',
     'master.attachment_kind',
     'Digital or scanned signature asset.',                 70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
