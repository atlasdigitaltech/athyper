-- Codes are lowercase; commodity_classification_to_intent_rule.classification_source stores uppercase
-- (EnumRenderer does case-insensitive matching).

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('commodity_category', 'Commodity Category', 'control.classification_source', 10),
    ('product',            'Product',            'control.classification_source', 30),
    ('service',            'Service',            'control.classification_source', 40),
    ('item_group',         'Item Group',         'control.classification_source', 50),
    ('revenue_type',       'Revenue Type',       'control.classification_source', 60)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

UPDATE control.lookup_value
   SET status = 'deprecated',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE domain_code = 'control.classification_source'
   AND tenant_id IS NULL
   AND code IN ('commodity','supplier','spend_category')
   AND status <> 'deprecated';
