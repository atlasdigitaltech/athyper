-- LookupDomain/master/dimension_type_status.sql
-- Lookup domain + values for master.dimension_type.status
-- is_extensible = false — lifecycle states are platform-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.dimension_type_status',
       'Dimension type status',
       'Lifecycle states for master.dimension_type. '
       'Platform-governed — not tenant-extensible.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.dimension_type_status'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',
     'Active',
     'master.dimension_type_status',
     'Dimension type is available for use. New dimension_value rows may be created.',
     10),
    ('inactive',
     'Inactive',
     'master.dimension_type_status',
     'Temporarily disabled. Existing values remain visible but no new values may be added. '
     'Cannot be deactivated while active dimension_value rows exist.',
     20),
    ('archived',
     'Archived',
     'master.dimension_type_status',
     'Permanently retired. Terminal state — no further transitions allowed.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
