ALTER TABLE control.formula_expression ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression FORCE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.formula_expression_version FORCE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table FORCE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rate_table_row FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.formula_expression
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.formula_expression
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.formula_expression_version
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.formula_expression_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.rate_table
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.rate_table
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON control.rate_table_row
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.rate_table_row
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
