-- LookupDomain/master/dimension_value_status.sql
-- Lookup domain + values for master.dimension_value.status
-- is_extensible = false — lifecycle states are platform-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.dimension_value_status',
       'Dimension value status',
       'Lifecycle states for master.dimension_value. '
       'BLOCKED prevents posting but keeps the value visible for reporting. '
       'Platform-governed — not tenant-extensible.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.dimension_value_status'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',
     'Active',
     'master.dimension_value_status',
     'Available for posting, budgeting, and planning.',
     10),
    ('inactive',
     'Inactive',
     'master.dimension_value_status',
     'Temporarily disabled. Hidden from entry UIs but visible in historical reports.',
     20),
    ('blocked',
     'Blocked',
     'master.dimension_value_status',
     'Visible in reports but rejected at posting time. '
     'is_posting_allowed is forced to false when status = blocked (enforced by constraint).',
     30),
    ('archived',
     'Archived',
     'master.dimension_value_status',
     'Permanently retired. Terminal state — no further transitions allowed.',
     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
