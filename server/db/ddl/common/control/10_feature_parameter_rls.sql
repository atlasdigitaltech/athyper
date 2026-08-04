ALTER TABLE control.feature_flag_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.feature_flag_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_flag_catalog_read ON control.feature_flag_catalog FOR SELECT USING (true);
CREATE POLICY feature_flag_catalog_seed_write ON control.feature_flag_catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.feature_flag_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.feature_flag_override FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_flag_override_read ON control.feature_flag_override
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY feature_flag_override_seed_write ON control.feature_flag_override
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.parameter_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.parameter_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY parameter_definition_read ON control.parameter_definition FOR SELECT USING (true);
CREATE POLICY parameter_definition_seed_write ON control.parameter_definition
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.tenant_parameter_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tenant_parameter_value FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_parameter_value_access ON control.tenant_parameter_value
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_parameter_value_seed_write ON control.tenant_parameter_value
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
