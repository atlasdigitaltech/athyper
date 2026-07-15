-- Codes are lowercase; commodity_classification_to_intent_rule.applies_to_flows (text[])
-- stores uppercase (NON_PO, DIRECT_PURCHASE) — EnumRenderer does case-insensitive matching.

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('non_po',            'Non-PO',            'control.procurement_flow_type', 10),
    ('po_based',          'PO-Based',          'control.procurement_flow_type', 20),
    ('contract_based',    'Contract-Based',    'control.procurement_flow_type', 30),
    ('one_time_supplier', 'One-Time Supplier', 'control.procurement_flow_type', 40),
    ('direct_purchase',   'Direct Purchase',   'control.procurement_flow_type', 50)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
