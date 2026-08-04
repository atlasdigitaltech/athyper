-- seed-pack-version: p2.7-v1
-- Immutable defaults are copied into authored runtime profiles. They are not
-- live inheritance and deliberately contain no UI, policy, audit, or cache
-- property bags.
INSERT INTO metadata.entity_class_profile (
    entity_class,
    profile_version,
    fallback_name,
    description,
    default_backing_kind,
    default_api_exposure,
    default_read_mode,
    default_write_mode,
    default_concurrency_mode,
    default_change_policy,
    created_by
)
VALUES
    ('business', 1, 'Business Entity',
     'Tenant business records with controlled change; concurrency is selected by each runtime profile.',
     'table', 'api', 'generic', 'generic', 'none', 'controlled',
     '00000000-0000-0000-0000-000000000000'),
    ('configuration', 1, 'Configuration Entity',
     'Tenant configuration records whose changes are reviewed and explicitly published.',
     'table', 'api', 'generic', 'generic', 'none', 'controlled',
     '00000000-0000-0000-0000-000000000000'),
    ('reference', 1, 'Reference Entity',
     'Reusable reference records with generic reads and controlled extension.',
     'table', 'api', 'generic', 'generic', 'none', 'extensible',
     '00000000-0000-0000-0000-000000000000'),
    ('process', 1, 'Process Entity',
     'Stateful process contracts catalogued without assuming runtime handlers; exposure is enabled by an authored runtime profile.',
     'table', 'catalog_only', 'none', 'none', 'none', 'controlled',
     '00000000-0000-0000-0000-000000000000'),
    ('projection', 1, 'Projection Entity',
     'Read-only derived records exposed through projection semantics.',
     'view', 'api', 'projection', 'none', 'none', 'locked',
     '00000000-0000-0000-0000-000000000000'),
    ('technical', 1, 'Technical Entity',
     'Internal runtime state hidden from generic APIs and locked to package ownership.',
     'table', 'none', 'none', 'none', 'none', 'locked',
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (entity_class) DO NOTHING;

DO $assert_entity_class_profiles$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM metadata.entity_class_profile
     WHERE profile_version = 1;
    IF v_count <> 6 THEN
        RAISE EXCEPTION '[meta-entity P2.7] expected six immutable class profiles, found %', v_count;
    END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES
            ('business',      'table', 'api',          'generic',    'generic', 'none', 'controlled'),
            ('configuration', 'table', 'api',          'generic',    'generic', 'none', 'controlled'),
            ('reference',     'table', 'api',          'generic',    'generic', 'none', 'extensible'),
            ('process',       'table', 'catalog_only', 'none',       'none',    'none', 'controlled'),
            ('projection',    'view',  'api',  'projection', 'none',    'none',       'locked'),
            ('technical',     'table', 'none', 'none',       'none',    'none',       'locked')
          ) AS expected(entity_class, backing_kind, api_exposure, read_mode,
                        write_mode, concurrency_mode, change_policy)
          LEFT JOIN metadata.entity_class_profile AS actual
            ON actual.entity_class::text = expected.entity_class
         WHERE actual.entity_class IS NULL
            OR actual.profile_version <> 1
            OR actual.default_backing_kind::text <> expected.backing_kind
            OR actual.default_api_exposure::text <> expected.api_exposure
            OR actual.default_read_mode::text <> expected.read_mode
            OR actual.default_write_mode::text <> expected.write_mode
            OR actual.default_concurrency_mode::text <> expected.concurrency_mode
            OR actual.default_change_policy::text <> expected.change_policy
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] immutable class-profile contract drift detected';
    END IF;
END
$assert_entity_class_profiles$;
