-- ============================================================================
-- shared/08_rls.sql
-- Concept: Reference RLS — tenant-aware shared lookup access policies
-- Depends on: 04_tables/001_shared.sql, 05_pre_constraint_functions/001_shared.sql
-- Policy: open_read (SELECT for all) + seed_write (ALL DML for athyperadmin only).
-- ENABLE + FORCE RLS. No tenant_isolation — global tables.
-- ============================================================================

-- Enable + Force RLS

ALTER TABLE shared.country         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.currency        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.language        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.locale          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.timezone        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.uom             ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.state_region    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.commodity_code  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.industry_code   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.workspace       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.module          ENABLE ROW LEVEL SECURITY;

ALTER TABLE shared.country         FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.currency        FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.language        FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.locale          FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.timezone        FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.uom             FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.state_region    FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.commodity_code  FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.industry_code   FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.workspace       FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.module          FORCE ROW LEVEL SECURITY;

-- open_read: SELECT for all

DROP POLICY IF EXISTS open_read ON shared.country;
CREATE POLICY open_read ON shared.country         FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.currency;
CREATE POLICY open_read ON shared.currency        FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.language;
CREATE POLICY open_read ON shared.language        FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.locale;
CREATE POLICY open_read ON shared.locale          FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.timezone;
CREATE POLICY open_read ON shared.timezone        FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.uom;
CREATE POLICY open_read ON shared.uom             FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.state_region;
CREATE POLICY open_read ON shared.state_region    FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.commodity_code;
CREATE POLICY open_read ON shared.commodity_code  FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.industry_code;
CREATE POLICY open_read ON shared.industry_code   FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.workspace;
CREATE POLICY open_read ON shared.workspace       FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.module;
CREATE POLICY open_read ON shared.module          FOR SELECT USING (true);

-- seed_write: full DML restricted to athyperadmin role (Pattern A: FOR ALL)

DROP POLICY IF EXISTS seed_write ON shared.country;
CREATE POLICY seed_write ON shared.country FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.currency;
CREATE POLICY seed_write ON shared.currency FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.language;
CREATE POLICY seed_write ON shared.language FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.locale;
CREATE POLICY seed_write ON shared.locale FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.timezone;
CREATE POLICY seed_write ON shared.timezone FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.uom;
CREATE POLICY seed_write ON shared.uom FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.state_region;
CREATE POLICY seed_write ON shared.state_region FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.commodity_code;
CREATE POLICY seed_write ON shared.commodity_code FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.industry_code;
CREATE POLICY seed_write ON shared.industry_code FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.workspace;
CREATE POLICY seed_write ON shared.workspace FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.module;
CREATE POLICY seed_write ON shared.module FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
ALTER TABLE shared.subscription_plan     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.subscription_plan     FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read ON shared.subscription_plan;
CREATE POLICY open_read ON shared.subscription_plan     FOR SELECT USING (true);

DROP POLICY IF EXISTS seed_write ON shared.subscription_plan;
CREATE POLICY seed_write ON shared.subscription_plan FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
