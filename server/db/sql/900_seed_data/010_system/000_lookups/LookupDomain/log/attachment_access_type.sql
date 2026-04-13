-- LookupDomain/log/attachment_access_type.sql
-- Lookup values for domain: log.attachment_access_type
-- Idempotent: WHERE NOT EXISTS guard
-- Includes base values + extension values from master/010_doc_lookups.sql

-- Base values
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('download',       'Download',
     'log.attachment_access_type',
     'Full file download to client device.',
     10),
    ('preview',        'Preview',
     'log.attachment_access_type',
     'In-browser preview render (PDF viewer, image display).',
     20),
    ('metadata_read',  'Metadata Read',
     'log.attachment_access_type',
     'Filename, size, MIME type read without file content transfer.',
     30),
    ('thumbnail',      'Thumbnail',
     'log.attachment_access_type',
     'Thumbnail or low-resolution preview generation.',
     40),
    ('stream',         'Stream',
     'log.attachment_access_type',
     'Streaming access (video/audio playback via range requests).',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

-- Extension values (from master/010_doc_lookups.sql)
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('template_preview',  'Template Preview',
     'log.attachment_access_type',
     'Template preview access.',
     60),
    ('template_download', 'Template Download',
     'log.attachment_access_type',
     'Template download access.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
