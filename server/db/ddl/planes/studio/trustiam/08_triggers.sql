DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['organization','organization_provider','application_projection','projection_scope','identity_provisioning_request'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON trustiam.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table||'_updated_at',v_table); END LOOP; END $$;
CREATE FUNCTION trustiam.trg_guard_projection_reconciliation_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
  IF (NEW.authority_tenant_id,NEW.projection_id,NEW.desired_version,NEW.desired_hash,NEW.target_plane,NEW.target_tenant_id,
      NEW.attempt_no,NEW.job_identity_hash,NEW.claim_token_hash,NEW.fencing_token,NEW.created_at,NEW.created_by)
     IS DISTINCT FROM
     (OLD.authority_tenant_id,OLD.projection_id,OLD.desired_version,OLD.desired_hash,OLD.target_plane,OLD.target_tenant_id,
      OLD.attempt_no,OLD.job_identity_hash,OLD.claim_token_hash,OLD.fencing_token,OLD.created_at,OLD.created_by) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='projection reconciliation attempt identity is immutable';
  END IF;
  IF OLD.status IN ('succeeded','failed','dead_letter','cancelled') THEN
    IF OLD.status='dead_letter' AND OLD.replay_requested_at IS NULL
       AND NEW.status='dead_letter' AND NEW.replay_requested_at IS NOT NULL AND NEW.replay_requested_by IS NOT NULL
       AND (to_jsonb(NEW)-ARRAY['replay_requested_at','replay_requested_by','updated_at','updated_by'])
           = (to_jsonb(OLD)-ARRAY['replay_requested_at','replay_requested_by','updated_at','updated_by']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='terminal projection reconciliation evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION trustiam.trg_guard_projection_desired_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
  IF (NEW.desired_version,NEW.desired_hash,NEW.target_plane,NEW.target_tenant_id,NEW.status)
     IS DISTINCT FROM
     (OLD.desired_version,OLD.desired_hash,OLD.target_plane,OLD.target_tenant_id,OLD.status)
     AND EXISTS (
       SELECT 1 FROM trustiam.projection_reconciliation_attempt attempt
        WHERE attempt.authority_tenant_id=OLD.authority_tenant_id
          AND attempt.projection_id=OLD.id
          AND attempt.status IN ('claimed','running','retrying')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='projection desired state is fenced by an active reconciliation attempt';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER application_projection_reconciliation_fence BEFORE UPDATE ON trustiam.application_projection FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_projection_desired_state();
CREATE TRIGGER projection_reconciliation_attempt_guard BEFORE UPDATE ON trustiam.projection_reconciliation_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_projection_reconciliation_attempt();
CREATE TRIGGER projection_reconciliation_attempt_updated_at BEFORE UPDATE ON trustiam.projection_reconciliation_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER identity_provisioning_attempt_updated_at BEFORE UPDATE ON trustiam.identity_provisioning_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE OR REPLACE FUNCTION trustiam.trg_guard_identity_provisioning_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('applied','failed','cancelled') THEN RAISE EXCEPTION 'terminal identity provisioning attempts are immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='claimed' AND NEW.status IN ('started','failed','cancelled')) OR (OLD.status='started' AND NEW.status IN ('applied','failed','cancelled'))) THEN RAISE EXCEPTION 'invalid identity provisioning attempt transition: % -> %',OLD.status,NEW.status USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_provisioning_attempt_transition_guard BEFORE UPDATE ON trustiam.identity_provisioning_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_provisioning_attempt();
CREATE TRIGGER trustiam_organization_status_changed BEFORE UPDATE OF status ON trustiam.organization FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_organization_provider_status_changed BEFORE UPDATE OF status ON trustiam.organization_provider FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_application_projection_status_changed BEFORE UPDATE OF status ON trustiam.application_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trustiam_identity_provisioning_request_status_changed BEFORE UPDATE OF status ON trustiam.identity_provisioning_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
