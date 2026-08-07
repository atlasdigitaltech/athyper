CREATE TRIGGER publication_release_immutable BEFORE UPDATE OR DELETE ON publication.release FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER publication_entity_release_link_immutable BEFORE UPDATE OR DELETE ON publication.entity_release_link FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER publication_artifact_immutable BEFORE UPDATE OR DELETE ON publication.artifact FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER publication_deployment_event_immutable BEFORE UPDATE OR DELETE ON publication.deployment_event FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER publication_entity_release_link_validate BEFORE INSERT ON publication.entity_release_link FOR EACH ROW EXECUTE FUNCTION publication.trg_validate_entity_release_link();
CREATE TRIGGER publication_deployment_target_validate BEFORE INSERT OR UPDATE OF artifact_id,target_plane ON publication.deployment FOR EACH ROW EXECUTE FUNCTION publication.trg_validate_deployment_target();
