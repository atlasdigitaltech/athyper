-- ============================================================================
-- ATHYPER — SYSTEMATIC LEGAL-ENTITY PRINCIPALS (FULL RESET)
-- ============================================================================
-- 17 legal entities × 7 personas plus athyper.owner/admin.  UUIDs are stable:
-- aa<TT><LL><PP>-0000-0000-0000-000000000000, where TT=01 for Athyper.
-- Keycloak assigns JWT subject IDs. Runtime identity reconciliation updates
-- principal_identity_binding.subject_id by stable username after first login.
-- ============================================================================

DO $athyper_systematic_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_demo_principals] athyper tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);
    PERFORM set_config('app.iam_profile_kc_frozen', 'false', true);

    WITH legal_entities(le_hex, cc) AS (
        VALUES ('01','athq'),('02','acfb'),('03','adpm'),('04','aitm'),('05','ajed'),
               ('06','amre'),('07','aphs'),('08','aqts'),('09','aqtu'),('0a','asac'),
               ('0b','asah'),('0c','asgf'),('0d','aspe'),('0e','atem'),('0f','auet'),
               ('10','auic'),('11','auka')
    ), personas(persona_hex, persona) AS (
        VALUES ('01','viewer'),('02','reporter'),('03','requester'),('04','agent'),
               ('05','manager'),('06','owner'),('07','admin')
    ), principal_rows(id, code, name, persona) AS (
        SELECT format('aa01%s%s-0000-0000-0000-000000000000', le_hex, persona_hex)::uuid,
               cc || '.' || persona,
               upper(cc) || ' ' || initcap(persona),
               persona
        FROM legal_entities CROSS JOIN personas
        UNION ALL VALUES
            ('aa010006-0000-0000-0000-000000000000'::uuid, 'athyper.owner', 'Athyper Owner', 'owner'),
            ('aa010007-0000-0000-0000-000000000000'::uuid, 'athyper.admin', 'Athyper Admin', 'admin')
    )
    INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT id, v_tid, code, name, 'user', false, false, 'oidc_jit', 'active', v_su
    FROM principal_rows
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now(), updated_by = v_su;

    WITH legal_entities(le_hex, cc) AS (
        VALUES ('01','athq'),('02','acfb'),('03','adpm'),('04','aitm'),('05','ajed'),
               ('06','amre'),('07','aphs'),('08','aqts'),('09','aqtu'),('0a','asac'),
               ('0b','asah'),('0c','asgf'),('0d','aspe'),('0e','atem'),('0f','auet'),
               ('10','auic'),('11','auka')
    ), personas(persona_hex, persona) AS (
        VALUES ('01','viewer'),('02','reporter'),('03','requester'),('04','agent'),('05','manager'),('06','owner'),('07','admin')
    ), principal_rows(id, code, given_name, family_name, display_name, persona) AS (
        SELECT format('aa01%s%s-0000-0000-0000-000000000000', le_hex, persona_hex)::uuid,
               cc || '.' || persona, upper(cc), initcap(persona), upper(cc) || ' ' || initcap(persona), persona
        FROM legal_entities CROSS JOIN personas
        UNION ALL VALUES
            ('aa010006-0000-0000-0000-000000000000'::uuid, 'athyper.owner', 'Athyper', 'Owner', 'Athyper Owner', 'owner'),
            ('aa010007-0000-0000-0000-000000000000'::uuid, 'athyper.admin', 'Athyper', 'Admin', 'Athyper Admin', 'admin')
    )
    INSERT INTO master.principal_profile (
        tenant_id, principal_id, given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status, created_by
    )
    SELECT v_tid, id, given_name, family_name, display_name, id::text, code, 'synced', v_su
    FROM principal_rows
    ON CONFLICT (tenant_id, principal_id) DO UPDATE SET
        given_name = EXCLUDED.given_name, family_name = EXCLUDED.family_name,
        display_name = EXCLUDED.display_name, keycloak_id = EXCLUDED.keycloak_id,
        keycloak_username = EXCLUDED.keycloak_username, keycloak_sync_status = EXCLUDED.keycloak_sync_status,
        updated_at = now(), updated_by = v_su;

    WITH legal_entities(le_hex, cc) AS (
        VALUES ('01','athq'),('02','acfb'),('03','adpm'),('04','aitm'),('05','ajed'),('06','amre'),('07','aphs'),('08','aqts'),('09','aqtu'),('0a','asac'),('0b','asah'),('0c','asgf'),('0d','aspe'),('0e','atem'),('0f','auet'),('10','auic'),('11','auka')
    ), personas(persona_hex, persona) AS (
        VALUES ('01','viewer'),('02','reporter'),('03','requester'),('04','agent'),('05','manager'),('06','owner'),('07','admin')
    ), principal_rows(id, code, persona) AS (
        SELECT format('aa01%s%s-0000-0000-0000-000000000000', le_hex, persona_hex)::uuid, cc || '.' || persona, persona
        FROM legal_entities CROSS JOIN personas
        UNION ALL VALUES ('aa010006-0000-0000-0000-000000000000'::uuid, 'athyper.owner', 'owner'),('aa010007-0000-0000-0000-000000000000'::uuid, 'athyper.admin', 'admin')
    )
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id, realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified, synced_at, created_by
    )
    SELECT v_tid, id, 'athyper', 'keycloak', id::text, code, 'synced', true, true, now(), v_su
    FROM principal_rows
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO UPDATE SET
        subject_id = EXCLUDED.subject_id, username = EXCLUDED.username, sync_status = EXCLUDED.sync_status,
        idp_enabled = EXCLUDED.idp_enabled, idp_email_verified = EXCLUDED.idp_email_verified,
        synced_at = EXCLUDED.synced_at, updated_at = now(), updated_by = v_su;

    WITH legal_entities(le_hex) AS (
        VALUES ('01'),('02'),('03'),('04'),('05'),('06'),('07'),('08'),('09'),('0a'),('0b'),('0c'),('0d'),('0e'),('0f'),('10'),('11')
    ), personas(persona_hex, persona) AS (
        VALUES ('01','viewer'),('02','reporter'),('03','requester'),('04','agent'),('05','manager'),('06','owner'),('07','admin')
    ), persona_rows(id, persona) AS (
        SELECT format('aa01%s%s-0000-0000-0000-000000000000', le_hex, persona_hex)::uuid, persona FROM legal_entities CROSS JOIN personas
        UNION ALL VALUES ('aa010006-0000-0000-0000-000000000000'::uuid, 'owner'),('aa010007-0000-0000-0000-000000000000'::uuid, 'admin')
    )
    INSERT INTO master.principal_persona (tenant_id, principal_id, persona_id, assigned_by, created_by)
    SELECT v_tid, pr.id, per.id, v_su, v_su
    FROM persona_rows pr JOIN shared.persona per ON per.code = pr.persona
    ON CONFLICT (tenant_id, principal_id) DO UPDATE SET persona_id = EXCLUDED.persona_id;

    RAISE NOTICE '[001_demo_principals] 121 systematic Athyper principals, profiles, bindings and personas seeded';
END $athyper_systematic_principals$;
