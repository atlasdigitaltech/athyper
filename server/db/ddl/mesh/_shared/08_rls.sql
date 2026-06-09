-- ============================================================================
-- mesh/_shared/08_rls.sql
-- Concept: Mesh additions for shared schema RLS
-- Depends on: shared/08_rls.sql
-- ============================================================================

ALTER TABLE shared.commodity_crosswalk      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.industry_crosswalk       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.subscription_plan_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.role                     ENABLE ROW LEVEL SECURITY;

ALTER TABLE shared.commodity_crosswalk      FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.industry_crosswalk       FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.subscription_plan_version FORCE ROW LEVEL SECURITY;
ALTER TABLE shared.role                     FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read ON shared.commodity_crosswalk;
CREATE POLICY open_read ON shared.commodity_crosswalk FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.industry_crosswalk;
CREATE POLICY open_read ON shared.industry_crosswalk FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.subscription_plan_version;
CREATE POLICY open_read ON shared.subscription_plan_version FOR SELECT USING (true);

DROP POLICY IF EXISTS open_read ON shared.role;
CREATE POLICY open_read ON shared.role FOR SELECT USING (true);

DROP POLICY IF EXISTS seed_write ON shared.commodity_crosswalk;
CREATE POLICY seed_write ON shared.commodity_crosswalk FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.industry_crosswalk;
CREATE POLICY seed_write ON shared.industry_crosswalk FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.subscription_plan_version;
CREATE POLICY seed_write ON shared.subscription_plan_version FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS seed_write ON shared.role;
CREATE POLICY seed_write ON shared.role FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
