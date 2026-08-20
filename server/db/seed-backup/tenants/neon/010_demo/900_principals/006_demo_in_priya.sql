-- Lightweight demo_in tenant and Priya identity fixture.
-- This runs in the existing Neon demo pass so universal tenant blueprints are
-- not applied to demo_in before its legal/company master data is provisioned.
DO $demo_in_priya_fixture$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_principal_id uuid := 'aa000002-0000-0000-0000-000000000001';
BEGIN
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    INSERT INTO master.tenant (
        code, name, display_name, realm_key, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'demo_in', 'Demo India', 'Demo India Tenant', 'athyper', 'IN',
        'enterprise', 'active',
        jsonb_build_object('_seed', jsonb_build_object('pack', '010_demo/006_demo_in_priya', 'version', '1.0.0')),
        v_su
    )
    ON CONFLICT (realm_key, code) DO UPDATE SET
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        region = EXCLUDED.region,
        subscription = EXCLUDED.subscription,
        status = EXCLUDED.status,
        metadata = master.tenant.metadata || EXCLUDED.metadata,
        updated_at = now(),
        updated_by = v_su;

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'demo_in';

    INSERT INTO master.tenant_profile (
        tenant_id, country_code, currency_code, reporting_currency_code,
        locale_code, timezone_code, language_code, fiscal_year_start_month,
        date_format, number_format, week_start, weekend_days, created_by
    ) VALUES (
        v_tenant_id, 'IN', 'INR', 'USD', 'en-IN', 'Asia/Kolkata', 'en', 4,
        '%d %b %Y', '#,##0.00', 1, ARRAY[0, 6]::smallint[], v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        country_code = EXCLUDED.country_code,
        currency_code = EXCLUDED.currency_code,
        reporting_currency_code = EXCLUDED.reporting_currency_code,
        locale_code = EXCLUDED.locale_code,
        timezone_code = EXCLUDED.timezone_code,
        language_code = EXCLUDED.language_code,
        fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
        date_format = EXCLUDED.date_format,
        number_format = EXCLUDED.number_format,
        week_start = EXCLUDED.week_start,
        weekend_days = EXCLUDED.weekend_days,
        updated_at = now(),
        updated_by = v_su;

    PERFORM set_config('app.iam_profile_kc_frozen', 'false', true);

    INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type, is_locked,
        is_service_account, principal_source, status, created_by
    ) VALUES (
        v_principal_id, v_tenant_id, 'priya', 'Priya Demo', 'user', false,
        false, 'oidc_jit', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO master.principal_profile (
        tenant_id, principal_id, given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status, created_by
    ) VALUES (
        v_tenant_id, v_principal_id, 'Priya', 'Demo', 'Priya Demo',
        v_principal_id, 'priya', 'synced', v_su
    )
    ON CONFLICT (tenant_id, principal_id) DO UPDATE SET
        given_name = EXCLUDED.given_name,
        family_name = EXCLUDED.family_name,
        display_name = EXCLUDED.display_name,
        keycloak_id = EXCLUDED.keycloak_id,
        keycloak_username = EXCLUDED.keycloak_username,
        keycloak_sync_status = EXCLUDED.keycloak_sync_status,
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id, realm_key, provider_code, subject_id,
        username, sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES (
        v_tenant_id, v_principal_id, 'athyper', 'keycloak',
        v_principal_id::text, 'priya', 'synced', true, true, now(), v_su
    )
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO UPDATE SET
        subject_id = EXCLUDED.subject_id,
        username = EXCLUDED.username,
        sync_status = EXCLUDED.sync_status,
        idp_enabled = EXCLUDED.idp_enabled,
        idp_email_verified = EXCLUDED.idp_email_verified,
        synced_at = now(),
        updated_at = now(),
        updated_by = v_su;
END $demo_in_priya_fixture$;
