-- seed-pack-version: 2.0.0
-- disposition: retired-demo-party-master
--
-- The legacy payload created fictional suppliers, customers, directors,
-- beneficial owners, personal contacts, bank accounts, certifications, credit
-- history, and external-network links. These are demo/test fixtures and must
-- not be installed by production tenant onboarding.

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
        RAISE EXCEPTION '[001_ca_party_master] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_actor AND p.tenant_id=v_tid AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[001_ca_party_master] active tenant-local seed principal required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.company_code c
        WHERE c.tenant_id=v_tid AND c.code='catl' AND c.status='active'
    ) THEN
        RAISE EXCEPTION '[001_ca_party_master] active catl company required';
    END IF;

    RAISE NOTICE
        '[001_ca_party_master] retired fictional partner, risk, banking, and network fixture data';
END $seed$;
