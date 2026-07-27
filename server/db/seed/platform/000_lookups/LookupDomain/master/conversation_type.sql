INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('dm',        'Direct Message',
     'master.conversation_type',
     '1:1 private conversation between two principals.',
     10, '{"max_participants": 2, "is_private": true}'),
    ('group',     'Group Chat',
     'master.conversation_type',
     'Multi-participant private conversation.',
     20, '{"max_participants": 50, "is_private": true}'),
    ('channel',   'Channel',
     'master.conversation_type',
     'Broadcast channel. Participants may be read-only subscribers.',
     30, '{"max_participants": null, "is_private": false}'),
    ('thread',    'Thread',
     'master.conversation_type',
     'Contextual conversation thread anchored to a specific entity '
     '(entity_type + entity_id set on master.conversation).',
     40, '{"max_participants": null, "requires_entity_anchor": true}'),
    ('broadcast', 'Broadcast',
     'master.conversation_type',
     'One-way broadcast from owner to all participants. '
     'Participants cannot reply.',
     50, '{"max_participants": null, "is_one_way": true}'),
    ('atlas_agent', 'Atlas Agent',
     'master.conversation_type',
     'Principal-private Atlas conversation envelope. Transcript content is '
     'stored in master.atlas_message and remains provider-portable.',
     60, '{"max_participants": 1, "is_private": true, "principal_private": true}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
