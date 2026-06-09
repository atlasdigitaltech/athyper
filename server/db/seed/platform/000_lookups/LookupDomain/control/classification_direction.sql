-- LookupDomain/control/classification_direction.sql
-- Lookup values for domain: control.classification_direction
-- Flow direction scope for commodity_classification_to_intent_rule.direction.
-- Lookup codes are lowercase; commodity_classification_to_intent_rule stores uppercase.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('inbound',  'Inbound',       'control.classification_direction', 10),
    ('outbound', 'Outbound',      'control.classification_direction', 20),
    ('both',     'Both',          'control.classification_direction', 30)
) AS v(code, name, domain_code, sort)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
