-- LookupDomain/master/principal_identity_binding_sync_status.sql
-- Lookup values for domain: master.principal_identity_binding.sync_status
-- IdP synchronization health for principal identity bindings.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('pending',  'Pending',  'master.principal_identity_binding.sync_status', 'Sync pending.',                10),
    ('synced',   'Synced',   'master.principal_identity_binding.sync_status', 'Sync completed.',              20),
    ('drift',    'Drift',    'master.principal_identity_binding.sync_status', 'Provider drift detected.',     30),
    ('error',    'Error',    'master.principal_identity_binding.sync_status', 'Sync error.',                  40),
    ('disabled', 'Disabled', 'master.principal_identity_binding.sync_status', 'Provider identity disabled.', 50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
