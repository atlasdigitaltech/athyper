CREATE TRIGGER trg_formula_expression_status_changed
BEFORE UPDATE OF status ON control.formula_expression
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_formula_expression_updated_at
BEFORE UPDATE ON control.formula_expression
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_formula_expression_version_immutable
BEFORE UPDATE OR DELETE ON control.formula_expression_version
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_published_formula_version();

CREATE TRIGGER trg_formula_expression_version_updated_at
BEFORE UPDATE ON control.formula_expression_version
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rate_table_status_changed
BEFORE UPDATE OF status ON control.rate_table
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_rate_table_updated_at
BEFORE UPDATE ON control.rate_table
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rate_table_row_updated_at
BEFORE UPDATE ON control.rate_table_row
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
