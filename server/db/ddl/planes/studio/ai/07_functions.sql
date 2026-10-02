-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).



-- BEGIN ATLAS F4 LEARNING STUDIO
CREATE OR REPLACE FUNCTION ai.trg_atlas_learning_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ai,metadata AS $$
BEGIN
 IF NOT ((OLD.state='pending' AND NEW.state IN ('rejected','drafted'))
         OR (OLD.state='drafted' AND NEW.state='drafted')) OR NEW.revision<>OLD.revision+1
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.submitted_by OR OLD.expires_at<=now()
    OR ROW(NEW.id,NEW.tenant_id,NEW.origin_plane,NEW.candidate_id,NEW.proposal_hash,NEW.proposal,NEW.submitted_by,NEW.created_at,NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.origin_plane,OLD.candidate_id,OLD.proposal_hash,OLD.proposal,OLD.submitted_by,OLD.created_at,OLD.expires_at) THEN
   RAISE EXCEPTION 'Invalid immutable learning review transition' USING ERRCODE='check_violation';
 END IF;
 IF OLD.state='drafted' THEN
   -- Requalification creates a new draft; never rewrite the old receipt in
   -- place or erase its predecessor chain, even after evaluator upgrades.
   IF NEW.change_set_id IS NOT DISTINCT FROM OLD.change_set_id
      OR NEW.change_set_id IS NULL
      OR jsonb_typeof(NEW.evaluation->'receipt') IS DISTINCT FROM 'object'
      OR (NEW.evaluation->'previousEvaluations') IS DISTINCT FROM
         (COALESCE(OLD.evaluation->'previousEvaluations','[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('changeSetId',OLD.change_set_id,
            'evaluatedDescriptorHash',OLD.evaluated_hash,
            'evaluation',OLD.evaluation-'previousEvaluations')))
      OR EXISTS(SELECT 1 FROM metadata.entity_release release
         WHERE release.change_set_id=OLD.change_set_id AND release.tenant_id=OLD.tenant_id) THEN
     RAISE EXCEPTION 'Learning requalification requires a new unpublished draft and preserved evaluation history' USING ERRCODE='check_violation';
   END IF;
 END IF;
 IF NEW.state='drafted' AND NOT EXISTS(SELECT 1 FROM metadata.entity_change_set cs WHERE cs.id=NEW.change_set_id AND cs.tenant_id=NEW.tenant_id AND cs.status='draft' AND cs.created_by=NEW.reviewed_by) THEN
   RAISE EXCEPTION 'Learning draft must belong to the reviewed tenant and reviewer' USING ERRCODE='foreign_key_violation';
 END IF;
 RETURN NEW;
END $$;
-- END ATLAS F4 LEARNING STUDIO
