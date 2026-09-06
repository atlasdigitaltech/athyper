ALTER TABLE publication.release ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.release FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON publication.release
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_access ON publication.release
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

ALTER TABLE publication.business_partner_case_contract_release_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.business_partner_case_contract_release_link FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON publication.business_partner_case_contract_release_link
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
