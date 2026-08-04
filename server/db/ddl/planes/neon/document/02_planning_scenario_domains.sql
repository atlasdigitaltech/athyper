CREATE DOMAIN document.planning_scenario_status_d AS text
    CHECK (VALUE IN ('draft', 'in_review', 'approved', 'superseded', 'cancelled'));

CREATE DOMAIN document.planning_line_source_d AS text
    CHECK (VALUE IN ('manual', 'driver', 'import', 'carry_forward'));
