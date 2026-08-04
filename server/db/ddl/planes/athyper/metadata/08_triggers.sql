CREATE TRIGGER trg_metadata_entity_10_guard
BEFORE UPDATE ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity();

CREATE TRIGGER trg_metadata_entity_80_status_changed
BEFORE UPDATE OF status ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_metadata_entity_90_updated_at
BEFORE UPDATE ON metadata.entity
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_change_set_10_guard
BEFORE INSERT OR UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_change_set();

CREATE TRIGGER trg_entity_change_set_90_updated_at
BEFORE UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_entity_release_10_validate
BEFORE INSERT ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_release();

CREATE TRIGGER trg_entity_release_80_mark_change_set_published
AFTER INSERT ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_mark_change_set_published();

CREATE TRIGGER trg_entity_release_90_immutable
BEFORE UPDATE OR DELETE ON metadata.entity_release
FOR EACH ROW EXECUTE FUNCTION metadata.trg_reject_entity_release_mutation();
