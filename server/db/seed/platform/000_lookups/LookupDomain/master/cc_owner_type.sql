INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('product',          'Product',          'master.cc_owner_type', 'Catalog item',               10),
    ('commodity_category','Commodity Category','master.cc_owner_type', 'Shared commodity category',  35),
    ('item',              'Item',              'master.cc_owner_type', 'Company inventory config',   40),
    ('customer',          'Customer',          'master.cc_owner_type', 'AR counterparty',            50),
    ('supplier',          'Supplier',          'master.cc_owner_type', 'AP counterparty',            60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

UPDATE control.lookup_value
   SET status = 'deprecated',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE domain_code = 'master.cc_owner_type'
   AND tenant_id IS NULL
   AND code = 'spend_category'
   AND status <> 'deprecated';
