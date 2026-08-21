-- seed-pack-version: 2.0.0
-- disposition: retired-demo-principals
-- Fake Keycloak users must not be created by production tenant onboarding.

DO $seed$
DECLARE
    v_tid uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_actor AND p.tenant_id=v_tid AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[001_principals] active tenant-local seed principal required';
    END IF;
    RAISE NOTICE '[001_principals] retired fake Keycloak principals and profiles';
END $seed$;
