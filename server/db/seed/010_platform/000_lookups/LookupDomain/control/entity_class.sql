-- LookupDomain/control/entity_class.sql
-- Lookup values for domain: entity.entity_class
-- Codes are lowercase per lookup_value_code_fmt constraint.
-- Note: control.entity.entity_class column stores UPPERCASE values;
--       the EnumRenderer does case-insensitive matching to bridge the gap.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('reference',         'Reference',          'entity.entity_class',  10),
    ('master',            'Master',             'entity.entity_class',  20),
    ('control',           'Control',            'entity.entity_class',  30),
    ('document',          'Document',           'entity.entity_class',  40),
    ('document_relation', 'Document Relation',  'entity.entity_class',  50),
    ('ledger',            'Ledger',             'entity.entity_class',  60),
    ('log',               'Log',                'entity.entity_class',  70),
    ('aggregate',         'Aggregate',          'entity.entity_class',  80),
    ('dimension',         'Dimension',          'entity.entity_class',  90),
    ('relation',          'Relation',           'entity.entity_class', 100)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
