-- ============================================================================
-- TENANT ONBOARDING - Step 1: Tenant Record
-- ============================================================================
-- Replace all occurrences of:
--   __CLIENT_CODE__      -> short lowercase identifier, e.g. acme
--   __CLIENT_NAME__      -> display name, e.g. Acme Corporation
--   __CLIENT_UUID__      -> new UUID v7 (SELECT shared.uuidv7())
--   __REALM_KEY__        -> auth realm key, e.g. athyper/neon/mesh/admin
--   __TENANT_TYPE__      -> lookup master.tenant_type, e.g. customer
--   __REGION__           -> reporting region, e.g. MY
--   __SUBSCRIPTION__     -> subscription tier, e.g. base
-- ============================================================================

BEGIN;

INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, tenant_type, region, subscription,
    status, created_by
)
VALUES (
    '__CLIENT_UUID__',
    '__CLIENT_CODE__',
    '__CLIENT_NAME__',
    '__CLIENT_NAME__',
    '__REALM_KEY__',
    '__TENANT_TYPE__',
    '__REGION__',
    '__SUBSCRIPTION__',
    'active',
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (realm_key, code) DO UPDATE SET
    name         = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    tenant_type  = EXCLUDED.tenant_type,
    region       = EXCLUDED.region,
    subscription = EXCLUDED.subscription,
    status       = EXCLUDED.status,
    updated_at   = now(),
    updated_by   = '00000000-0000-0000-0000-000000000000'
WHERE (master.tenant.name, master.tenant.display_name, master.tenant.tenant_type,
       master.tenant.region, master.tenant.subscription, master.tenant.status)
   IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.display_name, EXCLUDED.tenant_type,
       EXCLUDED.region, EXCLUDED.subscription, EXCLUDED.status);

COMMIT;
