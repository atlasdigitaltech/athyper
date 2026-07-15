INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pending', 'Pending',
     'master.tenant_relationship_status',
     'Relationship has been prepared but not yet invited or accepted.',
     10),
    ('invited', 'Invited',
     'master.tenant_relationship_status',
     'Invite has been sent and is awaiting recipient action.',
     20),
    ('active', 'Active',
     'master.tenant_relationship_status',
     'Relationship is active and eligible for grants/delegations.',
     30),
    ('suspended', 'Suspended',
     'master.tenant_relationship_status',
     'Relationship is temporarily blocked without deleting history.',
     40),
    ('revoked', 'Revoked',
     'master.tenant_relationship_status',
     'Relationship was explicitly revoked.',
     50),
    ('rejected', 'Rejected',
     'master.tenant_relationship_status',
     'Invite or relationship request was rejected.',
     60),
    ('expired', 'Expired',
     'master.tenant_relationship_status',
     'Invite or relationship window expired.',
     70),
    ('archived', 'Archived',
     'master.tenant_relationship_status',
     'Historical relationship retained for audit only.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
