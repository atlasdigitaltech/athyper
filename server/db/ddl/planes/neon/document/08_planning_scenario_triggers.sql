CREATE TRIGGER trg_planning_scenario_00_created_by
BEFORE INSERT ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_scenario_05_validate
BEFORE INSERT OR UPDATE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_planning_scenario();

CREATE TRIGGER trg_planning_scenario_10_status
BEFORE UPDATE OF status ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_planning_scenario_20_guard
BEFORE UPDATE OR DELETE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_planning_scenario();

CREATE TRIGGER trg_planning_scenario_90_updated
BEFORE UPDATE ON document.planning_scenario
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_scenario_line_00_created_by
BEFORE INSERT ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_scenario_line_20_guard
BEFORE INSERT OR UPDATE OR DELETE ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_planning_scenario_line();

CREATE TRIGGER trg_planning_scenario_line_90_updated
BEFORE UPDATE ON document.planning_scenario_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
