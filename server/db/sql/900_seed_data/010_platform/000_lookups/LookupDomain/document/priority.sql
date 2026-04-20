-- LookupDomain/document/priority.sql
-- Lookup values for domain: document.priority
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('low',    'Low',    'document.priority', 'Non-urgent.',     10, '{"sla_minutes":2880,"escalate_on_creation":false}'),
    ('normal', 'Normal', 'document.priority', 'Standard.',      20, '{"sla_minutes":2880,"escalate_on_creation":false}'),
    ('high',   'High',   'document.priority', 'Expedited.',     30, '{"sla_minutes":1440,"escalate_on_creation":false}'),
    ('urgent', 'Urgent', 'document.priority', 'Immediate.',     40, '{"sla_minutes":240,"escalate_on_creation":true}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
