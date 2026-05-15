-- LookupDomain/control/field_data_type.sql
-- Lookup values for domain: entity_field.data_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('string',      'String',      'entity_field.data_type', 10),
    ('text',        'Text',        'entity_field.data_type', 11),
    ('integer',     'Integer',     'entity_field.data_type', 20),
    ('bigint',      'Bigint',      'entity_field.data_type', 21),
    ('decimal',     'Decimal',     'entity_field.data_type', 30),
    ('numeric',     'Numeric',     'entity_field.data_type', 31),
    ('boolean',     'Boolean',     'entity_field.data_type', 40),
    ('uuid',        'UUID',        'entity_field.data_type', 50),
    ('date',        'Date',        'entity_field.data_type', 60),
    ('datetime',    'Datetime',    'entity_field.data_type', 61),
    ('timestamptz', 'Timestamptz', 'entity_field.data_type', 62),
    ('json',        'JSON',        'entity_field.data_type', 70),
    ('jsonb',       'JSONB',       'entity_field.data_type', 71),
    ('enum',             'Enum',             'entity_field.data_type',  80),
    ('lifecycle_state',  'Lifecycle State',  'entity_field.data_type',  85),
    ('reference',        'Reference',        'entity_field.data_type',  90),
    ('money',       'Money',       'entity_field.data_type', 100),
    ('tsvector',    'TSVector',    'entity_field.data_type', 110),
    ('text_array',  'Text Array',  'entity_field.data_type', 120),
    ('uuid_array',  'UUID Array',  'entity_field.data_type', 121),
    ('int_array',   'Int Array',   'entity_field.data_type', 122),
    ('jsonb_array', 'JSONB Array', 'entity_field.data_type', 123)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
