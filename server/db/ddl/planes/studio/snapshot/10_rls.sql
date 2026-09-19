ALTER TABLE snapshot.template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.template_version FORCE ROW LEVEL SECURITY;

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

ALTER TABLE snapshot.compiled_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.compiled_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY compiled_artifact_tenant_read
    ON snapshot.compiled_artifact
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY seed_write ON snapshot.compiled_artifact
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.compiled_artifact
            FOR ALL TO athyperadmin
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE snapshot.entity_contract_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_revision FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_contract_revision_tenant_read
    ON snapshot.entity_contract_revision
    FOR SELECT TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

CREATE POLICY entity_contract_revision_tenant_insert
    ON snapshot.entity_contract_revision
    FOR INSERT TO athyperapp
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND captured_by = master.current_principal_id_soft()
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY admin_access ON snapshot.entity_contract_revision
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE snapshot.entity_contract_test_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_run FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_contract_test_result FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_contract_test_run_tenant_read ON snapshot.entity_contract_test_run FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_contract_test_run_tenant_insert ON snapshot.entity_contract_test_run FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft() AND executed_by = master.current_principal_id_soft());
CREATE POLICY entity_contract_test_result_tenant_read ON snapshot.entity_contract_test_result FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_contract_test_result_tenant_insert ON snapshot.entity_contract_test_result FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft());

ALTER TABLE snapshot.entity_numbering_test_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_numbering_test_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_numbering_test_artifact_tenant_read ON snapshot.entity_numbering_test_artifact FOR SELECT
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_numbering_test_artifact_tenant_insert ON snapshot.entity_numbering_test_artifact FOR INSERT
WITH CHECK (tenant_id = shared.current_tenant_id_soft() AND executed_by = master.current_principal_id_soft());

ALTER TABLE snapshot.entity_release_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_release_artifact FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_release_artifact_read
    ON snapshot.entity_release_artifact
    FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

CREATE POLICY entity_release_artifact_seed_write
    ON snapshot.entity_release_artifact
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        CREATE POLICY entity_release_artifact_admin
            ON snapshot.entity_release_artifact
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END
$$;
ALTER TABLE snapshot.business_partner_definition_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.business_partner_definition_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY business_partner_definition_revision_tenant_read ON snapshot.business_partner_definition_revision
  FOR SELECT USING (tenant_id=shared.current_tenant_id_soft());
CREATE POLICY business_partner_definition_revision_service_write ON snapshot.business_partner_definition_revision
  FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY business_partner_definition_revision_seed_owner ON snapshot.business_partner_definition_revision
  FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

ALTER TABLE snapshot.business_partner_case_contract_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.business_partner_case_contract_revision FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON snapshot.business_partner_case_contract_revision
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- Saved draft comparison history
ALTER TABLE snapshot.entity_draft_save ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_draft_save FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_draft_save_read ON snapshot.entity_draft_save FOR SELECT TO athyperapp
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_draft_save_insert ON snapshot.entity_draft_save FOR INSERT TO athyperapp
WITH CHECK (tenant_id = shared.current_tenant_id() AND captured_by = master.current_principal_id_soft());
