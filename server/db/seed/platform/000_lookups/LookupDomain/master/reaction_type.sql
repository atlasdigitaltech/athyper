INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('thumbs_up',   'Thumbs Up',   'master.reaction_type', 'Approval / agreement.',          10, '{"emoji": "\uD83D\uDC4D", "unicode": "U+1F44D"}'),
    ('thumbs_down', 'Thumbs Down', 'master.reaction_type', 'Disagreement / rejection.',      20, '{"emoji": "\uD83D\uDC4E", "unicode": "U+1F44E"}'),
    ('heart',       'Heart',       'master.reaction_type', 'Love / strong appreciation.',    30, '{"emoji": "\u2764\uFE0F", "unicode": "U+2764"}'),
    ('celebrate',   'Celebrate',   'master.reaction_type', 'Celebration / milestone hit.',   35, '{"emoji": "\uD83C\uDF89", "unicode": "U+1F389"}'),
    ('laugh',       'Laugh',       'master.reaction_type', 'Funny / humorous.',              40, '{"emoji": "\uD83D\uDE04", "unicode": "U+1F604"}'),
    ('eyes',        'Eyes',        'master.reaction_type', 'Watching / noted / reviewing.',  50, '{"emoji": "\uD83D\uDC40", "unicode": "U+1F440"}'),
    ('rocket',      'Rocket',      'master.reaction_type', 'Ship it / great work.',          60, '{"emoji": "\uD83D\uDE80", "unicode": "U+1F680"}'),
    ('idea',        'Idea',        'master.reaction_type', 'Good idea / insightful.',        65, '{"emoji": "\uD83D\uDCA1", "unicode": "U+1F4A1"}'),
    ('check',       'Check',       'master.reaction_type', 'Done / confirmed / resolved.',   70, '{"emoji": "\u2705", "unicode": "U+2705"}'),
    ('thinking',    'Thinking',    'master.reaction_type', 'Needs thought / uncertain.',     75, '{"emoji": "\uD83E\uDD14", "unicode": "U+1F914"}'),
    ('question',    'Question',    'master.reaction_type', 'Unclear / needs clarification.', 80, '{"emoji": "\u2753", "unicode": "U+2753"}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
