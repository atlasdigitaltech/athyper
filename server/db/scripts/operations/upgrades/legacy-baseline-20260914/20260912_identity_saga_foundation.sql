-- Existing Studio installations need the saga foundation before replay approvals.
-- Snapshot of the canonical identity tables, constraints, indexes, guards and RLS.
-- Existing complete installations are unchanged; partial installations fail closed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $upgrade$
DECLARE present integer;
BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM 'studio' THEN
   RAISE EXCEPTION 'identity saga foundation upgrade requires Studio';
 END IF;
 SELECT count(*) INTO present FROM unnest(ARRAY['trustiam.identity_projection','trustiam.identity_saga_attempt','trustiam.provider_identity_callback_inbox']) name WHERE to_regclass(name) IS NOT NULL;
 IF present=3 THEN RETURN; END IF;
 IF present<>0 THEN RAISE EXCEPTION 'partial identity saga foundation requires review'; END IF;
 EXECUTE $definition$
CREATE TABLE trustiam.identity_projection (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL,
 source_plane shared.application_plane_d NOT NULL, source_tenant_id uuid NOT NULL, person_id uuid NOT NULL,
 organization_id uuid NOT NULL, relationship_kind text NOT NULL, source_ref text NOT NULL,
 realm_key text NOT NULL, normalized_identifier text NOT NULL, display_name text NOT NULL,
 desired_version bigint NOT NULL, desired_hash char(64) NOT NULL, desired_status text NOT NULL,
 desired_applications jsonb NOT NULL, reconciliation_status trustiam.reconciliation_status_d NOT NULL DEFAULT 'pending',
 provider_subject text, provider_sequence bigint, observed_status text, observed_version bigint, observed_hash char(64), observed_at timestamptz,
 last_error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_projection_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_projection_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_projection_person_uq UNIQUE(authority_tenant_id,source_plane,source_tenant_id,person_id),
 CONSTRAINT trustiam_identity_projection_source_uq UNIQUE(authority_tenant_id,source_plane,source_tenant_id,relationship_kind,source_ref),
 CONSTRAINT trustiam_identity_projection_identifier_uq UNIQUE(authority_tenant_id,realm_key,normalized_identifier),
 CONSTRAINT trustiam_identity_projection_version_chk CHECK(desired_version>0 AND (provider_sequence IS NULL OR provider_sequence>0) AND (observed_version IS NULL OR observed_version>0)),
 CONSTRAINT trustiam_identity_projection_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND (observed_hash IS NULL OR observed_hash~'^[a-f0-9]{64}$')),
 CONSTRAINT trustiam_identity_projection_relationship_chk CHECK(relationship_kind IN('employer','contact','external_worker')),
 CONSTRAINT trustiam_identity_projection_source_ref_chk CHECK((relationship_kind='employer' AND source_ref LIKE 'employment:%') OR (relationship_kind='contact' AND source_ref LIKE 'business_partner_contact:%') OR (relationship_kind='external_worker' AND source_ref LIKE 'worker_engagement:%')),
 CONSTRAINT trustiam_identity_projection_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT trustiam_identity_projection_identifier_chk CHECK(btrim(normalized_identifier)<>'' AND length(normalized_identifier)<=320 AND btrim(display_name)<>''),
 CONSTRAINT trustiam_identity_projection_status_chk CHECK(desired_status IN('invited','active','suspended','deprovisioned') AND (observed_status IS NULL OR observed_status IN('invited','active','suspended','deprovisioned'))),
 CONSTRAINT trustiam_identity_projection_applications_chk CHECK(jsonb_typeof(desired_applications)='array' AND (desired_status IN('suspended','deprovisioned') OR jsonb_array_length(desired_applications)>0)),
 CONSTRAINT trustiam_identity_projection_observation_chk CHECK(
   (provider_subject IS NULL AND provider_sequence IS NULL AND observed_status IS NULL AND observed_version IS NULL AND observed_hash IS NULL AND observed_at IS NULL)
   OR (provider_subject IS NOT NULL AND observed_status IS NOT NULL AND observed_version IS NOT NULL AND observed_hash IS NOT NULL AND observed_at IS NOT NULL)
 ),
 CONSTRAINT trustiam_identity_projection_error_chk CHECK((reconciliation_status='failed')=(last_error_code IS NOT NULL)),
 CONSTRAINT trustiam_identity_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_projection IS 'Desired and safely fenced observed identity projection, uniquely correlated to its employment, BP-contact, or worker-engagement authority. desired_applications is transport input only; plane-local principal, membership, role and scope tables remain authoritative.';

