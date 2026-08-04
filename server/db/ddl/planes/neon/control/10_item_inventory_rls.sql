ALTER TABLE control.item_inventory_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.item_inventory_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.item_inventory_policy
FOR ALL
USING (tenant_id = shared.current_tenant_id_soft())
WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON control.item_inventory_policy
FOR ALL TO CURRENT_USER
USING (true)
WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON control.item_inventory_policy
        FOR ALL TO athyperadmin
        USING (true)
        WITH CHECK (true);
    END IF;
END;
$$;
