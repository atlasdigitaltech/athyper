\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_tenant_id uuid;
    v_actor_id uuid;
    v_other_tenant_id uuid;
    v_other_actor_id uuid;
    v_supplier_id uuid;
    v_company_code_id uuid;
    v_legal_entity_id uuid;
    v_person_id uuid := shared.uuidv7();
    v_external_worker_id uuid := shared.uuidv7();
    v_sow_id uuid := shared.uuidv7();
    v_engagement_id uuid := shared.uuidv7();
    v_result record;
    v_version bigint;
    v_count bigint;
BEGIN
    SELECT tenant.id, principal.id, supplier.id, company.id, legal_entity.id
      INTO v_tenant_id, v_actor_id, v_supplier_id, v_company_code_id, v_legal_entity_id
      FROM master.tenant tenant
      JOIN LATERAL (
          SELECT id FROM master.principal
           WHERE tenant_id = tenant.id AND status = 'active' ORDER BY id LIMIT 1
      ) principal ON true
      JOIN LATERAL (
          SELECT id FROM master.supplier
           WHERE tenant_id = tenant.id ORDER BY id LIMIT 1
      ) supplier ON true
      JOIN LATERAL (
          SELECT id FROM master.company_code
           WHERE tenant_id = tenant.id ORDER BY id LIMIT 1
      ) company ON true
      JOIN LATERAL (
          SELECT id FROM master.legal_entity
           WHERE tenant_id = tenant.id ORDER BY id LIMIT 1
      ) legal_entity ON true
     ORDER BY tenant.id
     LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'G5 live probe requires one tenant with actor, supplier, company and legal entity';
    END IF;
    SELECT tenant.id, principal.id
      INTO v_other_tenant_id, v_other_actor_id
      FROM master.tenant tenant
      JOIN LATERAL (
          SELECT id FROM master.principal
           WHERE tenant_id = tenant.id AND status = 'active' ORDER BY id LIMIT 1
      ) principal ON true
     WHERE tenant.id <> v_tenant_id
     ORDER BY tenant.id
     LIMIT 1;
    IF v_other_tenant_id IS NULL THEN
        RAISE EXCEPTION 'G5 live probe requires a second tenant for isolation evidence';
    END IF;

    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_principal_id', v_actor_id::text, true);

    INSERT INTO master.person(
        id, tenant_id, code, name, first_name, last_name, display_name,
        primary_email, status, created_by
    ) VALUES (
        v_person_id, v_tenant_id, 'G5.PERSON.' || replace(v_person_id::text, '-', ''),
        'G5 External Worker', 'G5', 'Worker', 'G5 External Worker',
        'g5-' || replace(v_person_id::text, '-', '') || '@example.test', 'active', v_actor_id
    );
    INSERT INTO master.external_worker(
        id, tenant_id, person_id, worker_number, default_classification,
        status, created_by
    ) VALUES (
        v_external_worker_id, v_tenant_id, v_person_id,
        'G5.' || substr(replace(v_external_worker_id::text, '-', ''), 1, 24),
        'consultant', 'active', v_actor_id
    );
    INSERT INTO document.statement_of_work(
        id, tenant_id, company_code_id, legal_entity_id, supplier_id,
        code, name, status, created_by
    ) VALUES (
        v_sow_id, v_tenant_id, v_company_code_id, v_legal_entity_id,
        v_supplier_id, 'G5.' || substr(replace(v_sow_id::text, '-', ''), 1, 24),
        'G5 IAM probe SOW', 'active', v_actor_id
    );
    INSERT INTO document.worker_engagement(
        id, tenant_id, external_worker_id, supplier_id, company_code_id,
        legal_entity_id, statement_of_work_id, code, name,
        worker_classification, start_date, end_date, currency_code,
        readiness_evidence, onboarding_status, access_status, status,
        activated_at, activated_by, created_by
    ) VALUES (
        v_engagement_id, v_tenant_id, v_external_worker_id, v_supplier_id,
        v_company_code_id, v_legal_entity_id, v_sow_id,
        'G5.' || substr(replace(v_engagement_id::text, '-', ''), 1, 24),
        'G5 IAM probe engagement', 'consultant', current_date,
        current_date + 30, 'USD', '{"eligible":true,"probe":"g5"}'::jsonb,
        'completed', 'not_requested', 'active', clock_timestamp(), v_actor_id, v_actor_id
    );

    SELECT * INTO v_result
      FROM document.command_worker_engagement_iam_projection(
          v_tenant_id, v_engagement_id, 1, 'g5-live-provision-0001',
          v_actor_id, shared.uuidv7()
      );
    IF v_result.replayed OR v_result.desired_status <> 'active'
       OR v_result.desired_version <> 2 OR v_result.desired_hash !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'G5 provision result is invalid: %', row_to_json(v_result);
    END IF;
    SELECT count(*) INTO v_count FROM event.outbox
     WHERE tenant_id = v_tenant_id
       AND event_key = 'external-worker-iam:' || v_engagement_id::text || ':v2'
       AND payload->>'sourceRef' = 'worker_engagement:' || v_engagement_id::text
       AND payload->>'relationship' = 'external_worker'
       AND payload->>'desiredStatus' = 'active';
    IF v_count <> 1 THEN RAISE EXCEPTION 'G5 active outbox evidence missing'; END IF;

    SELECT * INTO v_result
      FROM document.command_worker_engagement_iam_projection(
          v_tenant_id, v_engagement_id, 1, 'g5-live-provision-0001',
          v_actor_id, shared.uuidv7()
      );
    IF NOT v_result.replayed OR v_result.desired_version <> 2 THEN
        RAISE EXCEPTION 'G5 exact replay did not return the original result';
    END IF;
    SELECT count(*) INTO v_count FROM event.outbox
     WHERE tenant_id = v_tenant_id AND aggregate_id = v_engagement_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'G5 exact replay duplicated its outbox'; END IF;

    BEGIN
        PERFORM document.command_worker_engagement_iam_projection(
            v_tenant_id, v_engagement_id, 2, 'g5-live-provision-0001',
            v_actor_id, NULL
        );
        RAISE EXCEPTION 'G5 expected idempotency conflict was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        PERFORM document.command_worker_engagement_iam_projection(
            v_tenant_id, v_engagement_id, 1, 'g5-live-stale-0001',
            v_actor_id, NULL
        );
        RAISE EXCEPTION 'G5 expected stale version was accepted';
    EXCEPTION WHEN serialization_failure THEN NULL;
    END;
    BEGIN
        UPDATE document.worker_engagement SET access_status = 'failed'
         WHERE tenant_id = v_tenant_id AND id = v_engagement_id;
        RAISE EXCEPTION 'G5 direct access-state mutation was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM document.command_worker_engagement_iam_projection(
            v_tenant_id, v_engagement_id, 2, 'g5-live-rollback-0001',
            v_actor_id, NULL
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'force rollback';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
    SELECT row_version INTO v_version FROM document.worker_engagement
     WHERE tenant_id = v_tenant_id AND id = v_engagement_id;
    IF v_version <> 2 OR EXISTS (
        SELECT 1 FROM event.command_execution
         WHERE tenant_id = v_tenant_id AND idempotency_key = 'g5-live-rollback-0001'
    ) OR EXISTS (
        SELECT 1 FROM event.outbox
         WHERE tenant_id = v_tenant_id
           AND event_key = 'external-worker-iam:' || v_engagement_id::text || ':v3'
    ) THEN RAISE EXCEPTION 'G5 rollback left authority, command or outbox residue'; END IF;

    UPDATE document.worker_engagement SET status = 'suspended', updated_by = v_actor_id
     WHERE tenant_id = v_tenant_id AND id = v_engagement_id;
    SELECT * INTO v_result
      FROM document.command_worker_engagement_iam_projection(
          v_tenant_id, v_engagement_id, 3, 'g5-live-suspend-0001',
          v_actor_id, NULL
      );
    IF v_result.desired_status <> 'suspended' OR v_result.desired_version <> 4 THEN
        RAISE EXCEPTION 'G5 suspension intent is invalid';
    END IF;

    UPDATE document.worker_engagement SET status = 'terminated', updated_by = v_actor_id
     WHERE tenant_id = v_tenant_id AND id = v_engagement_id;
    SELECT * INTO v_result
      FROM document.command_worker_engagement_iam_projection(
          v_tenant_id, v_engagement_id, 5, 'g5-live-terminate-0001',
          v_actor_id, NULL
      );
    IF v_result.desired_status <> 'deprovisioned' OR v_result.desired_version <> 6 THEN
        RAISE EXCEPTION 'G5 termination intent is invalid';
    END IF;

    PERFORM set_config('app.current_tenant_id', v_other_tenant_id::text, true);
    PERFORM set_config('app.current_principal_id', v_other_actor_id::text, true);
    BEGIN
        PERFORM document.command_worker_engagement_iam_projection(
            v_other_tenant_id, v_engagement_id, 6, 'g5-live-cross-tenant-0001',
            v_other_actor_id, NULL
        );
        RAISE EXCEPTION 'G5 cross-tenant command was accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;

    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_principal_id', v_actor_id::text, true);
    IF (SELECT count(*) FROM master.person WHERE tenant_id = v_tenant_id AND id = v_person_id) <> 1
       OR (SELECT count(*) FROM master.external_worker WHERE tenant_id = v_tenant_id AND id = v_external_worker_id) <> 1
       OR (SELECT count(*) FROM document.worker_engagement WHERE tenant_id = v_tenant_id AND id = v_engagement_id) <> 1 THEN
        RAISE EXCEPTION 'G5 IAM commands recreated or removed source authority';
    END IF;
    IF (SELECT count(*) FROM event.command_execution
         WHERE tenant_id = v_tenant_id
           AND command_code = 'workforce.external_worker.iam.project') <> 3
       OR (SELECT count(*) FROM event.outbox
         WHERE tenant_id = v_tenant_id AND aggregate_id = v_engagement_id) <> 3 THEN
        RAISE EXCEPTION 'G5 command/outbox atomic counts are invalid';
    END IF;
END;
$$;

ROLLBACK;
