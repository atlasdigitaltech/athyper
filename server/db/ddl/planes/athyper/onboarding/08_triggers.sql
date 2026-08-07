DROP TRIGGER IF EXISTS trg_onboarding_case_updated_at ON onboarding.onboarding_case;
CREATE TRIGGER trg_onboarding_case_updated_at
BEFORE UPDATE ON onboarding.onboarding_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_case_status_changed ON onboarding.onboarding_case;
CREATE TRIGGER trg_onboarding_case_status_changed
BEFORE UPDATE OF status ON onboarding.onboarding_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_onboarding_case_target_updated_at ON onboarding.onboarding_case_target;
CREATE TRIGGER trg_onboarding_case_target_updated_at
BEFORE UPDATE ON onboarding.onboarding_case_target
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_case_target_status_changed ON onboarding.onboarding_case_target;
CREATE TRIGGER trg_onboarding_case_target_status_changed
BEFORE UPDATE OF status ON onboarding.onboarding_case_target
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_onboarding_case_step_updated_at ON onboarding.onboarding_case_step;
CREATE TRIGGER trg_onboarding_case_step_updated_at
BEFORE UPDATE ON onboarding.onboarding_case_step
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_case_step_status_changed ON onboarding.onboarding_case_step;
CREATE TRIGGER trg_onboarding_case_step_status_changed
BEFORE UPDATE OF status ON onboarding.onboarding_case_step
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_onboarding_case_check_updated_at ON onboarding.onboarding_case_check;
CREATE TRIGGER trg_onboarding_case_check_updated_at
BEFORE UPDATE ON onboarding.onboarding_case_check
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_case_resource_updated_at ON onboarding.onboarding_case_resource;
CREATE TRIGGER trg_onboarding_case_resource_updated_at
BEFORE UPDATE ON onboarding.onboarding_case_resource
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_compilation_decision_updated_at ON onboarding.onboarding_compilation_decision;
CREATE TRIGGER trg_onboarding_compilation_decision_updated_at
BEFORE UPDATE ON onboarding.onboarding_compilation_decision
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_case_work_item_updated_at ON onboarding.onboarding_case_work_item;
CREATE TRIGGER trg_onboarding_case_work_item_updated_at
BEFORE UPDATE ON onboarding.onboarding_case_work_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
