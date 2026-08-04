CREATE INDEX planning_scenario_status_idx
    ON document.planning_scenario (tenant_id, planning_model_id, status, version_no DESC);

CREATE INDEX planning_scenario_based_on_idx
    ON document.planning_scenario (tenant_id, planning_model_id, based_on_scenario_id)
    WHERE based_on_scenario_id IS NOT NULL;

CREATE INDEX planning_scenario_line_period_idx
    ON document.planning_scenario_line (
        tenant_id, planning_scenario_id, fiscal_year, period_number
    );

CREATE INDEX planning_scenario_line_driver_idx
    ON document.planning_scenario_line (tenant_id, planning_driver_id)
    WHERE planning_driver_id IS NOT NULL;

CREATE INDEX planning_scenario_line_account_idx
    ON document.planning_scenario_line (tenant_id, gl_account_id, fiscal_year, period_number)
    WHERE gl_account_id IS NOT NULL;
