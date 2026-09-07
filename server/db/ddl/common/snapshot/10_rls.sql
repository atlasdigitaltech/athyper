ALTER TABLE snapshot.entity_snapshot_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_snapshot_identity FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_case_snapshot_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_case_snapshot_lineage FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_snapshot_identity_tenant_read
    ON snapshot.entity_snapshot_identity
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY entity_snapshot_tenant_read
    ON snapshot.entity_snapshot
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY entity_case_snapshot_lineage_tenant_read ON snapshot.entity_case_snapshot_lineage
    FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());

-- Application writes are allowed only through snapshot.fn_capture_entity().
CREATE POLICY seed_write ON snapshot.entity_snapshot_identity
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY seed_write ON snapshot.entity_snapshot
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

CREATE POLICY seed_write ON snapshot.entity_case_snapshot_lineage
    FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.entity_snapshot_identity
            FOR ALL TO athyperadmin
            USING (true)
            WITH CHECK (true);
        CREATE POLICY admin_access ON snapshot.entity_snapshot
            FOR ALL TO athyperadmin
            USING (true)
            WITH CHECK (true);
        CREATE POLICY admin_access ON snapshot.entity_case_snapshot_lineage
            FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
    END IF;
END;
$$;

ALTER TABLE snapshot.subscription_plan_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.subscription_plan_entitlement FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_plan_entitlement_read ON snapshot.subscription_plan_entitlement FOR SELECT USING (true);
CREATE POLICY subscription_plan_entitlement_capture ON snapshot.subscription_plan_entitlement FOR INSERT TO CURRENT_USER WITH CHECK (true);
