CREATE TRIGGER pricing_component_05_validate
BEFORE INSERT OR UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_pricing_component();
CREATE TRIGGER pricing_component_10_parent_guard
BEFORE INSERT OR UPDATE OR DELETE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_pricing_component_write();
CREATE TRIGGER pricing_component_20_row_version
BEFORE UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER pricing_component_30_updated_at
BEFORE UPDATE ON document.pricing_component
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER schedule_line_05_validate
BEFORE INSERT OR UPDATE ON document.schedule_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_schedule_line();
CREATE TRIGGER schedule_line_30_updated_at
BEFORE UPDATE ON document.schedule_line
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER schedule_line_90_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.schedule_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_schedule_capacity();
