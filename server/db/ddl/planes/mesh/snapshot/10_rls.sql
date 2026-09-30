ALTER TABLE snapshot.template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.template_version FORCE ROW LEVEL SECURITY;

ALTER TABLE snapshot.network_account_profile_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.network_account_profile_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_publication_snapshot_participant_read ON snapshot.network_account_profile_publication FOR SELECT USING(shared.current_tenant_id_soft() IN (owner_tenant_id,recipient_tenant_id));
CREATE POLICY profile_publication_snapshot_owner_insert ON snapshot.network_account_profile_publication FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON snapshot.network_account_profile_publication FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

ALTER TABLE snapshot.bank_account_disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.bank_account_disclosure FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_disclosure_snapshot_participant_read ON snapshot.bank_account_disclosure FOR SELECT USING(shared.current_tenant_id_soft() IN(owner_tenant_id,recipient_tenant_id));
CREATE POLICY bank_disclosure_snapshot_owner_insert ON snapshot.bank_account_disclosure FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON snapshot.bank_account_disclosure FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

CREATE POLICY template_version_tenant_read
    ON snapshot.template_version
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY template_version_tenant_insert
    ON snapshot.template_version
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );

CREATE POLICY seed_write ON snapshot.template_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.template_version
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;
