-- LookupDomain/master/project_item_type.sql
-- Lookup values for domain: master.project_item_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('phase',     'Phase',     'master.project_item_type', 'Major project phase',     10),
    ('task',      'Task',      'master.project_item_type', 'Actionable work item',    20),
    ('milestone', 'Milestone', 'master.project_item_type', 'Deliverable checkpoint',  30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
