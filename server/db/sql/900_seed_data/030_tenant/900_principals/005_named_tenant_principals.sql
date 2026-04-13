-- ============================================================================
-- NAMED & DEMO TENANT PERSONA USERS — PRINCIPAL + PROFILE + AUTH BINDING
-- ============================================================================
-- File:     005_named_tenant_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_auth_binding
-- Purpose:  Pre-seed persona users so that KC → DB identity resolution works
--           on first login without JIT.
--
-- KEY DESIGN: KC user UUID == DB principal UUID == subject_id in auth binding.
--   These users are imported into KC via realm-demosetup.json with explicit
--   UUIDs that match the values here.
--
-- Series aa000001 — extra athyper/ATHQ users:
--   athyper  athyper--athq  kumar           aa000001-…001
--   athyper  athyper--athq  raja            aa000001-…002
--   athyper  athyper--athq  rama            aa000001-…003
--   athyper  athyper--athq  laks            aa000001-…004
--
-- Series aa000002-aa000014 — named/demo tenant persona users:
--   athyper-hq1  athyper-hq1--athq  siti.aminah   aa000002-…001
--   pepsi        pepsi--pepsi        michael.torres aa000003-…001
--   coke         coke--coke          sarah.johnson  aa000004-…001
--   maaza        maaza--maaza        rahul.gupta    aa000005-…001
--   demo_ca      demo_ca--democa     david.chen     aa000006-…001
--   demo_ch      demo_ch--democh     sophie.mueller aa000007-…001
--   demo_de      demo_de--demode     hans.weber     aa000008-…001
--   demo_fr      demo_fr--demofr     pierre.dupont  aa000009-…001
--   demo_in      demo_in--demoin     priya.sharma   aa000010-…001
--   demo_my      demo_my--demomy     ahmad.razak    aa000011-…001
--   demo_qa      demo_qa--demoqa     khalid.althani aa000012-…001
--   demo_sa      demo_sa--demosa     omar.hassan    aa000013-…001
--   demo_us      demo_us--demous     jennifer.smith aa000014-…001
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $named_tenant_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'oidc_jit', 'active', v_su
    FROM (VALUES
        -- aa000001 series — extra athyper/ATHQ users
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'athyper', 'kumar', 'Kumar Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'athyper', 'raja',  'Raja Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'athyper', 'rama',  'Rama Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'athyper', 'laks',  'Lakshmi Narayanan'),
        -- aa000002-aa000014 series — named/demo tenant persona users
        ('aa000002-0000-0000-0000-000000000001'::uuid, 'athyper-hq1', 'siti.aminah',    'Siti Aminah'),
        ('aa000003-0000-0000-0000-000000000001'::uuid, 'pepsi',       'michael.torres', 'Michael Torres'),
        ('aa000004-0000-0000-0000-000000000001'::uuid, 'coke',        'sarah.johnson',  'Sarah Johnson'),
        ('aa000005-0000-0000-0000-000000000001'::uuid, 'maaza',       'rahul.gupta',    'Rahul Gupta'),
        ('aa000006-0000-0000-0000-000000000001'::uuid, 'demo_ca',     'david.chen',     'David Chen'),
        ('aa000007-0000-0000-0000-000000000001'::uuid, 'demo_ch',     'sophie.mueller', 'Sophie Mueller'),
        ('aa000008-0000-0000-0000-000000000001'::uuid, 'demo_de',     'hans.weber',     'Hans Weber'),
        ('aa000009-0000-0000-0000-000000000001'::uuid, 'demo_fr',     'pierre.dupont',  'Pierre Dupont'),
        ('aa000010-0000-0000-0000-000000000001'::uuid, 'demo_in',     'priya.sharma',   'Priya Sharma'),
        ('aa000011-0000-0000-0000-000000000001'::uuid, 'demo_my',     'ahmad.razak',    'Ahmad Razak'),
        ('aa000012-0000-0000-0000-000000000001'::uuid, 'demo_qa',     'khalid.althani', 'Khalid Al-Thani'),
        ('aa000013-0000-0000-0000-000000000001'::uuid, 'demo_sa',     'omar.hassan',    'Omar Hassan'),
        ('aa000014-0000-0000-0000-000000000001'::uuid, 'demo_us',     'jennifer.smith', 'Jennifer Smith')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage A: 17 principals seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- keycloak_id = principal UUID (matches KC import UUID in realm-demosetup.json)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id, p.id,
        v.given_name, v.family_name, p.name,
        p.id,       -- KC UUID = principal UUID
        p.code,     -- KC username = principal code
        'synced',
        v_su
    FROM (VALUES
        -- aa000001 series
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'Kumar',    'Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'Raja',     'Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'Rama',     'Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'Lakshmi',  'Narayanan'),
        -- aa000002-aa000014 series
        ('aa000002-0000-0000-0000-000000000001'::uuid, 'Siti',     'Aminah'),
        ('aa000003-0000-0000-0000-000000000001'::uuid, 'Michael',  'Torres'),
        ('aa000004-0000-0000-0000-000000000001'::uuid, 'Sarah',    'Johnson'),
        ('aa000005-0000-0000-0000-000000000001'::uuid, 'Rahul',    'Gupta'),
        ('aa000006-0000-0000-0000-000000000001'::uuid, 'David',    'Chen'),
        ('aa000007-0000-0000-0000-000000000001'::uuid, 'Sophie',   'Mueller'),
        ('aa000008-0000-0000-0000-000000000001'::uuid, 'Hans',     'Weber'),
        ('aa000009-0000-0000-0000-000000000001'::uuid, 'Pierre',   'Dupont'),
        ('aa000010-0000-0000-0000-000000000001'::uuid, 'Priya',    'Sharma'),
        ('aa000011-0000-0000-0000-000000000001'::uuid, 'Ahmad',    'Razak'),
        ('aa000012-0000-0000-0000-000000000001'::uuid, 'Khalid',   'Al-Thani'),
        ('aa000013-0000-0000-0000-000000000001'::uuid, 'Omar',     'Hassan'),
        ('aa000014-0000-0000-0000-000000000001'::uuid, 'Jennifer', 'Smith')
    ) AS v(principal_id, given_name, family_name)
    JOIN master.principal p ON p.id = v.principal_id
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET given_name           = EXCLUDED.given_name,
            family_name          = EXCLUDED.family_name,
            display_name         = EXCLUDED.display_name,
            keycloak_id          = EXCLUDED.keycloak_id,
            keycloak_username    = EXCLUDED.keycloak_username,
            keycloak_sync_status = EXCLUDED.keycloak_sync_status;

    RAISE NOTICE '[005_named_tenant_principals] Stage B: 17 principal profiles seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_auth_binding
    -- provider_code = 'keycloak', subject_id = KC UUID (= principal.id)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_auth_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id, p.id,
        'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
    WHERE p.id IN (
        'aa000001-0000-0000-0000-000000000001'::uuid,
        'aa000001-0000-0000-0000-000000000002'::uuid,
        'aa000001-0000-0000-0000-000000000003'::uuid,
        'aa000001-0000-0000-0000-000000000004'::uuid,
        'aa000002-0000-0000-0000-000000000001'::uuid,
        'aa000003-0000-0000-0000-000000000001'::uuid,
        'aa000004-0000-0000-0000-000000000001'::uuid,
        'aa000005-0000-0000-0000-000000000001'::uuid,
        'aa000006-0000-0000-0000-000000000001'::uuid,
        'aa000007-0000-0000-0000-000000000001'::uuid,
        'aa000008-0000-0000-0000-000000000001'::uuid,
        'aa000009-0000-0000-0000-000000000001'::uuid,
        'aa000010-0000-0000-0000-000000000001'::uuid,
        'aa000011-0000-0000-0000-000000000001'::uuid,
        'aa000012-0000-0000-0000-000000000001'::uuid,
        'aa000013-0000-0000-0000-000000000001'::uuid,
        'aa000014-0000-0000-0000-000000000001'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage C: 17 auth bindings seeded';
    RAISE NOTICE '[005_named_tenant_principals] Complete — 17 persona users ready (4 athyper/ATHQ + 13 named/demo tenant)';

END $named_tenant_principals$;
