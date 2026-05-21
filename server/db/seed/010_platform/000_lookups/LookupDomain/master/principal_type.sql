-- LookupDomain/master/principal_type.sql
-- Lookup values for domain: master.principal_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('user', 'User',
     'master.principal_type',
     'Legacy generic human user type. Kept for compatibility; new seeded human users should prefer tenant_user, partner_user, platform_staff, product_owner, or support_user.',
     10),
    ('tenant_user', 'Tenant User',
     'master.principal_type',
     'Neon tenant application user. Scoped by tenant membership and tenant-owned business data.',
     11),
    ('tenant_admin', 'Tenant Admin',
     'master.principal_type',
     'Neon tenant administrator for tenant-local setup and user administration.',
     12),
    ('partner_user', 'Partner User',
     'master.principal_type',
     'Mesh partner user. Access to customer tenants requires explicit tenant_relationship and grants.',
     13),
    ('partner_admin', 'Partner Admin',
     'master.principal_type',
     'Mesh partner administrator for a partner organization.',
     14),
    ('platform_staff', 'Platform Staff',
     'master.principal_type',
     'Athyper internal admin-plane user for platform operations.',
     15),
    ('product_owner', 'Product Owner',
     'master.principal_type',
     'Athyper product owner identity from platform-control realm.',
     16),
    ('support_user', 'Support User',
     'master.principal_type',
     'Tenant-local shadow principal used for audited product-owner support access.',
     17),
    ('integration_user', 'Integration User',
     'master.principal_type',
     'Human-owned integration or API actor that is distinct from a non-human service account.',
     18),
    ('service_account', 'Service Account',
     'master.principal_type',
     'Non-human actor representing an application or integration. is_service_account=true, no MFA required.',
     20),
    ('bot', 'Bot',
     'master.principal_type',
     'Automated agent performing platform tasks (e.g. scheduler, data pipeline). Operates without login session.',
     30),
    ('system', 'System',
     'master.principal_type',
     'Platform-internal system principal. Reserved for the bootstrap systemadmin actor. Cannot be assigned to new principals.',
     0)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