CREATE TABLE trustiam.identity_saga_attempt (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, identity_projection_id uuid NOT NULL,
 desired_version bigint NOT NULL, desired_hash char(64) NOT NULL, attempt_no integer NOT NULL,
 worker_id text NOT NULL, claim_token_hash char(64) NOT NULL, fencing_token bigint NOT NULL,
 status text NOT NULL DEFAULT 'claimed', failure_class text, error_code text,
 lease_expires_at timestamptz NOT NULL, next_attempt_at timestamptz, started_at timestamptz, terminal_at timestamptz,
 receipt jsonb NOT NULL DEFAULT '{}'::jsonb, manual_replay_of uuid,
 replay_requested_at timestamptz, replay_requested_by uuid, replay_approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
 CONSTRAINT trustiam_identity_saga_attempt_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_identity_saga_attempt_tenant_id_uq UNIQUE(authority_tenant_id,id),
 CONSTRAINT trustiam_identity_saga_attempt_no_uq UNIQUE(authority_tenant_id,identity_projection_id,desired_version,desired_hash,attempt_no),
 CONSTRAINT trustiam_identity_saga_attempt_version_chk CHECK(desired_version>0 AND attempt_no>0 AND fencing_token>0),
 CONSTRAINT trustiam_identity_saga_attempt_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$' AND claim_token_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_identity_saga_attempt_worker_chk CHECK(btrim(worker_id)<>'' AND octet_length(worker_id)<=128),
 CONSTRAINT trustiam_identity_saga_attempt_status_chk CHECK(status IN('claimed','running','succeeded','failed','dead_letter','cancelled')),
 CONSTRAINT trustiam_identity_saga_attempt_failure_chk CHECK(failure_class IS NULL OR failure_class IN('transient','permanent','stale')),
 CONSTRAINT trustiam_identity_saga_attempt_terminal_chk CHECK(
   (status IN('claimed','running') AND terminal_at IS NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status='succeeded' AND terminal_at IS NOT NULL AND failure_class IS NULL AND error_code IS NULL)
   OR (status IN('failed','dead_letter','cancelled') AND terminal_at IS NOT NULL AND failure_class IS NOT NULL AND btrim(error_code)<>'')
 ),
 CONSTRAINT trustiam_identity_saga_attempt_time_chk CHECK(lease_expires_at>created_at AND (started_at IS NULL OR started_at>=created_at) AND (terminal_at IS NULL OR terminal_at>=coalesce(started_at,created_at))),
 CONSTRAINT trustiam_identity_saga_attempt_receipt_chk CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=32768),
 CONSTRAINT trustiam_identity_saga_attempt_replay_chk CHECK(
   (replay_requested_at IS NULL AND replay_requested_by IS NULL AND replay_approved_by IS NULL)
   OR (status='dead_letter' AND replay_requested_at IS NOT NULL AND replay_requested_by IS NOT NULL AND replay_approved_by IS NOT NULL AND replay_requested_by<>replay_approved_by)
 ),
 CONSTRAINT trustiam_identity_saga_attempt_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE trustiam.identity_saga_attempt IS 'Fenced retry/dead-letter evidence for identity, membership, application, suspension and deprovisioning convergence. Replay requires distinct MFA-authorized requester and SoD approver.';

