BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'WP12 definition SoD guard must run only in athyper_studio';END IF;END $$;
CREATE OR REPLACE FUNCTION publication.trg_validate_business_partner_definition_release_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,publication,snapshot AS $$
DECLARE p publication.release%ROWTYPE;r snapshot.business_partner_definition_revision%ROWTYPE;
BEGIN
 SELECT * INTO STRICT p FROM publication.release WHERE id=NEW.publication_release_id;SELECT * INTO STRICT r FROM snapshot.business_partner_definition_revision WHERE id=NEW.definition_revision_id;
 IF p.tenant_id IS DISTINCT FROM r.tenant_id OR p.release_hash IS DISTINCT FROM r.bundle_hash OR p.release_key IS DISTINCT FROM('studio.business_partner.definition.'||r.bundle_code) THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='foreign_key_violation';END IF;
 IF p.created_by=r.created_by THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_SELF_PUBLISH_FORBIDDEN' USING ERRCODE='insufficient_privilege';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION publication.trg_validate_business_partner_definition_release_link() FROM PUBLIC;
COMMIT;
