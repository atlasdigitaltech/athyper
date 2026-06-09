-- ============================================================================
-- ATHQ PRINCIPALS (principal + profile only — NO auth binding)
-- ============================================================================
-- File:     004_athq_principals.sql
-- Schemas:  master.principal, master.principal_profile
-- Purpose:  Pre-seed ATHQ entity users (principal + profile only).
--
-- WHY no auth binding here:
--   principal_identity_binding.subject_id must equal the Keycloak user's UUID
--   (the `sub` JWT claim). For users created manually in Keycloak the UUID
--   is auto-generated and NOT predictable at seed time.
--   The JIT service (jit.service.ts) creates/updates the binding on first
--   login using the real KC sub. Seeding a wrong subject_id here would block
--   JIT from working due to a UNIQUE(tenant_id, principal_id, realm_key, provider_code)
--   constraint conflict.
--
--   001_demo_principals.sql IS safe to include bindings because those users
--   are created in Keycloak via realm-import with explicit UUIDs that match.
--
-- Depends:  002_demo_tenants.sql
-- Idempotent: Yes — ON CONFLICT DO NOTHING throughout
--
-- Stable UUID series (continuing from 001_demo_principals.sql):
--   aa000015-…001  → athq.agent  (athyper tenant)
-- ============================================================================

DO $athq_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- Column order: id, tenant_id, code, name, principal_type, is_locked,
    --               is_service_account, principal_source, status, created_by
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    ) VALUES

    -- athyper tenant — ATHQ entity agent user
    ('aa000015-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'athq.agent', 'ATHQ Agent',
     'user', false, false, 'oidc_jit', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- keycloak_id is intentionally left as the placeholder UUID here.
    -- JIT will overwrite it with the real KC sub on first login.
    -- Column order: tenant_id, principal_id, given_name, family_name,
    --               display_name, keycloak_id, keycloak_username,
    --               keycloak_sync_status, created_by
    -- ══════════════════════════════════════════════════════════════════════════

    -- Use a SELECT-based insert to resolve the actual principal UUID at runtime.
    -- The principal may already exist (from 001_demo_principals.sql) with a
    -- different UUID, so hardcoding the UUID here would cause an FK violation.
    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id, p.id,
        'ATHQ', 'Agent', 'ATHQ Agent',
        p.id, 'athq.agent', 'pending', v_su
    FROM master.principal p
    JOIN master.tenant t ON t.id = p.tenant_id
    WHERE t.realm_key = 'athyper' AND t.code = 'athyper' AND p.code = 'athq.agent'
    ON CONFLICT (tenant_id, principal_id) DO NOTHING;

    RAISE NOTICE '[004_athq_principals] ATHQ Agent principal + profile seeded (auth binding created by JIT on first login)';

END $athq_principals$;
