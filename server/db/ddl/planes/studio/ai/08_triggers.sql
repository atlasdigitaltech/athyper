-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).



-- BEGIN ATLAS F4 LEARNING STUDIO
CREATE TRIGGER atlas_learning_review_guard BEFORE UPDATE ON ai.atlas_learning_inbox FOR EACH ROW EXECUTE FUNCTION ai.trg_atlas_learning_review();
CREATE TRIGGER atlas_learning_event_immutable BEFORE UPDATE ON ai.atlas_learning_candidate_event FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
-- END ATLAS F4 LEARNING STUDIO

-- BEGIN ATLAS LEARNING ATTEMPTS
CREATE TRIGGER atlas_learning_attempt_immutable BEFORE UPDATE OR DELETE ON ai.atlas_learning_attempt FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER atlas_learning_attempt_result_immutable BEFORE UPDATE OR DELETE ON ai.atlas_learning_attempt_result FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
-- END ATLAS LEARNING ATTEMPTS
