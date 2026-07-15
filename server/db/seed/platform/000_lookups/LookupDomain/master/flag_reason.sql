INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('spam',          'Spam',
     'master.flag_reason',
     'Unsolicited, repetitive, or promotional content not relevant to the entity.',
     10),
    ('inappropriate', 'Inappropriate',
     'master.flag_reason',
     'Offensive, abusive, or harassing language.',
     20),
    ('confidential',  'Confidential',
     'master.flag_reason',
     'Contains sensitive or confidential information that should not be visible.',
     30),
    ('off_topic',     'Off Topic',
     'master.flag_reason',
     'Comment is unrelated to the entity it is attached to.',
     40),
    ('misinformation','Misinformation',
     'master.flag_reason',
     'Factually incorrect information that may mislead other users.',
     50),
    ('duplicate',     'Duplicate',
     'master.flag_reason',
     'Exact or near-exact duplicate of another comment on the same entity.',
     60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
