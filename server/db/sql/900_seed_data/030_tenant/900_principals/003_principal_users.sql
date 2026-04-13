-- ============================================================================
-- PRINCIPAL SYSTEM USERS — OWNER & ADMIN PER TENANT / COMPANY CODE
-- ============================================================================
-- File:     003_principal_users.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_auth_binding
-- Purpose:  Pre-seed two system principal accounts per organisational unit:
--             • <TenantCode>.OWNER — full operational control
--             • <TenantCode>.ADMIN — administrative access
--           For tenants with multiple legal entities (athyper only, 17 CCs):
--             • <CCCode>.OWNER   — CC-scoped operational control
--             • <CCCode>.ADMIN   — CC-scoped administrative access
--
-- UUID series:
--   Tenant-level:   bb001000-0000-0000-0000-{seq:012x}  (01..1c, 28 users)
--   CC-level:       bb002000-0000-0000-0000-{seq:012x}  (01..22, 34 users)
--
-- Tenant mapping (seq → tenant code):
--   01-02  athyper         09-0a  demo_fr        11-12  demo_sa
--   03-04  demo_ca         0b-0c  demo_in        13-14  demo_us
--   05-06  demo_ch         0d-0e  demo_my        15-16  athyper-hq1
--   07-08  demo_de         0f-10  demo_qa        17-18  pepsi
--   (odd=OWNER, even=ADMIN)                      19-1a  coke
--                                                1b-1c  maaza
--
-- athyper CC mapping (seq → CC code):
--   01-02 ACFB  03-04 ADPM  05-06 AITM  07-08 AJED  09-0a AMRE
--   0b-0c APHS  0d-0e AQTS  0f-10 AQTU  11-12 ASAC  13-14 ASAH
--   15-16 ASGF  17-18 ASPE  19-1a ATEM  1b-1c ATHQ  1d-1e AUET
--   1f-20 AUIC  21-22 AUKA
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================================

