BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION publication.trg_validate_baseline_release_link() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.baseline_id::text,0));
 IF NOT EXISTS(
   SELECT 1 FROM publication.release p JOIN metadata.entity_release e ON e.id=NEW.entity_release_id
   JOIN metadata.entity_change_set cs ON cs.id=e.change_set_id
   JOIN metadata.entity_baseline_import b ON b.id=NEW.baseline_id
   WHERE p.id=NEW.publication_release_id AND p.tenant_id=NEW.tenant_id AND b.tenant_id=p.tenant_id
     AND e.tenant_id=p.tenant_id AND p.release_key=b.publication_key AND p.release_no=b.source_release_no+1
     AND p.release_hash=e.release_hash AND p.release_kind='publish' AND e.release_kind='publish'
     AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
     AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)
 ) THEN RAISE EXCEPTION 'BASELINE_RELEASE_COORDINATE_OR_REVIEW_MISMATCH'; END IF;
 RETURN NEW;
 END $$;
CREATE OR REPLACE FUNCTION metadata.trg_revoke_unused_baseline() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata,publication AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.baseline_id::text,0));
 PERFORM 1 FROM metadata.entity_baseline_import WHERE id=NEW.baseline_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM publication.entity_baseline_release_link WHERE baseline_id=NEW.baseline_id) THEN
   RAISE EXCEPTION 'Published baseline requires a reviewed runtime rollback, not import revocation';
 END IF;
 RETURN NEW;
 END $$;
COMMIT;
