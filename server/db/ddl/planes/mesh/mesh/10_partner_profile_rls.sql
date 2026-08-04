ALTER TABLE mesh.network_account_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_commodity_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_commodity_capability FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_tax_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_tax_registration FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON mesh.network_account_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.network_account_commodity_capability FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_commodity_capability FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.network_account_tax_registration FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_tax_registration FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.bank_party FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_party FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY owner_access ON mesh.bank_account FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY owner_access ON mesh.bank_account_link FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account_link FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON mesh.bank_account_disclosure FOR SELECT
    USING (
        owner_tenant_id = shared.current_tenant_id_soft()
        OR recipient_tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY owner_insert ON mesh.bank_account_disclosure FOR INSERT
    WITH CHECK (owner_tenant_id = shared.current_tenant_id());
CREATE POLICY owner_update ON mesh.bank_account_disclosure FOR UPDATE
    USING (owner_tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (owner_tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account_disclosure FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
