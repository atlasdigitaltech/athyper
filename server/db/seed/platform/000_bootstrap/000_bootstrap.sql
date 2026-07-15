-- Bootstrap: system tenant + system principal (both self-referential).
-- MUST execute FIRST — every other seed depends on this principal.
-- session_replication_role = replica bypasses FK/CHECK triggers so the self-refs can be inserted.

BEGIN;

SET LOCAL session_replication_role = replica;

-- §1  System Tenant — well-known UUID, required by principal FK
INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, tenant_type, region, subscription,
    status, created_by
)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'system',
    'System Tenant',
    'System',
    'athyper',
    'platform_internal',
    NULL,
    'base',
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid   -- self-ref bootstrap
)
ON CONFLICT (id) DO UPDATE SET
    tenant_type = EXCLUDED.tenant_type,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

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
