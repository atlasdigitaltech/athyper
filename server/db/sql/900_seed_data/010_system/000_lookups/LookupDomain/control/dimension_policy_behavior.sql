-- LookupDomain/control/dimension_policy_behavior.sql
-- Lookup domain + values for control.dimension_policy.behavior
-- is_extensible = false — behaviors are engine-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'control.dimension_policy_behavior',
       'Dimension policy behavior',
       'How a dimension should be treated on transactions within policy scope. '
       'Engine-governed — not tenant-extensible.',
       'control', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'control.dimension_policy_behavior'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('required',
     'Required',
     'control.dimension_policy_behavior',
     'Dimension must be provided. Posting is rejected without it.',
     10),
    ('optional',
     'Optional',
     'control.dimension_policy_behavior',
     'Dimension may be provided but is not enforced.',
     20),
    ('forbidden',
     'Forbidden',
     'control.dimension_policy_behavior',
     'Dimension must NOT be provided. Posting is rejected if it is present.',
     30),
    ('derive_if_missing',
     'Derive if missing',
     'control.dimension_policy_behavior',
     'System derives value from context (derive_source) if the user does not provide one.',
     40),
    ('inherit_from_header',
     'Inherit from header',
     'control.dimension_policy_behavior',
     'Line inherits the dimension value from the document header. User cannot override.',
     50),
    ('fixed_value',
     'Fixed value',
     'control.dimension_policy_behavior',
     'System always stamps the configured fixed_value_id. User cannot override.',
     60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
