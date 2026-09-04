-- Inactive G6 surface migration. Apply only through the signed incremental-retirement runner.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM document.workforce_iam_projection WHERE observed_state IN('pending','failed')) THEN RAISE EXCEPTION 'outstanding workforce IAM projection rows remain'; END IF;END $$;
DROP FUNCTION IF EXISTS document.command_workforce_iam_projection(uuid,uuid,bigint,text,uuid,uuid);
DROP TABLE document.workforce_iam_projection;
DO $$ BEGIN IF to_regprocedure('document.command_internal_workforce_identity_intent(uuid,uuid,text,boolean,text,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'canonical workforce identity command is absent'; END IF;END $$;
