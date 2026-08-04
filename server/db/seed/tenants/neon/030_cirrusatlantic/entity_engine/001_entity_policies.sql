-- seed-pack-version: 2.0.0
-- disposition: retired-legacy-control-override
--
-- Entity contracts and operation permissions are published by the metadata and
-- authz DDL-layer packs. The legacy tenant seed depended on removed
-- control.entity rows, applied blanket default_allow policies, and included an
-- explicitly demo-only bank-account policy. No equivalent tenant override is
-- created.

DO $seed$
DECLARE
    v_tid uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant t
        WHERE t.id=v_tid
          AND t.realm_key='athyper'
          AND t.code='cirrusatlantic'
          AND t.status='active'
    ) THEN
        RAISE EXCEPTION '[001_entity_policies] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_actor
          AND p.tenant_id=v_tid
          AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[001_entity_policies] active tenant-local seed principal required';
    END IF;

    IF to_regclass('authz.permission') IS NULL THEN
        RAISE EXCEPTION '[001_entity_policies] compiled authz.permission authority is missing';
    END IF;

    RAISE NOTICE
        '[001_entity_policies] retired legacy default_allow overrides; DDL metadata/authz authority retained';
END $seed$;
