-- seed-contract-version: 1
-- seed-pack: neon.blueprint.party-risk-defaults
-- seed-pack-version: 2.0.0
-- seed-dataset: retired.party-risk-demo-fixture
-- seed-data-class: retired_demo_fixture
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: none-retired
-- seed-id-strategy: none-retired
-- seed-expected-row-count: exact:0
-- seed-assertions: retirement,no-production-demo-data
-- seed-demo-data: retired
-- retired-source: universal/080_party_risk/010_party_risk_universal.sql
-- retirement-reason: named example counterparties and risk scenarios are not production reference data
-- replacement: none; create explicitly scoped test fixtures when party-risk integration tests require them

DO $retired$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'party-risk retirement marker requires app.database_plane=neon';
  END IF;
  RAISE NOTICE '[party-risk-defaults] retired demo fixture; zero production rows applied';
END $retired$;
