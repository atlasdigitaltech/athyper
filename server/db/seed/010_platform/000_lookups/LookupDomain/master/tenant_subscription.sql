-- LookupDomain/master/tenant_subscription.sql
-- Lookup values for domain: master.tenant_subscription
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('trial', 'Trial',
     'master.tenant_subscription',
     'Time-limited free trial. Full feature access with reduced quotas. Converts to base or paid tier.',
     10),
    ('base', 'Base',
     'master.tenant_subscription',
     'Default free or low-cost tier. Core platform features. Limited principals, storage, and API calls.',
     20),
    ('starter', 'Starter',
     'master.tenant_subscription',
     'Entry-level paid tier. Increased quotas, email support, basic integrations.',
     30),
    ('professional', 'Professional',
     'master.tenant_subscription',
     'Mid-market tier. Full feature set, higher quotas, SSO, priority support.',
     40),
    ('enterprise', 'Enterprise',
     'master.tenant_subscription',
     'Enterprise tier. Unlimited principals, dedicated support, custom SLA, advanced compliance features.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
