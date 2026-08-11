-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

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
