ALTER TABLE control.setup_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.setup_workspace FORCE ROW LEVEL SECURITY;
ALTER TABLE control.setup_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.setup_domain FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_read ON control.setup_workspace;
DROP POLICY IF EXISTS admin_write ON control.setup_workspace;
CREATE POLICY platform_read ON control.setup_workspace
    FOR SELECT USING (true);
CREATE POLICY admin_write ON control.setup_workspace
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS platform_read ON control.setup_domain;
DROP POLICY IF EXISTS admin_write ON control.setup_domain;
CREATE POLICY platform_read ON control.setup_domain
    FOR SELECT USING (true);
CREATE POLICY admin_write ON control.setup_domain
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
