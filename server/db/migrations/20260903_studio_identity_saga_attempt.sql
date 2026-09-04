BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_studio'
       OR current_setting('app.database_plane', true) <> 'studio' THEN
        RAISE EXCEPTION 'Identity saga authority migration requires the Studio plane';
    END IF;
    IF to_regclass('trustiam.identity_projection') IS NULL THEN
        RAISE EXCEPTION 'Identity saga authority requires trustiam.identity_projection';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS trustiam.identity_saga_attempt (
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='trustiam.identity_saga_attempt'::regclass AND conname='trustiam_identity_saga_attempt_projection_fk') THEN
        ALTER TABLE trustiam.identity_saga_attempt ADD CONSTRAINT trustiam_identity_saga_attempt_projection_fk
            FOREIGN KEY(authority_tenant_id,identity_projection_id) REFERENCES trustiam.identity_projection(authority_tenant_id,id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='trustiam.identity_saga_attempt'::regclass AND conname='trustiam_identity_saga_attempt_replay_fk') THEN
        ALTER TABLE trustiam.identity_saga_attempt ADD CONSTRAINT trustiam_identity_saga_attempt_replay_fk
            FOREIGN KEY(authority_tenant_id,manual_replay_of) REFERENCES trustiam.identity_saga_attempt(authority_tenant_id,id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS trustiam_identity_saga_attempt_open_uq
    ON trustiam.identity_saga_attempt(authority_tenant_id,identity_projection_id) WHERE status IN('claimed','running');
CREATE INDEX IF NOT EXISTS trustiam_identity_saga_attempt_claim_idx
    ON trustiam.identity_saga_attempt(status,next_attempt_at,lease_expires_at) WHERE status IN('claimed','running','failed');
CREATE INDEX IF NOT EXISTS trustiam_identity_saga_attempt_dead_letter_idx
    ON trustiam.identity_saga_attempt(authority_tenant_id,terminal_at DESC) WHERE status='dead_letter';

CREATE OR REPLACE FUNCTION trustiam.trg_guard_identity_saga_attempt() RETURNS trigger
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

CREATE OR REPLACE FUNCTION trustiam.trg_guard_identity_desired_state() RETURNS trigger
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

DROP TRIGGER IF EXISTS identity_projection_saga_fence ON trustiam.identity_projection;
CREATE TRIGGER identity_projection_saga_fence BEFORE UPDATE ON trustiam.identity_projection FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_desired_state();
DROP TRIGGER IF EXISTS identity_saga_attempt_guard ON trustiam.identity_saga_attempt;
CREATE TRIGGER identity_saga_attempt_guard BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION trustiam.trg_guard_identity_saga_attempt();
DROP TRIGGER IF EXISTS identity_saga_attempt_updated_at ON trustiam.identity_saga_attempt;
CREATE TRIGGER identity_saga_attempt_updated_at BEFORE UPDATE ON trustiam.identity_saga_attempt FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS identity_projection_updated_at ON trustiam.identity_projection;
CREATE TRIGGER identity_projection_updated_at BEFORE UPDATE ON trustiam.identity_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE trustiam.identity_saga_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.identity_saga_attempt FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='trustiam' AND tablename='identity_saga_attempt' AND policyname='authority_access') THEN
        CREATE POLICY authority_access ON trustiam.identity_saga_attempt FOR ALL
            USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='trustiam' AND tablename='identity_saga_attempt' AND policyname='seed_write') THEN
        CREATE POLICY seed_write ON trustiam.identity_saga_attempt FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_trustiam_service')
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='event' AND tablename='outbox' AND policyname='trustiam_identity_saga_evidence_insert') THEN
        CREATE POLICY trustiam_identity_saga_evidence_insert ON event.outbox FOR INSERT TO athyper_trustiam_service
            WITH CHECK(topic='iam.authority' AND event_type IN('trustiam.identity.saga.succeeded','trustiam.identity.saga.failed','trustiam.identity.saga.dead_letter') AND source='trustiam-identity-saga');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_saga_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_desired_state() FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT ON trustiam.identity_projection,trustiam.identity_saga_attempt TO athyperapp;
        GRANT UPDATE(replay_requested_at,replay_requested_by,replay_approved_by,updated_by) ON trustiam.identity_saga_attempt TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_trustiam_service') THEN
        GRANT USAGE ON SCHEMA trustiam,event TO athyper_trustiam_service;
        GRANT SELECT,INSERT,UPDATE ON trustiam.identity_projection,trustiam.identity_saga_attempt TO athyper_trustiam_service;
        GRANT INSERT ON event.outbox TO athyper_trustiam_service;
    END IF;
END;
$$;

COMMENT ON TABLE trustiam.identity_saga_attempt IS
    'Fenced retry/dead-letter evidence for identity, membership, application, suspension and deprovisioning convergence. Replay requires distinct MFA-authorized requester and SoD approver.';

COMMIT;
