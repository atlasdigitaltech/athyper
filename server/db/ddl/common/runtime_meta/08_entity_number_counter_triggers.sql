CREATE TRIGGER entity_number_counter_20_validate
BEFORE INSERT OR UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_validate_entity_number_counter();
CREATE TRIGGER entity_number_counter_90_updated_at
BEFORE UPDATE ON runtime_meta.entity_number_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
