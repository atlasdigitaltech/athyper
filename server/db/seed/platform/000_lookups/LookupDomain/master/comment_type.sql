INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('entity',       'Entity Comment',
     'master.comment_type',
     'Comment on any business entity (invoice, task, journal entry, etc.). '
     'Formerly entity_comment. entity_type + entity_id identify the target.',
     10),
    ('attachment',   'Attachment Comment',
     'master.comment_type',
     'Comment on a specific file attachment. '
     'Formerly attachment_comment. entity_type=''attachment'', entity_id=attachment.id.',
     20),
    ('approval',     'Approval Comment',
     'master.comment_type',
     'Comment on an approval workflow instance. '
     'entity_type=''approval_instance'', entity_id=approval_instance.id.',
     30),
    ('chat_message', 'Chat Message Comment',
     'master.comment_type',
     'Comment / reaction on a conversation message. '
     'Pre-seeded for future messaging reply threads.',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
