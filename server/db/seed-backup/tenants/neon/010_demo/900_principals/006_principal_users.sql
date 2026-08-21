-- ============================================================================
-- PRINCIPAL SYSTEM USERS — OWNER & ADMIN PER TENANT / COMPANY CODE
-- ============================================================================
-- File:     003_principal_users.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed two system principal accounts per organisational unit:
--             • <tenant-code>.owner — full operational control
--             • <tenant-code>.admin — administrative access
--           For athyper company codes that do not already have canonical demo
--           owner/admin users:
--             • <cc-code>.owner   — CC-scoped operational control
--             • <cc-code>.admin   — CC-scoped administrative access
--
-- UUID series:
--   Tenant-level:   bb001000-0000-0000-0000-{seq:012x}  (01..02, 2 users)
--   CC-level:       bb002000-0000-0000-0000-{seq:012x}  (01..1a, 1d..22, 32 users)
--
-- Tenant mapping (seq → tenant code):
--   01-02  athyper
--   (odd=owner, even=admin)
--
-- athyper CC mapping (seq → CC code):
--   01-02 ACFB  03-04 ADPM  05-06 AITM  07-08 AJED  09-0a AMRE
--   0b-0c APHS  0d-0e AQTS  0f-10 AQTU  11-12 ASAC  13-14 ASAH
--   15-16 ASGF  17-18 ASPE  19-1a ATEM  1b-1c reserved for ATHQ demo users  1d-1e AUET
--   1f-20 AUIC  21-22 AUKA
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================================

