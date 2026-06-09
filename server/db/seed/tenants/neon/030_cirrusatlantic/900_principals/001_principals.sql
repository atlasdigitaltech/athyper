-- ============================================================================
-- CIRRUSATLANTIC — PRINCIPALS
-- ============================================================================
-- File:     001_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed 3 CirrusAtlantic principals so KC → DB identity
--           resolution works on first login.
--
-- UUID series (aa003000-…):
--   aa003000-0000-0000-0000-000000000001  catl.admin
--   aa003000-0000-0000-0000-000000000002  catl.owner
--   aa003000-0000-0000-0000-000000000003  catl.finance
--
-- Idempotent: Yes — ON CONFLICT (tenant_id, external_ref) DO NOTHING
-- ============================================================================

DO $catl_principals$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_stable_ids uuid[] := ARRAY[
        'aa003000-0000-0000-0000-000000000001'::uuid,  -- catl.admin
        'aa003000-0000-0000-0000-000000000002'::uuid,  -- catl.owner
        'aa003000-0000-0000-0000-000000000003'::uuid   -- catl.finance
    ];
    v_usernames text[] := ARRAY['catl.admin', 'catl.owner', 'catl.finance'];
    v_names     text[] := ARRAY['CATL Admin', 'CATL Owner', 'CATL Finance Lead'];
    v_emails    text[] := ARRAY['admin@cirrusatlantic.com', 'owner@cirrusatlantic.com', 'finance@cirrusatlantic.com'];
    v_types     text[] := ARRAY['user', 'user', 'user'];
    i           int;
    v_pid       uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_principals] CirrusAtlantic tenant not found';
    END IF;

    FOR i IN 1..array_length(v_stable_ids, 1) LOOP
        v_pid := v_stable_ids[i];

        -- Principal
        INSERT INTO master.principal (
            id, tenant_id, code, name, external_ref,
            principal_type, status, created_by
        ) VALUES (
            v_pid, v_tid, v_usernames[i], v_names[i], v_usernames[i],
            v_types[i], 'active', v_su
        )
        ON CONFLICT (tenant_id, code) DO NOTHING;

        -- Profile
        INSERT INTO master.principal_profile (
            principal_id, tenant_id, display_name,
            locale, timezone,
            keycloak_id, keycloak_username,
            created_by
        ) VALUES (
            v_pid, v_tid, v_names[i],
            'en-GB', 'Europe/London',
            v_pid::text, v_usernames[i],
            v_su
        )
        ON CONFLICT (tenant_id, principal_id) DO NOTHING;

        -- Identity binding (KC provider)
        INSERT INTO master.principal_identity_binding (
            principal_id, tenant_id, realm_key, provider_code,
            subject_id, created_by
        ) VALUES (
            v_pid, v_tid, 'athyper', 'keycloak',
            v_pid::text, v_su
        )
        ON CONFLICT (tenant_id, realm_key, provider_code, subject_id) DO NOTHING;

    END LOOP;

    RAISE NOTICE '[001_principals] 3 CirrusAtlantic principals seeded';

END $catl_principals$;
