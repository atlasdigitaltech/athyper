-- LookupDomain/master/warehouse_type.sql
-- Lookup values for domain: master.warehouse_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('raw',            'Raw Materials',  'master.warehouse_type', 'Raw material storage',      10),
    ('finished_goods', 'Finished Goods', 'master.warehouse_type', 'Finished product storage',  20),
    ('spares',         'Spares',         'master.warehouse_type', 'Spare parts / MRO',         30),
    ('transit',        'In-Transit',     'master.warehouse_type', 'Goods in transit',           40),
    ('returns',        'Returns',        'master.warehouse_type', 'Customer returns / RMA',     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