DO $principal_users$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE 0: Remove any JIT principals that conflict with our stable UUIDs
    -- ══════════════════════════════════════════════════════════════════════

    DELETE FROM master.principal p
    USING master.principal_profile pp
    WHERE pp.principal_id = p.id
      AND p.principal_source = 'oidc_jit'
      AND pp.keycloak_id::uuid IN (
          -- Tenant-level UUIDs
          'bb001000-0000-0000-0000-000000000001'::uuid,
          'bb001000-0000-0000-0000-000000000002'::uuid,
          'bb001000-0000-0000-0000-000000000003'::uuid,
          'bb001000-0000-0000-0000-000000000004'::uuid,
          'bb001000-0000-0000-0000-000000000005'::uuid,
          'bb001000-0000-0000-0000-000000000006'::uuid,
          'bb001000-0000-0000-0000-000000000007'::uuid,
          'bb001000-0000-0000-0000-000000000008'::uuid,
          'bb001000-0000-0000-0000-000000000009'::uuid,
          'bb001000-0000-0000-0000-00000000000a'::uuid,
          'bb001000-0000-0000-0000-00000000000b'::uuid,
          'bb001000-0000-0000-0000-00000000000c'::uuid,
          'bb001000-0000-0000-0000-00000000000d'::uuid,
          'bb001000-0000-0000-0000-00000000000e'::uuid,
          'bb001000-0000-0000-0000-00000000000f'::uuid,
          'bb001000-0000-0000-0000-000000000010'::uuid,
          'bb001000-0000-0000-0000-000000000011'::uuid,
          'bb001000-0000-0000-0000-000000000012'::uuid,
          'bb001000-0000-0000-0000-000000000013'::uuid,
          'bb001000-0000-0000-0000-000000000014'::uuid,
          'bb001000-0000-0000-0000-000000000015'::uuid,
          'bb001000-0000-0000-0000-000000000016'::uuid,
          'bb001000-0000-0000-0000-000000000017'::uuid,
          'bb001000-0000-0000-0000-000000000018'::uuid,
          'bb001000-0000-0000-0000-000000000019'::uuid,
          'bb001000-0000-0000-0000-00000000001a'::uuid,
          'bb001000-0000-0000-0000-00000000001b'::uuid,
          'bb001000-0000-0000-0000-00000000001c'::uuid,
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
          'bb002000-0000-0000-0000-00000000001b'::uuid,
          'bb002000-0000-0000-0000-00000000001c'::uuid,
          'bb002000-0000-0000-0000-00000000001d'::uuid,
          'bb002000-0000-0000-0000-00000000001e'::uuid,
          'bb002000-0000-0000-0000-00000000001f'::uuid,
          'bb002000-0000-0000-0000-000000000020'::uuid,
          'bb002000-0000-0000-0000-000000000021'::uuid,
          'bb002000-0000-0000-0000-000000000022'::uuid
      )
      AND p.id <> pp.keycloak_id::uuid;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal — tenant-level principal users (28)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'internal', 'active', v_su
    FROM (VALUES
        ('bb001000-0000-0000-0000-000000000001'::uuid, 'athyper',     'athyper.OWNER',     'Athyper Group Owner'),
        ('bb001000-0000-0000-0000-000000000002'::uuid, 'athyper',     'athyper.ADMIN',     'Athyper Group Admin'),
        ('bb001000-0000-0000-0000-000000000003'::uuid, 'demo_ca',     'demo_ca.OWNER',     'Demo Canada Owner'),
        ('bb001000-0000-0000-0000-000000000004'::uuid, 'demo_ca',     'demo_ca.ADMIN',     'Demo Canada Admin'),
        ('bb001000-0000-0000-0000-000000000005'::uuid, 'demo_ch',     'demo_ch.OWNER',     'Demo Switzerland Owner'),
        ('bb001000-0000-0000-0000-000000000006'::uuid, 'demo_ch',     'demo_ch.ADMIN',     'Demo Switzerland Admin'),
        ('bb001000-0000-0000-0000-000000000007'::uuid, 'demo_de',     'demo_de.OWNER',     'Demo Germany Owner'),
        ('bb001000-0000-0000-0000-000000000008'::uuid, 'demo_de',     'demo_de.ADMIN',     'Demo Germany Admin'),
        ('bb001000-0000-0000-0000-000000000009'::uuid, 'demo_fr',     'demo_fr.OWNER',     'Demo France Owner'),
        ('bb001000-0000-0000-0000-00000000000a'::uuid, 'demo_fr',     'demo_fr.ADMIN',     'Demo France Admin'),
        ('bb001000-0000-0000-0000-00000000000b'::uuid, 'demo_in',     'demo_in.OWNER',     'Demo India Owner'),
        ('bb001000-0000-0000-0000-00000000000c'::uuid, 'demo_in',     'demo_in.ADMIN',     'Demo India Admin'),
        ('bb001000-0000-0000-0000-00000000000d'::uuid, 'demo_my',     'demo_my.OWNER',     'Demo Malaysia Owner'),
        ('bb001000-0000-0000-0000-00000000000e'::uuid, 'demo_my',     'demo_my.ADMIN',     'Demo Malaysia Admin'),
        ('bb001000-0000-0000-0000-00000000000f'::uuid, 'demo_qa',     'demo_qa.OWNER',     'Demo Qatar Owner'),
        ('bb001000-0000-0000-0000-000000000010'::uuid, 'demo_qa',     'demo_qa.ADMIN',     'Demo Qatar Admin'),
        ('bb001000-0000-0000-0000-000000000011'::uuid, 'demo_sa',     'demo_sa.OWNER',     'Demo Saudi Arabia Owner'),
        ('bb001000-0000-0000-0000-000000000012'::uuid, 'demo_sa',     'demo_sa.ADMIN',     'Demo Saudi Arabia Admin'),
        ('bb001000-0000-0000-0000-000000000013'::uuid, 'demo_us',     'demo_us.OWNER',     'Demo United States Owner'),
        ('bb001000-0000-0000-0000-000000000014'::uuid, 'demo_us',     'demo_us.ADMIN',     'Demo United States Admin'),
        ('bb001000-0000-0000-0000-000000000015'::uuid, 'athyper-hq1', 'athyper-hq1.OWNER', 'Athyper HQ 1 Owner'),
        ('bb001000-0000-0000-0000-000000000016'::uuid, 'athyper-hq1', 'athyper-hq1.ADMIN', 'Athyper HQ 1 Admin'),
        ('bb001000-0000-0000-0000-000000000017'::uuid, 'pepsi',       'pepsi.OWNER',       'Pepsi Owner'),
        ('bb001000-0000-0000-0000-000000000018'::uuid, 'pepsi',       'pepsi.ADMIN',       'Pepsi Admin'),
        ('bb001000-0000-0000-0000-000000000019'::uuid, 'coke',        'coke.OWNER',        'Coke Owner'),
        ('bb001000-0000-0000-0000-00000000001a'::uuid, 'coke',        'coke.ADMIN',        'Coke Admin'),
        ('bb001000-0000-0000-0000-00000000001b'::uuid, 'maaza',       'maaza.OWNER',       'Maaza Owner'),
        ('bb001000-0000-0000-0000-00000000001c'::uuid, 'maaza',       'maaza.ADMIN',       'Maaza Admin')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal — CC-level principal users (34, all in athyper)
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
        ('bb002000-0000-0000-0000-000000000001'::uuid, 'ACFB.OWNER', 'ACFB Owner'),
        ('bb002000-0000-0000-0000-000000000002'::uuid, 'ACFB.ADMIN', 'ACFB Admin'),
        ('bb002000-0000-0000-0000-000000000003'::uuid, 'ADPM.OWNER', 'ADPM Owner'),
        ('bb002000-0000-0000-0000-000000000004'::uuid, 'ADPM.ADMIN', 'ADPM Admin'),
        ('bb002000-0000-0000-0000-000000000005'::uuid, 'AITM.OWNER', 'AITM Owner'),
        ('bb002000-0000-0000-0000-000000000006'::uuid, 'AITM.ADMIN', 'AITM Admin'),
        ('bb002000-0000-0000-0000-000000000007'::uuid, 'AJED.OWNER', 'AJED Owner'),
        ('bb002000-0000-0000-0000-000000000008'::uuid, 'AJED.ADMIN', 'AJED Admin'),
        ('bb002000-0000-0000-0000-000000000009'::uuid, 'AMRE.OWNER', 'AMRE Owner'),
        ('bb002000-0000-0000-0000-00000000000a'::uuid, 'AMRE.ADMIN', 'AMRE Admin'),
        ('bb002000-0000-0000-0000-00000000000b'::uuid, 'APHS.OWNER', 'APHS Owner'),
        ('bb002000-0000-0000-0000-00000000000c'::uuid, 'APHS.ADMIN', 'APHS Admin'),
        ('bb002000-0000-0000-0000-00000000000d'::uuid, 'AQTS.OWNER', 'AQTS Owner'),
        ('bb002000-0000-0000-0000-00000000000e'::uuid, 'AQTS.ADMIN', 'AQTS Admin'),
        ('bb002000-0000-0000-0000-00000000000f'::uuid, 'AQTU.OWNER', 'AQTU Owner'),
        ('bb002000-0000-0000-0000-000000000010'::uuid, 'AQTU.ADMIN', 'AQTU Admin'),
        ('bb002000-0000-0000-0000-000000000011'::uuid, 'ASAC.OWNER', 'ASAC Owner'),
        ('bb002000-0000-0000-0000-000000000012'::uuid, 'ASAC.ADMIN', 'ASAC Admin'),
        ('bb002000-0000-0000-0000-000000000013'::uuid, 'ASAH.OWNER', 'ASAH Owner'),
        ('bb002000-0000-0000-0000-000000000014'::uuid, 'ASAH.ADMIN', 'ASAH Admin'),
        ('bb002000-0000-0000-0000-000000000015'::uuid, 'ASGF.OWNER', 'ASGF Owner'),
        ('bb002000-0000-0000-0000-000000000016'::uuid, 'ASGF.ADMIN', 'ASGF Admin'),
        ('bb002000-0000-0000-0000-000000000017'::uuid, 'ASPE.OWNER', 'ASPE Owner'),
        ('bb002000-0000-0000-0000-000000000018'::uuid, 'ASPE.ADMIN', 'ASPE Admin'),
        ('bb002000-0000-0000-0000-000000000019'::uuid, 'ATEM.OWNER', 'ATEM Owner'),
        ('bb002000-0000-0000-0000-00000000001a'::uuid, 'ATEM.ADMIN', 'ATEM Admin'),
        ('bb002000-0000-0000-0000-00000000001b'::uuid, 'ATHQ.OWNER', 'ATHQ Owner'),
        ('bb002000-0000-0000-0000-00000000001c'::uuid, 'ATHQ.ADMIN', 'ATHQ Admin'),
        ('bb002000-0000-0000-0000-00000000001d'::uuid, 'AUET.OWNER', 'AUET Owner'),
        ('bb002000-0000-0000-0000-00000000001e'::uuid, 'AUET.ADMIN', 'AUET Admin'),
        ('bb002000-0000-0000-0000-00000000001f'::uuid, 'AUIC.OWNER', 'AUIC Owner'),
        ('bb002000-0000-0000-0000-000000000020'::uuid, 'AUIC.ADMIN', 'AUIC Admin'),
        ('bb002000-0000-0000-0000-000000000021'::uuid, 'AUKA.OWNER', 'AUKA Owner'),
        ('bb002000-0000-0000-0000-000000000022'::uuid, 'AUKA.ADMIN', 'AUKA Admin')
    ) AS v(id, code, name)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_profile — all 62 principal users
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        CASE WHEN p.principal_source = 'internal' THEN split_part(p.code, '.', 1) ELSE '' END,
        CASE
            WHEN p.code LIKE '%.OWNER' THEN 'Owner'
            WHEN p.code LIKE '%.ADMIN' THEN 'Admin'
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
        'bb001000-0000-0000-0000-000000000003'::uuid,
        'bb001000-0000-0000-0000-000000000004'::uuid,
        'bb001000-0000-0000-0000-000000000005'::uuid,
        'bb001000-0000-0000-0000-000000000006'::uuid,
        'bb001000-0000-0000-0000-000000000007'::uuid,
        'bb001000-0000-0000-0000-000000000008'::uuid,
        'bb001000-0000-0000-0000-000000000009'::uuid,
        'bb001000-0000-0000-0000-00000000000a'::uuid,
        'bb001000-0000-0000-0000-00000000000b'::uuid,
        'bb001000-0000-0000-0000-00000000000c'::uuid,
        'bb001000-0000-0000-0000-00000000000d'::uuid,
        'bb001000-0000-0000-0000-00000000000e'::uuid,
        'bb001000-0000-0000-0000-00000000000f'::uuid,
        'bb001000-0000-0000-0000-000000000010'::uuid,
        'bb001000-0000-0000-0000-000000000011'::uuid,
        'bb001000-0000-0000-0000-000000000012'::uuid,
        'bb001000-0000-0000-0000-000000000013'::uuid,
        'bb001000-0000-0000-0000-000000000014'::uuid,
        'bb001000-0000-0000-0000-000000000015'::uuid,
        'bb001000-0000-0000-0000-000000000016'::uuid,
        'bb001000-0000-0000-0000-000000000017'::uuid,
        'bb001000-0000-0000-0000-000000000018'::uuid,
        'bb001000-0000-0000-0000-000000000019'::uuid,
        'bb001000-0000-0000-0000-00000000001a'::uuid,
        'bb001000-0000-0000-0000-00000000001b'::uuid,
        'bb001000-0000-0000-0000-00000000001c'::uuid,
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
        'bb002000-0000-0000-0000-00000000001b'::uuid,
        'bb002000-0000-0000-0000-00000000001c'::uuid,
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
            updated_at = now();

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: master.principal_auth_binding — all 62 principal users
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_auth_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
    WHERE p.id IN (
        'bb001000-0000-0000-0000-000000000001'::uuid,
        'bb001000-0000-0000-0000-000000000002'::uuid,
        'bb001000-0000-0000-0000-000000000003'::uuid,
        'bb001000-0000-0000-0000-000000000004'::uuid,
        'bb001000-0000-0000-0000-000000000005'::uuid,
        'bb001000-0000-0000-0000-000000000006'::uuid,
        'bb001000-0000-0000-0000-000000000007'::uuid,
        'bb001000-0000-0000-0000-000000000008'::uuid,
        'bb001000-0000-0000-0000-000000000009'::uuid,
        'bb001000-0000-0000-0000-00000000000a'::uuid,
        'bb001000-0000-0000-0000-00000000000b'::uuid,
        'bb001000-0000-0000-0000-00000000000c'::uuid,
        'bb001000-0000-0000-0000-00000000000d'::uuid,
        'bb001000-0000-0000-0000-00000000000e'::uuid,
        'bb001000-0000-0000-0000-00000000000f'::uuid,
        'bb001000-0000-0000-0000-000000000010'::uuid,
        'bb001000-0000-0000-0000-000000000011'::uuid,
        'bb001000-0000-0000-0000-000000000012'::uuid,
        'bb001000-0000-0000-0000-000000000013'::uuid,
        'bb001000-0000-0000-0000-000000000014'::uuid,
        'bb001000-0000-0000-0000-000000000015'::uuid,
        'bb001000-0000-0000-0000-000000000016'::uuid,
        'bb001000-0000-0000-0000-000000000017'::uuid,
        'bb001000-0000-0000-0000-000000000018'::uuid,
        'bb001000-0000-0000-0000-000000000019'::uuid,
        'bb001000-0000-0000-0000-00000000001a'::uuid,
        'bb001000-0000-0000-0000-00000000001b'::uuid,
        'bb001000-0000-0000-0000-00000000001c'::uuid,
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
        'bb002000-0000-0000-0000-00000000001b'::uuid,
        'bb002000-0000-0000-0000-00000000001c'::uuid,
        'bb002000-0000-0000-0000-00000000001d'::uuid,
        'bb002000-0000-0000-0000-00000000001e'::uuid,
        'bb002000-0000-0000-0000-00000000001f'::uuid,
        'bb002000-0000-0000-0000-000000000020'::uuid,
        'bb002000-0000-0000-0000-000000000021'::uuid,
        'bb002000-0000-0000-0000-000000000022'::uuid
    )
    AND p.principal_source = 'internal'
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[003_principal_users] 62 principal users seeded (28 tenant-level + 34 CC-level)';

END $principal_users$;
