ALTER TABLE control.asset_class_book_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.asset_class_book_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_class_book_policy_tenant_access
    ON control.asset_class_book_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY asset_class_book_policy_seed_write
    ON control.asset_class_book_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
