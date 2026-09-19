BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE ai.atlas_learning_inbox (
 id uuid DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid NOT NULL,
 origin_plane text NOT NULL CHECK (origin_plane IN ('neon','mesh','studio')),
 candidate_id uuid NOT NULL,
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal)='object' AND pg_column_size(proposal)<=4096),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','rejected','drafted')),
 revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
 submitted_by uuid NOT NULL,
 reviewed_by uuid,
 change_set_id uuid,
 evaluated_hash text,
 evaluation jsonb CHECK (pg_column_size(evaluation)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 UNIQUE(tenant_id,origin_plane,candidate_id),
 CHECK (state='pending' OR reviewed_by IS NOT NULL),
 CHECK (reviewed_by IS NULL OR reviewed_by<>submitted_by),
 CHECK (state<>'drafted' OR (change_set_id IS NOT NULL AND evaluated_hash IS NOT NULL AND evaluation IS NOT NULL))
);
CREATE TABLE ai.atlas_learning_candidate_event (
 id uuid DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid NOT NULL,
 inbox_id uuid NOT NULL REFERENCES ai.atlas_learning_inbox(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 decision text NOT NULL CHECK (decision IN ('received','rejected','drafted')),
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 revision integer NOT NULL,
 change_set_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(inbox_id,revision)
);
ALTER TABLE ai.atlas_learning_inbox ADD CONSTRAINT atlas_learning_draft_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id);
ALTER TABLE ai.atlas_learning_inbox ADD CONSTRAINT atlas_learning_inbox_coordinate_uq UNIQUE(tenant_id,id,proposal_hash);
ALTER TABLE ai.atlas_learning_candidate_event ADD CONSTRAINT atlas_learning_event_coordinate_fk FOREIGN KEY(tenant_id,inbox_id,proposal_hash) REFERENCES ai.atlas_learning_inbox(tenant_id,id,proposal_hash) ON DELETE CASCADE;
CREATE INDEX atlas_learning_inbox_review_ix ON ai.atlas_learning_inbox(tenant_id,state,created_at,id);
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
CREATE TRIGGER atlas_learning_review_guard BEFORE UPDATE ON ai.atlas_learning_inbox FOR EACH ROW EXECUTE FUNCTION ai.trg_atlas_learning_review();
CREATE TRIGGER atlas_learning_event_immutable BEFORE UPDATE ON ai.atlas_learning_candidate_event FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE ai.atlas_learning_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_learning_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY atlas_learning_inbox_tenant ON ai.atlas_learning_inbox USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
ALTER TABLE ai.atlas_learning_candidate_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_learning_candidate_event FORCE ROW LEVEL SECURITY;
CREATE POLICY atlas_learning_event_tenant ON ai.atlas_learning_candidate_event USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON ai.atlas_learning_inbox,ai.atlas_learning_candidate_event FROM PUBLIC;
GRANT SELECT,INSERT ON ai.atlas_learning_inbox TO athyperapp;
GRANT UPDATE(state,revision,reviewed_by,change_set_id,evaluated_hash,evaluation) ON ai.atlas_learning_inbox TO athyperapp;
GRANT SELECT,INSERT ON ai.atlas_learning_candidate_event TO athyperapp;
GRANT ALL ON ai.atlas_learning_inbox,ai.atlas_learning_candidate_event TO athyperadmin;
COMMIT;
