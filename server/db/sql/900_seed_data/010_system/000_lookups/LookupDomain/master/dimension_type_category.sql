-- LookupDomain/master/dimension_type_category.sql
-- Lookup domain + values for master.dimension_type.category
-- is_extensible = false — categories are platform-governed.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.dimension_type_category',
       'Dimension type category',
       'Classification of dimension types: SYSTEM (first-class with dedicated tables), '
       'STANDARD (platform-defined reusable), CUSTOM (tenant-created). '
       'Platform-governed — not tenant-extensible.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.dimension_type_category'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('system',
     'System',
     'master.dimension_type_category',
     'First-class dimensions backed by dedicated master tables (cost_center, profit_center, project). '
     'Values are synced from the source table via source_entity_name / source_table binding.',
     10),
    ('standard',
     'Standard',
     'master.dimension_type_category',
     'Platform-defined reusable dimensions (department, region, channel, fund, segment). '
     'Values stored in master.dimension_value.',
     20),
    ('custom',
     'Custom',
     'master.dimension_type_category',
     'Tenant-created dimensions (campaign, grant, product_line, territory). '
     'Values stored in master.dimension_value.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