DO $principal_users$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE 0: Fail on any JIT principal conflict; never delete an identity
    -- ══════════════════════════════════════════════════════════════════════

    IF EXISTS (
      SELECT 1
      FROM master.principal p
      JOIN master.principal_profile pp ON pp.principal_id = p.id
      WHERE p.principal_source = 'oidc_jit'
        AND pp.keycloak_id::uuid IN (
          -- Tenant-level UUIDs
          'bb001000-0000-0000-0000-000000000001'::uuid,
          'bb001000-0000-0000-0000-000000000002'::uuid,
          -- CC-level UUIDs
          'bb002000-0000-0000-0000-000000000001'::uuid,
          'bb002000-0000-0000-0000-000000000002'::uuid,
          'bb002000-0000-0000-0000-000000000003'::uuid,
          'bb002000-0000-0000-0000-000000000004'::uuid,
          'bb002000-0000-0000-0000-000000000005'::uuid,
          'bb002000-0000-0000-0000-000000000006'::uuid,
          'bb002000-0000-0000-0000-000000000007'::uuid,
          'bb002000-0000-0000-0000-000000000008'::uuid,
          'bb002000-0000-0000-0000-000000000009'::uuid,
          'bb002000-0000-0000-0000-00000000000a'::uuid,
          'bb002000-0000-0000-0000-00000000000b'::uuid,
          'bb002000-0000-0000-0000-00000000000c'::uuid,
          'bb002000-0000-0000-0000-00000000000d'::uuid,
          'bb002000-0000-0000-0000-00000000000e'::uuid,
          'bb002000-0000-0000-0000-00000000000f'::uuid,
          'bb002000-0000-0000-0000-000000000010'::uuid,
          'bb002000-0000-0000-0000-000000000011'::uuid,
          'bb002000-0000-0000-0000-000000000012'::uuid,
          'bb002000-0000-0000-0000-000000000013'::uuid,
          'bb002000-0000-0000-0000-000000000014'::uuid,
          'bb002000-0000-0000-0000-000000000015'::uuid,
          'bb002000-0000-0000-0000-000000000016'::uuid,
          'bb002000-0000-0000-0000-000000000017'::uuid,
          'bb002000-0000-0000-0000-000000000018'::uuid,
          'bb002000-0000-0000-0000-000000000019'::uuid,
          'bb002000-0000-0000-0000-00000000001a'::uuid,
          'bb002000-0000-0000-0000-00000000001d'::uuid,
          'bb002000-0000-0000-0000-00000000001e'::uuid,
          'bb002000-0000-0000-0000-00000000001f'::uuid,
          'bb002000-0000-0000-0000-000000000020'::uuid,
          'bb002000-0000-0000-0000-000000000021'::uuid,
          'bb002000-0000-0000-0000-000000000022'::uuid
        )
        AND p.id <> pp.keycloak_id::uuid
    ) THEN
      RAISE EXCEPTION
        '[006_principal_users] stable identity conflict; run the reviewed one-time identity migration executor';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal — tenant-level principal users (2)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'internal', 'active', v_su
    FROM (VALUES
        ('bb001000-0000-0000-0000-000000000001'::uuid, 'athyper', 'athyper.owner', 'Athyper Group Owner'),
        ('bb001000-0000-0000-0000-000000000002'::uuid, 'athyper', 'athyper.admin', 'Athyper Group Admin')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal — CC-level principal users (32, all in athyper)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id,
           (SELECT id FROM master.tenant WHERE code = 'athyper' AND realm_key = 'athyper'),
           v.code, v.name,
           'user', false, false, 'internal', 'active', v_su
    FROM (VALUES
        ('bb002000-0000-0000-0000-000000000001'::uuid, 'acfb.owner', 'ACFB Owner'),
        ('bb002000-0000-0000-0000-000000000002'::uuid, 'acfb.admin', 'ACFB Admin'),
        ('bb002000-0000-0000-0000-000000000003'::uuid, 'adpm.owner', 'ADPM Owner'),
        ('bb002000-0000-0000-0000-000000000004'::uuid, 'adpm.admin', 'ADPM Admin'),
        ('bb002000-0000-0000-0000-000000000005'::uuid, 'aitm.owner', 'AITM Owner'),
        ('bb002000-0000-0000-0000-000000000006'::uuid, 'aitm.admin', 'AITM Admin'),
        ('bb002000-0000-0000-0000-000000000007'::uuid, 'ajed.owner', 'AJED Owner'),
        ('bb002000-0000-0000-0000-000000000008'::uuid, 'ajed.admin', 'AJED Admin'),
        ('bb002000-0000-0000-0000-000000000009'::uuid, 'amre.owner', 'AMRE Owner'),
        ('bb002000-0000-0000-0000-00000000000a'::uuid, 'amre.admin', 'AMRE Admin'),
        ('bb002000-0000-0000-0000-00000000000b'::uuid, 'aphs.owner', 'APHS Owner'),
        ('bb002000-0000-0000-0000-00000000000c'::uuid, 'aphs.admin', 'APHS Admin'),
        ('bb002000-0000-0000-0000-00000000000d'::uuid, 'aqts.owner', 'AQTS Owner'),
        ('bb002000-0000-0000-0000-00000000000e'::uuid, 'aqts.admin', 'AQTS Admin'),
        ('bb002000-0000-0000-0000-00000000000f'::uuid, 'aqtu.owner', 'AQTU Owner'),
        ('bb002000-0000-0000-0000-000000000010'::uuid, 'aqtu.admin', 'AQTU Admin'),
        ('bb002000-0000-0000-0000-000000000011'::uuid, 'asac.owner', 'ASAC Owner'),
        ('bb002000-0000-0000-0000-000000000012'::uuid, 'asac.admin', 'ASAC Admin'),
        ('bb002000-0000-0000-0000-000000000013'::uuid, 'asah.owner', 'ASAH Owner'),
        ('bb002000-0000-0000-0000-000000000014'::uuid, 'asah.admin', 'ASAH Admin'),
        ('bb002000-0000-0000-0000-000000000015'::uuid, 'asgf.owner', 'ASGF Owner'),
        ('bb002000-0000-0000-0000-000000000016'::uuid, 'asgf.admin', 'ASGF Admin'),
        ('bb002000-0000-0000-0000-000000000017'::uuid, 'aspe.owner', 'ASPE Owner'),
        ('bb002000-0000-0000-0000-000000000018'::uuid, 'aspe.admin', 'ASPE Admin'),
        ('bb002000-0000-0000-0000-000000000019'::uuid, 'atem.owner', 'ATEM Owner'),
        ('bb002000-0000-0000-0000-00000000001a'::uuid, 'atem.admin', 'ATEM Admin'),
        ('bb002000-0000-0000-0000-00000000001d'::uuid, 'auet.owner', 'AUET Owner'),
        ('bb002000-0000-0000-0000-00000000001e'::uuid, 'auet.admin', 'AUET Admin'),
        ('bb002000-0000-0000-0000-00000000001f'::uuid, 'auic.owner', 'AUIC Owner'),
        ('bb002000-0000-0000-0000-000000000020'::uuid, 'auic.admin', 'AUIC Admin'),
        ('bb002000-0000-0000-0000-000000000021'::uuid, 'auka.owner', 'AUKA Owner'),
        ('bb002000-0000-0000-0000-000000000022'::uuid, 'auka.admin', 'AUKA Admin')
    ) AS v(id, code, name)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_profile — all 34 system principal users
    -- ══════════════════════════════════════════════════════════════════════

    -- shared.trg_set_updated_at() reads app.current_principal_id to set updated_by.
    -- Without this GUC the trigger writes NULL, violating principal_profile_audit_pair_chk.
    PERFORM set_config('app.current_principal_id', v_su::text, true);
    PERFORM set_config('app.iam_profile_kc_frozen', 'false', true);

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        CASE WHEN p.principal_source = 'internal' THEN upper(split_part(p.code, '.', 1)) ELSE '' END,
        CASE
            WHEN lower(p.code) LIKE '%.owner' THEN 'Owner'
            WHEN lower(p.code) LIKE '%.admin' THEN 'Admin'
            ELSE '' END,
        p.name,
        p.id,           -- KC UUID = principal UUID
        p.code,         -- KC username = principal code
        'synced',
        v_su
    FROM master.principal p
    WHERE p.id IN (
        'bb001000-0000-0000-0000-000000000001'::uuid,
        'bb001000-0000-0000-0000-000000000002'::uuid,
        'bb002000-0000-0000-0000-000000000001'::uuid,
        'bb002000-0000-0000-0000-000000000002'::uuid,
        'bb002000-0000-0000-0000-000000000003'::uuid,
        'bb002000-0000-0000-0000-000000000004'::uuid,
        'bb002000-0000-0000-0000-000000000005'::uuid,
        'bb002000-0000-0000-0000-000000000006'::uuid,
        'bb002000-0000-0000-0000-000000000007'::uuid,
        'bb002000-0000-0000-0000-000000000008'::uuid,
        'bb002000-0000-0000-0000-000000000009'::uuid,
        'bb002000-0000-0000-0000-00000000000a'::uuid,
        'bb002000-0000-0000-0000-00000000000b'::uuid,
        'bb002000-0000-0000-0000-00000000000c'::uuid,
        'bb002000-0000-0000-0000-00000000000d'::uuid,
        'bb002000-0000-0000-0000-00000000000e'::uuid,
        'bb002000-0000-0000-0000-00000000000f'::uuid,
        'bb002000-0000-0000-0000-000000000010'::uuid,
        'bb002000-0000-0000-0000-000000000011'::uuid,
        'bb002000-0000-0000-0000-000000000012'::uuid,
        'bb002000-0000-0000-0000-000000000013'::uuid,
        'bb002000-0000-0000-0000-000000000014'::uuid,
        'bb002000-0000-0000-0000-000000000015'::uuid,
        'bb002000-0000-0000-0000-000000000016'::uuid,
        'bb002000-0000-0000-0000-000000000017'::uuid,
        'bb002000-0000-0000-0000-000000000018'::uuid,
        'bb002000-0000-0000-0000-000000000019'::uuid,
        'bb002000-0000-0000-0000-00000000001a'::uuid,
        'bb002000-0000-0000-0000-00000000001d'::uuid,
        'bb002000-0000-0000-0000-00000000001e'::uuid,
        'bb002000-0000-0000-0000-00000000001f'::uuid,
        'bb002000-0000-0000-0000-000000000020'::uuid,
        'bb002000-0000-0000-0000-000000000021'::uuid,
        'bb002000-0000-0000-0000-000000000022'::uuid
    )
    AND p.principal_source = 'internal'
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET keycloak_sync_status = 'synced',
            updated_at           = now(),
            updated_by           = v_su;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: master.principal_identity_binding — all 34 system principal users
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        'athyper', 'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
    WHERE p.id IN (
        'bb001000-0000-0000-0000-000000000001'::uuid,
        'bb001000-0000-0000-0000-000000000002'::uuid,
        'bb002000-0000-0000-0000-000000000001'::uuid,
        'bb002000-0000-0000-0000-000000000002'::uuid,
        'bb002000-0000-0000-0000-000000000003'::uuid,
        'bb002000-0000-0000-0000-000000000004'::uuid,
        'bb002000-0000-0000-0000-000000000005'::uuid,
        'bb002000-0000-0000-0000-000000000006'::uuid,
        'bb002000-0000-0000-0000-000000000007'::uuid,
        'bb002000-0000-0000-0000-000000000008'::uuid,
        'bb002000-0000-0000-0000-000000000009'::uuid,
        'bb002000-0000-0000-0000-00000000000a'::uuid,
        'bb002000-0000-0000-0000-00000000000b'::uuid,
        'bb002000-0000-0000-0000-00000000000c'::uuid,
        'bb002000-0000-0000-0000-00000000000d'::uuid,
        'bb002000-0000-0000-0000-00000000000e'::uuid,
        'bb002000-0000-0000-0000-00000000000f'::uuid,
        'bb002000-0000-0000-0000-000000000010'::uuid,
        'bb002000-0000-0000-0000-000000000011'::uuid,
        'bb002000-0000-0000-0000-000000000012'::uuid,
        'bb002000-0000-0000-0000-000000000013'::uuid,
        'bb002000-0000-0000-0000-000000000014'::uuid,
        'bb002000-0000-0000-0000-000000000015'::uuid,
        'bb002000-0000-0000-0000-000000000016'::uuid,
        'bb002000-0000-0000-0000-000000000017'::uuid,
        'bb002000-0000-0000-0000-000000000018'::uuid,
        'bb002000-0000-0000-0000-000000000019'::uuid,
        'bb002000-0000-0000-0000-00000000001a'::uuid,
        'bb002000-0000-0000-0000-00000000001d'::uuid,
        'bb002000-0000-0000-0000-00000000001e'::uuid,
        'bb002000-0000-0000-0000-00000000001f'::uuid,
        'bb002000-0000-0000-0000-000000000020'::uuid,
        'bb002000-0000-0000-0000-000000000021'::uuid,
        'bb002000-0000-0000-0000-000000000022'::uuid
    )
    AND p.principal_source = 'internal'
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: master.principal_legacy_profile — assign default legacy_profile per user
    -- ══════════════════════════════════════════════════════════════════════
    --
    -- Without a legacy_profile, checkPermissionBatch falls through with
    -- legacy_profile_id=ZERO_UUID — every permission returns 'not_found' and the
    -- ActionBar renders empty. 002_demo_principal_legacy_profiles.sql only seeds
    -- the aa001000-* demo users; the bb001000/bb002000 system principals
    -- created above need their own assignment.
    --
    --   *.owner  → 'owner' legacy_profile (full operational access)
    --   *.admin  → 'admin' legacy_profile (administrative access)

    RAISE NOTICE '[003_principal_users] 34 principal users seeded (2 tenant-level + 32 CC-level)';

END $principal_users$;
