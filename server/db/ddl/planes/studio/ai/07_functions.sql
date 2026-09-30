-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).



-- BEGIN ATLAS F4 LEARNING STUDIO
CREATE OR REPLACE FUNCTION ai.trg_atlas_learning_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ai,metadata AS $$
BEGIN
 IF OLD.state<>'pending' OR NEW.state NOT IN ('rejected','drafted') OR NEW.revision<>OLD.revision+1
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.submitted_by OR OLD.expires_at<=now()
    OR ROW(NEW.id,NEW.tenant_id,NEW.origin_plane,NEW.candidate_id,NEW.proposal_hash,NEW.proposal,NEW.submitted_by,NEW.created_at,NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.origin_plane,OLD.candidate_id,OLD.proposal_hash,OLD.proposal,OLD.submitted_by,OLD.created_at,OLD.expires_at) THEN
   RAISE EXCEPTION 'Invalid immutable learning review transition' USING ERRCODE='check_violation';
 END IF;
 IF NEW.state='drafted' AND NOT EXISTS(SELECT 1 FROM metadata.entity_change_set cs WHERE cs.id=NEW.change_set_id AND cs.tenant_id=NEW.tenant_id AND cs.status='draft' AND cs.created_by=NEW.reviewed_by) THEN
   RAISE EXCEPTION 'Learning draft must belong to the reviewed tenant and reviewer' USING ERRCODE='foreign_key_violation';
 END IF;
 RETURN NEW;
END $$;
-- END ATLAS F4 LEARNING STUDIO
