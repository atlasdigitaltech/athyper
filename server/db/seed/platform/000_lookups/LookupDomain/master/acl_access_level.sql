-- Used by: attachment_acl.access_level, content_item_access_grant.access_level.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('viewer',    'Viewer',    'master.acl_access_level', 'Read-only access — can view and download',               10),
    ('commenter', 'Commenter', 'master.acl_access_level', 'Can view and add comments but not edit content',         20),
    ('editor',    'Editor',    'master.acl_access_level', 'Can view, edit, and replace the attachment',             30),
    ('owner',     'Owner',     'master.acl_access_level', 'Full control including share, delete, and ACL changes',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
