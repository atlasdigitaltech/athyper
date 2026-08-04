ALTER TABLE master.compensation_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.compensation_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.compensation_assignment FOR ALL
USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON master.compensation_assignment FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    CREATE POLICY admin_access ON master.compensation_assignment FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
END IF; END $$;
