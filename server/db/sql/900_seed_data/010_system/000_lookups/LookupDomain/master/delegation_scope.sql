-- LookupDomain/master/delegation_scope.sql
-- Lookup values for domain: master.delegation_scope
-- Idempotent: WHERE NOT EXISTS guard for inserts; explicit DELETE for retired entries

-- Retire the 'ou' entry (operating_unit scope replaced by company_code scope)
DELETE FROM control.lookup_value
WHERE domain_code = 'master.delegation_scope'
  AND code        = 'ou'
  AND tenant_id   IS NULL;

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('task',
     'Task',
     'master.delegation_scope',
     'Delegation scoped to a specific task. '
     'scope_ref = task.id. Delegate can perform task actions on behalf of delegator.',
     10,
     '{"scope_ref_type": "uuid", "scope_ref_entity": "task"}'),

    ('entity',
     'Entity',
     'master.delegation_scope',
     'Delegation scoped to a specific entity instance. '
     'scope_ref = entity_type:entity_id (e.g. ''invoice:uuid''). '
     'Delegate can perform entity operations on behalf of delegator.',
     20,
     '{"scope_ref_type": "entity_ref", "scope_ref_format": "entity_type:uuid"}'),

    ('workflow',
     'Workflow',
     'master.delegation_scope',
     'Delegation scoped to a workflow instance. '
     'scope_ref = workflow_instance.id. '
     'Delegate can action workflow steps on behalf of delegator.',
     30,
     '{"scope_ref_type": "uuid", "scope_ref_entity": "workflow_instance"}'),

    ('module',
     'Module',
     'master.delegation_scope',
     'Delegation scoped to an entire module. '
     'scope_ref = shared.module.code (e.g. ''ap'', ''gl''). '
     'Delegate has delegator-level access to all entities in the module.',
     40,
     '{"scope_ref_type": "module_code", "scope_ref_entity": "shared.module"}'),

    ('company_code',
     'Company Code',
     'master.delegation_scope',
     'Delegation scoped to a company code. '
     'scope_ref = company_code.code (e.g. ''ATHQ''). '
     'Delegate can act on all entities within that company.',
     50,
     '{"scope_ref_type": "code", "scope_ref_entity": "master.company_code"}')

) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code
      AND x.code = v.code
      AND x.tenant_id IS NULL
);
