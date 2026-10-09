BEGIN;
DO $$ DECLARE body text;
BEGIN
 body:=pg_get_functiondef('metadata.guard_identity_adoption_target()'::regprocedure);
 IF strpos(body,$old$ OR NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save s WHERE s.change_set_id=NEW.change_set_id AND s.lock_version=1 AND s.graph_hash=NEW.proposal_hash)$old$)=0 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_RECEIPT_PREDECESSOR_CHANGED'; END IF;
 EXECUTE replace(body,$old$ OR NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save s WHERE s.change_set_id=NEW.change_set_id AND s.lock_version=1 AND s.graph_hash=NEW.proposal_hash)$old$,$new$ OR NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save s WHERE s.change_set_id=NEW.change_set_id AND s.lock_version=1
 AND (s.graph_hash=NEW.proposal_hash OR EXISTS(
  SELECT 1 FROM metadata.entity_authoring_command_receipt r JOIN metadata.entity_change_set c ON c.id=r.change_set_id
  WHERE r.change_set_id=s.change_set_id AND r.tenant_id IS NOT DISTINCT FROM s.tenant_id
  AND r.revision=1 AND r.expected_revision=0 AND r.changed
  AND r.actor_id=c.created_by AND c.tenant_id IS NOT DISTINCT FROM s.tenant_id
  AND r.identities->>'proposalHash'=NEW.proposal_hash AND r.identities->>'graphHash'=s.graph_hash)))$new$);
END $$;
COMMIT;
