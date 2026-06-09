-- LookupDomain/control/overlay_change_kind.sql
-- Lookup values for domain: overlay_change.kind
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('add_field',           'Add Field',            'overlay_change.kind', 10),
    ('remove_field',        'Remove Field',         'overlay_change.kind', 20),
    ('modify_field',        'Modify Field',         'overlay_change.kind', 30),
    ('tweak_policy',        'Tweak Policy',         'overlay_change.kind', 40),
    ('override_validation', 'Override Validation',  'overlay_change.kind', 50),
    ('override_ui',         'Override UI',          'overlay_change.kind', 60),
    ('add_index',           'Add Index',            'overlay_change.kind', 70),
    ('remove_index',        'Remove Index',         'overlay_change.kind', 80),
    ('tweak_relation',      'Tweak Relation',       'overlay_change.kind', 90)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
