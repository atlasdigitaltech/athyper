-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).

GRANT USAGE ON SCHEMA ai TO athyperadmin_atlas_maintenance;

GRANT DELETE ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_support_session" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_support_session" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_support_session" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_support_session" TO athyperapp;

-- BEGIN ATLAS F4 LEARNING STUDIO
REVOKE ALL ON ai.atlas_learning_inbox,ai.atlas_learning_candidate_event FROM PUBLIC;
GRANT SELECT,INSERT ON ai.atlas_learning_inbox TO athyperapp;
GRANT UPDATE(state,revision,reviewed_by,change_set_id,evaluated_hash,evaluation) ON ai.atlas_learning_inbox TO athyperapp;
GRANT SELECT,INSERT ON ai.atlas_learning_candidate_event TO athyperapp;
GRANT ALL ON ai.atlas_learning_inbox,ai.atlas_learning_candidate_event TO athyperadmin;
-- END ATLAS F4 LEARNING STUDIO
