ALTER TABLE document.planning_scenario ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario FORCE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario_line FORCE ROW LEVEL SECURITY;

CREATE POLICY planning_scenario_tenant_access
    ON document.planning_scenario FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY planning_scenario_seed_write
    ON document.planning_scenario FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY planning_scenario_line_tenant_access
    ON document.planning_scenario_line FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY planning_scenario_line_seed_write
    ON document.planning_scenario_line FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
