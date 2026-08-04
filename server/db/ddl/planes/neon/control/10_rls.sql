ALTER TABLE control.subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.subscription_plan FORCE ROW LEVEL SECURITY;

CREATE POLICY open_read ON control.subscription_plan FOR SELECT USING (true);
CREATE POLICY seed_write ON control.subscription_plan
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.owner_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type FORCE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.owner_type_purpose FORCE ROW LEVEL SECURITY;

CREATE POLICY accessible_read ON control.owner_type
    FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY seed_write ON control.owner_type
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY accessible_read ON control.owner_type_purpose
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
              FROM control.owner_type ot
             WHERE ot.id = owner_type_id
               AND (
                   ot.tenant_id IS NULL
                   OR ot.tenant_id = shared.current_tenant_id_soft()
               )
        )
    );

CREATE POLICY seed_write ON control.owner_type_purpose
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

ALTER TABLE control.org_unit_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.org_unit_type FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.org_unit_type FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.org_unit_type FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
