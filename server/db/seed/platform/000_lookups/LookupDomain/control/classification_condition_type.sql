-- Codes are lowercase; commodity_classification_to_intent_rule.condition_type stores uppercase
-- (EnumRenderer does case-insensitive matching).

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('amount_above',         'Amount Above Threshold', 'control.classification_condition_type',  10),
    ('amount_below',         'Amount Below Threshold', 'control.classification_condition_type',  20),
    ('is_recurring',         'Is Recurring',           'control.classification_condition_type',  30),
    ('is_one_time',          'Is One Time',            'control.classification_condition_type',  40),
    ('company_match',        'Company Match',          'control.classification_condition_type',  50),
    ('procurement_method',   'Procurement Method',     'control.classification_condition_type',  60),
    ('cross_border',         'Cross Border',           'control.classification_condition_type',  70),
    ('doc_type_match',       'Document Type Match',    'control.classification_condition_type',  80),
    ('commodity_match',      'Commodity Match',        'control.classification_condition_type',  90),
    ('supplier_match',       'Supplier Match',         'control.classification_condition_type', 100),
    ('customer_match',       'Customer Match',         'control.classification_condition_type', 110),
    ('customer_tier',        'Customer Tier',          'control.classification_condition_type', 120),
    ('contract_type_match',  'Contract Type Match',    'control.classification_condition_type', 130),
    ('flow_match',           'Flow Match',             'control.classification_condition_type', 140),
    ('channel_match',        'Channel Match',          'control.classification_condition_type', 150),
    ('fallback',             'Fallback',               'control.classification_condition_type', 160)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

UPDATE control.lookup_value
   SET status = 'deprecated',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE domain_code = 'control.classification_condition_type'
   AND tenant_id IS NULL
   AND code IN ('amount_between','amount_based','commodity_based','supplier_type','date_range')
   AND status <> 'deprecated';
