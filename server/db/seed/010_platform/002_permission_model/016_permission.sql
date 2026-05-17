-- 900_seed_data/001_shared/016_permission.sql
-- Seed: Base atomic permissions across 8 categories.
-- Schema: shared | Table: permission
-- Depends on: 015_permission_category.sql
-- Idempotent: on conflict (code) do nothing

-- Entity operations
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('read',         'Read',         'entity', 'record', 'low',    false, 10),
    ('create',       'Create',       'entity', 'record', 'low',    false, 20),
    ('update',       'Update',       'entity', 'record', 'low',    false, 30),
    ('edit',         'Edit',         'entity', 'record', 'low',    false, 30),
    ('exit',         'Exit',         'entity', 'record', 'low',    false, 35),
    ('delete_draft', 'Delete draft', 'entity', 'record', 'low',    false, 40),
    ('delete',       'Delete',       'entity', 'record', 'high',   false, 50)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Workflow operations
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('submit',   'Submit',   'workflow', 'record', 'low',    false, 10),
    ('amend',    'Amend',    'workflow', 'record', 'low',    false, 20),
    ('cancel',   'Cancel',   'workflow', 'record', 'medium', false, 30),
    ('close',    'Close',    'workflow', 'record', 'medium', false, 40),
    ('reopen',   'Reopen',   'workflow', 'record', 'medium', false, 50),
    ('withdraw', 'Withdraw', 'workflow', 'record', 'low',    false, 60),
    ('escalate', 'Escalate', 'workflow', 'record', 'low',    false, 70),
    ('approve',  'Approve',  'workflow', 'record', 'medium', false, 80),
    ('deny',     'Deny',     'workflow', 'record', 'medium', false, 90),
    ('void',     'Void',     'workflow', 'record', 'high',   false, 95)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Finance, Utility, Bulk, Delegation, Collaboration, Special
INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.st, v.rl, v.pr, v.so, '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('post',               'Post',                    'finance',       'record',  'high',     false, 10),
    ('reverse',            'Reverse',                 'finance',       'record',  'critical', true,  20),
    ('reconcile',          'Reconcile',               'finance',       'record',  'high',     false, 30),
    ('copy',               'Copy',                    'utility',       'record',  'low',      false, 10),
    ('merge',              'Merge',                   'utility',       'record',  'critical', true,  20),
    ('report',             'Report',                  'utility',       'record',  'low',      false, 30),
    ('print',              'Print',                   'utility',       'record',  'low',      false, 40),
    ('import',             'Import',                  'utility',       'record',  'medium',   true,  50),
    ('export',             'Export',                  'utility',       'record',  'low',      false, 60),
    ('view_je',            'View Journal Entry',      'utility',       'record',  'low',      false, 70),
    ('bulk_import',        'Bulk import',             'bulk',          'tenant',  'high',     true,  10),
    ('bulk_export',        'Bulk export',             'bulk',          'tenant',  'high',     true,  20),
    ('bulk_update',        'Bulk update',             'bulk',          'tenant',  'critical', true,  30),
    ('bulk_delete',        'Bulk delete',             'bulk',          'tenant',  'critical', true,  40),
    ('delegate',           'Delegate',                'delegation',    'record',  'medium',   false, 10),
    ('share_read',         'Share read-only',         'delegation',    'record',  'low',      false, 20),
    ('share_edit',         'Share editable',          'delegation',    'record',  'medium',   false, 30),
    ('add_comment',        'Add comment',             'collaboration', 'record',  'low',      false, 10),
    ('add_attachment',     'Add attachment',           'collaboration', 'record',  'low',      false, 20),
    ('del_others_comment', 'Delete others comment',   'collaboration', 'record',  'medium',   false, 30),
    ('del_others_attach',  'Delete others attachment', 'collaboration', 'record',  'medium',   false, 40),
    ('follow',             'Follow',                  'collaboration', 'record',  'low',      false, 50),
    ('tag',                'Tag',                     'collaboration', 'record',  'low',      false, 60),
    ('feature_diagnostic', 'Self Diagnostic Tool',    'special',       'special', 'critical', false, 10),
    ('feature_theme',      'Theme Change',            'special',       'special', 'low',      false, 20),
    ('feature_view',       'View Access Features',    'special',       'special', 'low',      false, 30),
    ('feature_edit',       'Create/Edit Features',    'special',       'special', 'medium',   false, 40)
) AS v(code, name, cat, st, rl, pr, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;
