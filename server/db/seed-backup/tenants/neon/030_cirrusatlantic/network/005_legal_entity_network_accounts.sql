-- seed-pack-version: 2.0.0
-- disposition: retired-wrong-plane
--
-- Network accounts are Mesh-owned (`mesh.network_account`). Neon does not own
-- a legal-entity network-account aggregate and must consume only published
-- network references/snapshots. CirrusAtlantic Mesh onboarding is deferred.

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
        RAISE EXCEPTION '[005_legal_entity_network_accounts] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_actor AND p.tenant_id=v_tid AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[005_legal_entity_network_accounts] active tenant-local seed principal required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.legal_entity le
        WHERE le.tenant_id=v_tid AND le.code='catl' AND le.status='active'
    ) THEN
        RAISE EXCEPTION '[005_legal_entity_network_accounts] active catl legal entity required';
    END IF;

    RAISE NOTICE
        '[005_legal_entity_network_accounts] retired Neon-side BNA-1000000022; Mesh onboarding deferred';
END $seed$;
