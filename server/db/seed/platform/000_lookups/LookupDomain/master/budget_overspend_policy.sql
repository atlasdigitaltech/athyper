-- Used by: budget_profile.overspend_policy, budget_allocation.overspend_policy.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('block',            'Block',            'master.budget_overspend_policy', 'Hard stop — transaction rejected if budget exceeded',      10),
    ('warn',             'Warn',             'master.budget_overspend_policy', 'Warning shown but transaction can proceed',                20),
    ('allow',            'Allow',            'master.budget_overspend_policy', 'Silent allow — no warning or approval required',           30),
    ('require_approval', 'Require Approval', 'master.budget_overspend_policy', 'Transaction escalated for approval before proceeding',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
