-- Durable maker-checker evidence. Also applied transactionally by the upgrade script.
CREATE TABLE trustiam.identity_replay_approval (
 id uuid PRIMARY KEY,
 authority_tenant_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 desired_version bigint NOT NULL CHECK(desired_version>0),
 desired_hash char(64) NOT NULL CHECK(desired_hash~'^[a-f0-9]{64}$'),
 requested_by uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','revoked','consumed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 approved_by uuid, approved_at timestamptz, decision_reason text,
 revoked_by uuid, revoked_at timestamptz, revocation_reason text,
 consumed_at timestamptz,
 UNIQUE(authority_tenant_id,id),
 FOREIGN KEY(authority_tenant_id,attempt_id) REFERENCES trustiam.identity_saga_attempt(authority_tenant_id,id),
 FOREIGN KEY(authority_tenant_id,requested_by) REFERENCES master.principal(tenant_id,id),
 FOREIGN KEY(authority_tenant_id,approved_by) REFERENCES master.principal(tenant_id,id),
 FOREIGN KEY(authority_tenant_id,revoked_by) REFERENCES master.principal(tenant_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 hour 1 second'),
 CHECK((approved_by IS NULL AND approved_at IS NULL AND decision_reason IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>requested_by AND length(btrim(decision_reason)) BETWEEN 1 AND 1000)),
 CHECK((status IN('approved','consumed'))=(approved_by IS NOT NULL) OR status='revoked'),
 CHECK((status='revoked')=(revoked_by IS NOT NULL)),
 CHECK((revoked_by IS NULL)=(revoked_at IS NULL)),
 CHECK((revoked_by IS NULL)=(revocation_reason IS NULL)),
 CHECK(revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 1 AND 1000),
 CHECK(approved_at IS NULL OR (approved_at>=created_at AND approved_at<expires_at)),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at),
 CHECK(consumed_at IS NULL OR (consumed_at>=approved_at AND consumed_at<expires_at)),
 CHECK((status='consumed')=(consumed_at IS NOT NULL))
);
CREATE INDEX identity_replay_approval_attempt_idx ON trustiam.identity_replay_approval(authority_tenant_id,attempt_id);
CREATE UNIQUE INDEX identity_replay_approval_consumed_uq ON trustiam.identity_replay_approval(authority_tenant_id,attempt_id) WHERE status='consumed';
ALTER TABLE trustiam.identity_replay_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.identity_replay_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_access ON trustiam.identity_replay_approval FOR ALL
 USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());

CREATE FUNCTION trustiam.trg_guard_identity_replay_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
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
CREATE TRIGGER identity_replay_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON trustiam.identity_replay_approval FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_replay_approval();

-- The legacy repository/direct UPDATE cannot bypass durable evidence.
CREATE FUNCTION trustiam.trg_require_identity_replay_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
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
CREATE TRIGGER identity_saga_replay_approval_guard BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_require_identity_replay_approval();
REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_replay_approval(),trustiam.trg_require_identity_replay_approval() FROM PUBLIC;
GRANT SELECT,INSERT ON trustiam.identity_replay_approval TO athyperapp;
GRANT UPDATE(status,approved_by,approved_at,decision_reason,revoked_by,revoked_at,revocation_reason,consumed_at) ON trustiam.identity_replay_approval TO athyperapp;
-- Lock desired state without granting the HTTP role write access to it.
CREATE FUNCTION trustiam.lock_identity_replay_projection(p_tenant uuid,p_attempt uuid)
 RETURNS TABLE(id uuid,desired_version bigint,desired_hash char(64))
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,trustiam AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM shared.current_tenant_id() THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.id,p.desired_version,p.desired_hash FROM trustiam.identity_projection p
 JOIN trustiam.identity_saga_attempt a ON a.authority_tenant_id=p.authority_tenant_id AND a.identity_projection_id=p.id
 WHERE a.authority_tenant_id=p_tenant AND a.id=p_attempt FOR UPDATE OF p;
END $$;
REVOKE ALL ON FUNCTION trustiam.lock_identity_replay_projection(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trustiam.lock_identity_replay_projection(uuid,uuid) TO athyperapp;

-- A consumed approval cannot be committed without its corresponding replay mutation.
CREATE FUNCTION trustiam.trg_check_identity_replay_consumption() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
 IF NEW.status='consumed' AND NOT EXISTS(SELECT 1 FROM trustiam.identity_saga_attempt a
    WHERE a.authority_tenant_id=NEW.authority_tenant_id AND a.id=NEW.attempt_id
      AND a.replay_requested_by=NEW.requested_by AND a.replay_approved_by=NEW.approved_by AND a.replay_requested_at IS NOT NULL) THEN
   RAISE EXCEPTION 'approval consumption requires atomic replay' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION trustiam.trg_check_identity_replay_consumption() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER identity_replay_consumption_atomic AFTER UPDATE ON trustiam.identity_replay_approval
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trustiam.trg_check_identity_replay_consumption();
