DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['organization','organization_provider','application_projection','projection_scope','identity_provisioning_request','identity_projection'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON trustiam.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table||'_updated_at',v_table); END LOOP; END $$;
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

CREATE FUNCTION trustiam.trg_guard_identity_saga_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
  IF (NEW.authority_tenant_id,NEW.identity_projection_id,NEW.desired_version,NEW.desired_hash,NEW.attempt_no,NEW.claim_token_hash,NEW.fencing_token,NEW.created_at,NEW.created_by)
     IS DISTINCT FROM
     (OLD.authority_tenant_id,OLD.identity_projection_id,OLD.desired_version,OLD.desired_hash,OLD.attempt_no,OLD.claim_token_hash,OLD.fencing_token,OLD.created_at,OLD.created_by) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='identity saga attempt identity is immutable';
  END IF;
  IF OLD.status IN('succeeded','failed','dead_letter','cancelled') THEN
    IF OLD.status='dead_letter' AND OLD.replay_requested_at IS NULL
       AND NEW.status='dead_letter' AND NEW.replay_requested_at IS NOT NULL
       AND NEW.replay_requested_by IS NOT NULL AND NEW.replay_approved_by IS NOT NULL
       AND NEW.replay_requested_by<>NEW.replay_approved_by
       AND (to_jsonb(NEW)-ARRAY['replay_requested_at','replay_requested_by','replay_approved_by','updated_at','updated_by'])
           =(to_jsonb(OLD)-ARRAY['replay_requested_at','replay_requested_by','replay_approved_by','updated_at','updated_by']) THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='terminal identity saga evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION trustiam.trg_guard_identity_desired_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
  IF (NEW.desired_version,NEW.desired_hash,NEW.desired_status,NEW.organization_id,NEW.relationship_kind,NEW.source_ref,NEW.desired_applications)
     IS DISTINCT FROM
     (OLD.desired_version,OLD.desired_hash,OLD.desired_status,OLD.organization_id,OLD.relationship_kind,OLD.source_ref,OLD.desired_applications)
     AND EXISTS(SELECT 1 FROM trustiam.identity_saga_attempt attempt WHERE attempt.authority_tenant_id=OLD.authority_tenant_id AND attempt.identity_projection_id=OLD.id AND attempt.status IN('claimed','running')) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='identity desired state is fenced by an active saga attempt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION trustiam.trg_guard_provider_identity_callback() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,trustiam AS $$
BEGIN
  IF (NEW.authority_tenant_id,NEW.event_id,NEW.identity_projection_id,NEW.desired_version,NEW.desired_hash,NEW.provider_sequence,NEW.provider_subject,NEW.observed_status,NEW.received_at,NEW.created_by)
     IS DISTINCT FROM
     (OLD.authority_tenant_id,OLD.event_id,OLD.identity_projection_id,OLD.desired_version,OLD.desired_hash,OLD.provider_sequence,OLD.provider_subject,OLD.observed_status,OLD.received_at,OLD.created_by)
     OR OLD.disposition<>'received' OR NEW.disposition='received' OR NEW.processed_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider identity callback evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identity_projection_saga_fence BEFORE UPDATE ON trustiam.identity_projection FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_desired_state();
CREATE TRIGGER identity_saga_attempt_guard BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_saga_attempt();
CREATE TRIGGER identity_saga_attempt_updated_at BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER provider_identity_callback_guard BEFORE UPDATE ON trustiam.provider_identity_callback_inbox FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_provider_identity_callback();
