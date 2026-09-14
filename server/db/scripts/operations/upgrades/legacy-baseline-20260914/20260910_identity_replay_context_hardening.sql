-- Upgrade definitions corrected by the 2026-09-09 database review.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'This migration requires athyper_studio'; END IF; END $$;
CREATE OR REPLACE FUNCTION trustiam.trg_guard_identity_replay_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
DECLARE actor uuid;
BEGIN
 BEGIN actor := nullif(current_setting('app.current_principal_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN
   RAISE EXCEPTION 'invalid replay principal context' USING ERRCODE='23514';
 END;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'replay approval evidence is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.requested_by IS DISTINCT FROM actor OR NEW.status<>'pending' OR NEW.approved_by IS NOT NULL OR NEW.revoked_by IS NOT NULL OR NEW.consumed_at IS NOT NULL THEN
     RAISE EXCEPTION 'invalid replay approval requester' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','approved_by','approved_at','decision_reason','revoked_by','revoked_at','revocation_reason','consumed_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','approved_by','approved_at','decision_reason','revoked_by','revoked_at','revocation_reason','consumed_at']) THEN
   RAISE EXCEPTION 'replay approval coordinates are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status='pending' AND NEW.status='approved' AND NEW.approved_by=actor AND actor<>OLD.requested_by AND OLD.expires_at>clock_timestamp()
    AND NEW.revoked_by IS NULL AND NEW.consumed_at IS NULL THEN RETURN NEW; END IF;
 IF OLD.status IN('pending','approved') AND NEW.status='revoked' AND NEW.revoked_by=actor
    AND (NEW.approved_by,NEW.approved_at,NEW.decision_reason,NEW.consumed_at) IS NOT DISTINCT FROM (OLD.approved_by,OLD.approved_at,OLD.decision_reason,OLD.consumed_at) THEN RETURN NEW; END IF;
 IF OLD.status='approved' AND NEW.status='consumed' AND actor=OLD.requested_by AND OLD.expires_at>clock_timestamp()
    AND (NEW.approved_by,NEW.approved_at,NEW.decision_reason,NEW.revoked_by,NEW.revoked_at,NEW.revocation_reason) IS NOT DISTINCT FROM (OLD.approved_by,OLD.approved_at,OLD.decision_reason,OLD.revoked_by,OLD.revoked_at,OLD.revocation_reason) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'invalid replay approval transition' USING ERRCODE='23514';
END $$;

CREATE OR REPLACE FUNCTION trustiam.trg_require_identity_replay_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
DECLARE actor uuid;
BEGIN
 IF NEW.replay_requested_at IS DISTINCT FROM OLD.replay_requested_at AND NEW.replay_requested_at IS NOT NULL THEN
   BEGIN actor := nullif(current_setting('app.current_principal_id',true),'')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN
     RAISE EXCEPTION 'invalid replay principal context' USING ERRCODE='23514';
   END;
   IF NOT EXISTS(SELECT 1 FROM trustiam.identity_replay_approval a
      WHERE a.authority_tenant_id=NEW.authority_tenant_id AND a.attempt_id=NEW.id
        AND a.desired_version=NEW.desired_version AND a.desired_hash=NEW.desired_hash
        AND a.requested_by=NEW.replay_requested_by AND a.approved_by=NEW.replay_approved_by
        AND a.status='consumed' AND a.expires_at>clock_timestamp()
        AND a.requested_by=actor) THEN
     RAISE EXCEPTION 'durable replay approval required' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
