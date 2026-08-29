ALTER TABLE master.contact_person ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_person FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_person_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_person_role FORCE ROW LEVEL SECURITY;
ALTER TABLE master.address_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address_event FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.contact_person
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.contact_person
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.contact_person_role
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.contact_person_role
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON master.address_event
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON master.address_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