CREATE TABLE trustiam.provider_identity_callback_inbox (
 id uuid NOT NULL DEFAULT shared.uuidv7(), authority_tenant_id uuid NOT NULL, event_id text NOT NULL,
 identity_projection_id uuid NOT NULL, desired_version bigint NOT NULL, desired_hash char(64) NOT NULL,
 provider_sequence bigint NOT NULL, provider_subject text NOT NULL, observed_status text NOT NULL,
 disposition text NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
 created_by uuid NOT NULL,
 CONSTRAINT trustiam_provider_identity_callback_inbox_pkey PRIMARY KEY(id),
 CONSTRAINT trustiam_provider_identity_callback_event_uq UNIQUE(authority_tenant_id,event_id),
 CONSTRAINT trustiam_provider_identity_callback_version_chk CHECK(desired_version>0 AND provider_sequence>0),
 CONSTRAINT trustiam_provider_identity_callback_hash_chk CHECK(desired_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT trustiam_provider_identity_callback_subject_chk CHECK(btrim(provider_subject)<>''),
 CONSTRAINT trustiam_provider_identity_callback_status_chk CHECK(observed_status IN('invited','active','suspended','deprovisioned')),
 CONSTRAINT trustiam_provider_identity_callback_disposition_chk CHECK(disposition IN('received','applied','stale','out_of_order') AND (disposition='received')=(processed_at IS NULL))
);
COMMENT ON TABLE trustiam.provider_identity_callback_inbox IS 'Immutable callback receipt. Exact desired version/hash and monotonic provider_sequence gate observation updates; payload attributes are intentionally not stored.';

ALTER TABLE trustiam.identity_projection
 ADD CONSTRAINT trustiam_identity_projection_tenant_fk FOREIGN KEY(authority_tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 ADD CONSTRAINT trustiam_identity_projection_organization_fk FOREIGN KEY(authority_tenant_id,organization_id) REFERENCES trustiam.organization(authority_tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE trustiam.identity_saga_attempt
 ADD CONSTRAINT trustiam_identity_saga_attempt_projection_fk FOREIGN KEY(authority_tenant_id,identity_projection_id) REFERENCES trustiam.identity_projection(authority_tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT trustiam_identity_saga_attempt_replay_fk FOREIGN KEY(authority_tenant_id,manual_replay_of) REFERENCES trustiam.identity_saga_attempt(authority_tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE trustiam.provider_identity_callback_inbox
 ADD CONSTRAINT trustiam_provider_identity_callback_projection_fk FOREIGN KEY(authority_tenant_id,identity_projection_id) REFERENCES trustiam.identity_projection(authority_tenant_id,id) ON DELETE RESTRICT;

CREATE INDEX trustiam_identity_projection_reconcile_idx ON trustiam.identity_projection(reconciliation_status,updated_at,created_at) WHERE reconciliation_status IN('pending','drifted','failed');
CREATE UNIQUE INDEX trustiam_identity_saga_attempt_open_uq ON trustiam.identity_saga_attempt(authority_tenant_id,identity_projection_id) WHERE status IN('claimed','running');
CREATE INDEX trustiam_identity_saga_attempt_claim_idx ON trustiam.identity_saga_attempt(status,next_attempt_at,lease_expires_at) WHERE status IN('claimed','running','failed');
CREATE INDEX trustiam_identity_saga_attempt_dead_letter_idx ON trustiam.identity_saga_attempt(authority_tenant_id,terminal_at DESC) WHERE status='dead_letter';
CREATE INDEX trustiam_provider_identity_callback_pending_idx ON trustiam.provider_identity_callback_inbox(received_at) WHERE disposition='received';
CREATE INDEX trustiam_provider_identity_callback_sequence_idx ON trustiam.provider_identity_callback_inbox(authority_tenant_id,identity_projection_id,provider_sequence DESC);
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


ALTER TABLE trustiam.identity_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.identity_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_access ON trustiam.identity_projection FOR ALL USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());
ALTER TABLE trustiam.identity_saga_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.identity_saga_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_access ON trustiam.identity_saga_attempt FOR ALL USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());
ALTER TABLE trustiam.provider_identity_callback_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.provider_identity_callback_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_access ON trustiam.provider_identity_callback_inbox FOR ALL USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());
CREATE TRIGGER identity_projection_updated_at BEFORE UPDATE ON trustiam.identity_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_saga_attempt(),trustiam.trg_guard_identity_desired_state(),trustiam.trg_guard_provider_identity_callback() FROM PUBLIC;
GRANT SELECT ON trustiam.identity_projection,trustiam.identity_saga_attempt TO athyperapp;
GRANT UPDATE(replay_requested_at,replay_requested_by,replay_approved_by,updated_by) ON trustiam.identity_saga_attempt TO athyperapp;
GRANT SELECT,INSERT,UPDATE ON trustiam.identity_projection,trustiam.identity_saga_attempt,trustiam.provider_identity_callback_inbox TO athyper_trustiam_service;

$definition$;
END;
$upgrade$;
COMMIT;
