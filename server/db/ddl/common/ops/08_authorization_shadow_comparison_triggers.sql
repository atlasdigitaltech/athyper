CREATE TRIGGER authorization_shadow_comparison_immutable
BEFORE UPDATE OR DELETE ON ops.authorization_shadow_comparison
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_shadow_comparison();

