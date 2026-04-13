-- 900_seed_data/000_public/000_bootstrap.sql
-- Bootstrap: system tenant + system principal (self-referential)
-- Must execute FIRST — before all other seeds.
-- Uses session_replication_role = replica to bypass FK/CHECK triggers during bootstrap.

BEGIN;

SET LOCAL session_replication_role = replica;

-- §1  System Tenant — well-known UUID, required by principal FK
INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, region, subscription,
    status, created_by
)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'system',
    'System Tenant',
    'System',
    'athyper',
    NULL,
    'base',
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid   -- self-ref bootstrap
)
ON CONFLICT (id) DO NOTHING;

-- §2  System Principal — self-referential created_by
INSERT INTO master.principal (
    id, tenant_id, code, name, principal_type,
    is_service_account,
    status, created_by
)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,   -- system tenant
    'systemadmin',
    'System Administrator',
    'SYSTEM',
    true,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid    -- self-referential bootstrap
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
-- session_replication_role resets automatically at transaction end (SET LOCAL).
