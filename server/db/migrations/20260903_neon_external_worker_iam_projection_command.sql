BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_neon'
       OR current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION 'External-worker IAM projection command migration requires the NEON plane';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_engagement_iam_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
DECLARE
    v_command_execution_id uuid;
BEGIN
    IF NEW.access_status IS NOT DISTINCT FROM OLD.access_status THEN
        RETURN NEW;
    END IF;
    v_command_execution_id := NULLIF(
        current_setting('app.worker_engagement_iam_command_execution_id', true), ''
    )::uuid;
    IF v_command_execution_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM event.command_execution command
         WHERE command.id = v_command_execution_id
           AND command.tenant_id = NEW.tenant_id
           AND command.command_code = 'workforce.external_worker.iam.project'
           AND command.status = 'processing'
    ) THEN
        RAISE EXCEPTION 'Worker engagement IAM access state is command-owned'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.command_worker_engagement_iam_projection(
    p_tenant_id uuid,
    p_worker_engagement_id uuid,
    p_expected_version bigint,
    p_idempotency_key text,
    p_actor_id uuid,
    p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(
    worker_engagement_id uuid,
    desired_status text,
    desired_version bigint,
    desired_hash text,
    outbox_id uuid,
    replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, document, master, event, shared
AS $$
DECLARE
    v_fingerprint text;
    v_existing event.command_execution%ROWTYPE;
    v_engagement_status text;
    v_engagement_version bigint;
    v_onboarding_status text;
    v_readiness_evidence jsonb;
    v_legal_entity_id uuid;
    v_person_id uuid;
    v_person_status text;
    v_worker_status text;
    v_identifier text;
    v_display_name text;
    v_desired_status text;
    v_access_status text;
    v_desired_version bigint;
    v_desired_hash text;
    v_outbox_id uuid;
    v_execution_id uuid;
    v_payload jsonb;
BEGIN
    IF current_setting('app.database_plane', true) IS DISTINCT FROM 'neon'
       OR NULLIF(current_setting('app.current_tenant_id', true), '')::uuid IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id', true), '')::uuid IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Worker engagement IAM command context does not match plane, tenant and actor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_expected_version < 1
       OR btrim(p_idempotency_key) <> p_idempotency_key
       OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid worker engagement IAM command'
            USING ERRCODE = 'check_violation';
    END IF;

    v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
        'tenantId', p_tenant_id,
        'workerEngagementId', p_worker_engagement_id,
        'expectedVersion', p_expected_version,
        'idempotencyKey', p_idempotency_key,
        'actorId', p_actor_id
    )::text, 'UTF8'), 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':external-worker-iam:' || p_idempotency_key, 0
    ));
    SELECT command.* INTO v_existing
      FROM event.command_execution command
     WHERE command.tenant_id = p_tenant_id
       AND command.command_code = 'workforce.external_worker.iam.project'
       AND command.idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'Worker engagement IAM idempotency key was reused for another command'
                USING ERRCODE = 'unique_violation';
        END IF;
        IF v_existing.status <> 'succeeded' THEN
            RAISE EXCEPTION 'Prior worker engagement IAM command is not replayable in status %', v_existing.status
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN QUERY SELECT
            (v_existing.result_payload->>'workerEngagementId')::uuid,
            v_existing.result_payload->>'desiredStatus',
            (v_existing.result_payload->>'desiredVersion')::bigint,
            v_existing.result_payload->>'desiredHash',
            (v_existing.result_payload->>'outboxId')::uuid,
            true;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':worker-engagement:' || p_worker_engagement_id::text, 0
    ));
    SELECT engagement.status::text, engagement.row_version,
           engagement.onboarding_status, engagement.readiness_evidence,
           engagement.legal_entity_id,
           worker.person_id, person.status::text, worker.status::text,
           lower(btrim(person.primary_email)),
           COALESCE(NULLIF(btrim(person.display_name), ''),
                    NULLIF(btrim(person.preferred_name), ''),
                    btrim(concat_ws(' ', person.first_name, person.last_name)))
      INTO v_engagement_status, v_engagement_version, v_onboarding_status,
           v_readiness_evidence, v_legal_entity_id,
           v_person_id, v_person_status, v_worker_status,
           v_identifier, v_display_name
      FROM document.worker_engagement engagement
      JOIN master.external_worker worker
        ON worker.tenant_id = engagement.tenant_id
       AND worker.id = engagement.external_worker_id
      JOIN master.person person
        ON person.tenant_id = worker.tenant_id
       AND person.id = worker.person_id
     WHERE engagement.tenant_id = p_tenant_id
       AND engagement.id = p_worker_engagement_id
     FOR UPDATE OF engagement;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Worker engagement was not found in command tenant'
            USING ERRCODE = 'no_data_found';
    END IF;
    IF v_engagement_version <> p_expected_version THEN
        RAISE EXCEPTION 'Worker engagement version is stale'
            USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_engagement_status = 'active' THEN
        IF v_person_status <> 'active' OR v_worker_status <> 'active'
           OR v_identifier IS NULL OR v_identifier = ''
           OR v_onboarding_status <> 'completed'
           OR NOT (v_readiness_evidence @> '{"eligible":true}'::jsonb) THEN
            RAISE EXCEPTION 'Active worker engagement is not eligible for IAM provisioning'
                USING ERRCODE = 'check_violation';
        END IF;
        v_desired_status := 'active';
        v_access_status := 'requested';
    ELSIF v_engagement_status = 'suspended' THEN
        v_desired_status := 'suspended';
        v_access_status := 'deprovision_requested';
    ELSIF v_engagement_status IN ('completed', 'terminated', 'cancelled', 'closed') THEN
        v_desired_status := 'deprovisioned';
        v_access_status := 'deprovision_requested';
    ELSE
        RAISE EXCEPTION 'Worker engagement lifecycle state % cannot project IAM access', v_engagement_status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    INSERT INTO event.command_execution(
        tenant_id, command_code, idempotency_key, request_fingerprint, status,
        actor_principal_id, source_service, correlation_id, started_at,
        status_changed_at, status_changed_by, created_by
    ) VALUES (
        p_tenant_id, 'workforce.external_worker.iam.project', p_idempotency_key,
        v_fingerprint, 'processing', p_actor_id, 'neon.worker-engagement-iam',
        p_correlation_id, clock_timestamp(), clock_timestamp(), p_actor_id, p_actor_id
    ) RETURNING id INTO v_execution_id;

    PERFORM set_config('app.worker_engagement_iam_command_execution_id', v_execution_id::text, true);
    UPDATE document.worker_engagement engagement
       SET access_status = v_access_status,
           updated_by = p_actor_id
     WHERE engagement.tenant_id = p_tenant_id
       AND engagement.id = p_worker_engagement_id
       AND engagement.row_version = p_expected_version
    RETURNING engagement.row_version INTO v_desired_version;
    PERFORM set_config('app.worker_engagement_iam_command_execution_id', '', true);
    IF v_desired_version IS NULL THEN
        RAISE EXCEPTION 'Worker engagement version changed during IAM command'
            USING ERRCODE = 'serialization_failure';
    END IF;

    v_payload := jsonb_build_object(
        'schema', 'athyper.trustiam.identity-projection-intent/1',
        'sourcePlane', 'neon',
        'sourceTenantId', p_tenant_id,
        'authorityTenantId', p_tenant_id,
        'targetTenantId', p_tenant_id,
        'personId', v_person_id,
        'identifier', v_identifier,
        'displayName', v_display_name,
        'realmKey', 'neon',
        'organizationId', v_legal_entity_id,
        'relationship', 'external_worker',
        'sourceRef', 'worker_engagement:' || p_worker_engagement_id::text,
        'commandExecutionId', v_execution_id,
        'desiredVersion', v_desired_version,
        'desiredStatus', v_desired_status,
        'applications', jsonb_build_array(jsonb_build_object(
            'plane', 'neon',
            'targetTenantId', p_tenant_id,
            'roles', jsonb_build_array(jsonb_build_object(
                'roleCode', 'workforce.external_worker',
                'scopeKind', 'legal_entity',
                'scopeTargetId', v_legal_entity_id
            ))
        ))
    );
    v_desired_hash := encode(public.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
    v_payload := v_payload || jsonb_build_object('desiredHash', v_desired_hash);

    INSERT INTO event.outbox(
        tenant_id, topic, event_type, event_key, entity_type, entity_id,
        aggregate_type, aggregate_id, event_version, actor_id, source,
        correlation_id, partition_key, payload, created_by
    ) VALUES (
        p_tenant_id, 'neon-workforce-iam',
        'workforce.external_worker.identity_projection.requested',
        'external-worker-iam:' || p_worker_engagement_id::text || ':v' || v_desired_version::text,
        'worker_engagement', p_worker_engagement_id,
        'worker_engagement', p_worker_engagement_id,
        LEAST(v_desired_version, 2147483647)::integer, p_actor_id,
        'neon.worker-engagement-iam', p_correlation_id, p_tenant_id::text,
        v_payload, p_actor_id
    ) RETURNING id INTO v_outbox_id;

    UPDATE event.command_execution
       SET status = 'succeeded',
           result_payload = jsonb_build_object(
               'workerEngagementId', p_worker_engagement_id,
               'desiredStatus', v_desired_status,
               'desiredVersion', v_desired_version,
               'desiredHash', v_desired_hash,
               'outboxId', v_outbox_id
           ),
           completed_at = clock_timestamp(),
           status_changed_at = clock_timestamp(),
           status_changed_by = p_actor_id,
           updated_by = p_actor_id
     WHERE id = v_execution_id AND status = 'processing';

    RETURN QUERY SELECT p_worker_engagement_id, v_desired_status,
                        v_desired_version, v_desired_hash, v_outbox_id, false;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_engagement_15_iam_command
    ON document.worker_engagement;
CREATE TRIGGER trg_worker_engagement_15_iam_command
BEFORE UPDATE OF access_status ON document.worker_engagement
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_worker_engagement_iam_mutation();

REVOKE ALL ON FUNCTION document.command_worker_engagement_iam_projection(uuid,uuid,bigint,text,uuid,uuid) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT EXECUTE ON FUNCTION document.command_worker_engagement_iam_projection(uuid,uuid,bigint,text,uuid,uuid) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT EXECUTE ON FUNCTION document.command_worker_engagement_iam_projection(uuid,uuid,bigint,text,uuid,uuid) TO athyperadmin;
    END IF;
END;
$$;

COMMIT;
