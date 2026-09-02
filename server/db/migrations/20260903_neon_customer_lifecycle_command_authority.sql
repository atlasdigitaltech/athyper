\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Customer lifecycle command-authority migration requires the NEON plane';
  END IF;
  IF EXISTS (
    SELECT 1 FROM control.customer_lifecycle_event
     WHERE action_code IN ('activate','reactivate')
       AND (readiness_fingerprint IS NULL
            OR readiness_evidence->>'decisionFingerprint' IS DISTINCT FROM readiness_fingerprint
            OR readiness_evidence->>'eligible' IS DISTINCT FROM 'true')
  ) THEN
    RAISE EXCEPTION 'S3 preflight: activation lifecycle history lacks pinned eligible readiness evidence';
  END IF;
END $$;

DROP TRIGGER trg_customer_lifecycle_event_immutable
  ON control.customer_lifecycle_event;

ALTER TABLE control.customer_lifecycle_event
  ADD COLUMN business_date date,
  ADD COLUMN command_fingerprint text;

UPDATE control.customer_lifecycle_event event
   SET business_date = event.occurred_at::date,
       command_fingerprint = encode(public.digest(convert_to(
         jsonb_build_object(
           'tenantId', event.tenant_id,
           'businessPartnerId', event.business_partner_id,
           'customerId', event.customer_id,
           'operatingOrganizationId', event.operating_organization_id,
           'companyCodeId', event.company_code_id,
           'action', event.action_code,
           'reasonCode', event.reason_code,
           'businessDate', event.occurred_at::date,
           'readinessFingerprint', event.readiness_fingerprint,
           'readinessEvidence', event.readiness_evidence,
           'idempotencyKey', event.idempotency_key,
           'actorId', event.occurred_by
         )::text, 'UTF8'), 'sha256'), 'hex');

ALTER TABLE control.customer_lifecycle_event
  ALTER COLUMN business_date SET NOT NULL,
  ALTER COLUMN command_fingerprint SET NOT NULL,
  ADD CONSTRAINT customer_lifecycle_event_command_fingerprint_chk
    CHECK(command_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT customer_lifecycle_event_readiness_chk
    CHECK(action_code='suspend' OR (
      readiness_fingerprint IS NOT NULL
      AND readiness_evidence->>'decisionFingerprint'=readiness_fingerprint
      AND readiness_evidence->>'eligible'='true'
    ));

CREATE TRIGGER trg_customer_lifecycle_event_immutable
BEFORE UPDATE OR DELETE ON control.customer_lifecycle_event
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_customer_lifecycle_event_mutation();

CREATE OR REPLACE FUNCTION master.trg_guard_customer_lifecycle_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_event_id uuid;
    v_event control.customer_lifecycle_event%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status::text <> 'prospect'
           OR NEW.status_changed_at IS NOT NULL
           OR NEW.status_changed_by IS NOT NULL THEN
            RAISE EXCEPTION 'New Customer roles must start as evidence-free prospects'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        IF NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
           OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by THEN
            RAISE EXCEPTION 'Customer lifecycle evidence is command-owned'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;

    BEGIN
        v_event_id := NULLIF(
            current_setting('app.customer_lifecycle_event_id', true), ''
        )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_event_id := NULL;
    END;
    IF v_event_id IS NULL THEN
        RAISE EXCEPTION 'Customer status may only change through control.command_customer_lifecycle'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT event.* INTO v_event
      FROM control.customer_lifecycle_event event
     WHERE event.id = v_event_id
       AND event.tenant_id = OLD.tenant_id
       AND event.customer_id = OLD.id;
    IF NOT FOUND
       OR v_event.business_partner_id IS DISTINCT FROM OLD.business_partner_id
       OR v_event.from_status IS DISTINCT FROM OLD.status::text
       OR v_event.to_status IS DISTINCT FROM NEW.status::text
       OR v_event.occurred_by IS DISTINCT FROM NEW.updated_by THEN
        RAISE EXCEPTION 'Customer status change does not match its lifecycle command evidence'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_08_lifecycle_initial
BEFORE INSERT ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_customer_lifecycle_authority();

CREATE TRIGGER trg_customer_09_lifecycle_authority
BEFORE UPDATE OF status, status_changed_at, status_changed_by
ON master.customer
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_customer_lifecycle_authority();

CREATE OR REPLACE FUNCTION control.command_customer_lifecycle(
    p_tenant_id uuid,
    p_business_partner_id uuid,
    p_customer_id uuid,
    p_operating_organization_id uuid,
    p_company_code_id uuid,
    p_action text,
    p_reason_code text,
    p_business_date date,
    p_readiness_fingerprint text,
    p_readiness_evidence jsonb,
    p_idempotency_key text,
    p_actor_id uuid
)
RETURNS TABLE(customer_id uuid, status text, event_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_customer master.customer%ROWTYPE;
    v_existing control.customer_lifecycle_event%ROWTYPE;
    v_event_id uuid;
    v_from_status text;
    v_to_status text;
    v_command_fingerprint text;
BEGIN
    IF NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
           IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id', true), '')::uuid
           IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Customer lifecycle command context does not match tenant and actor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_action NOT IN ('activate', 'suspend', 'reactivate')
       OR p_reason_code !~ '^[A-Z][A-Z0-9_.-]{2,126}$'
       OR btrim(p_idempotency_key) <> p_idempotency_key
       OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
       OR jsonb_typeof(COALESCE(p_readiness_evidence, '{}'::jsonb)) <> 'object' THEN
        RAISE EXCEPTION 'Invalid Customer lifecycle command'
            USING ERRCODE = 'check_violation';
    END IF;

    v_from_status := CASE p_action
        WHEN 'activate' THEN 'prospect'
        WHEN 'suspend' THEN 'active'
        ELSE 'suspended'
    END;
    v_to_status := CASE p_action WHEN 'suspend' THEN 'suspended' ELSE 'active' END;

    IF p_action <> 'suspend' AND (
        p_readiness_fingerprint IS NULL
        OR p_readiness_fingerprint !~ '^[a-f0-9]{64}$'
        OR p_readiness_evidence->>'decisionFingerprint' IS DISTINCT FROM p_readiness_fingerprint
        OR p_readiness_evidence->>'eligible' IS DISTINCT FROM 'true'
        OR p_readiness_evidence->>'businessPartnerId' IS DISTINCT FROM p_business_partner_id::text
        OR p_readiness_evidence->>'role' IS DISTINCT FROM 'customer'
        OR p_readiness_evidence->>'operatingOrganizationId' IS DISTINCT FROM p_operating_organization_id::text
        OR p_readiness_evidence->>'companyCodeId' IS DISTINCT FROM p_company_code_id::text
        OR p_readiness_evidence->>'businessDate' IS DISTINCT FROM p_business_date::text
    ) THEN
        RAISE EXCEPTION 'Customer activation requires matching eligible readiness evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_action = 'suspend' AND p_readiness_fingerprint IS NOT NULL
       AND p_readiness_fingerprint !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Invalid Customer suspension readiness fingerprint'
            USING ERRCODE = 'check_violation';
    END IF;

    v_command_fingerprint := encode(public.digest(convert_to(
        jsonb_build_object(
            'tenantId', p_tenant_id, 'businessPartnerId', p_business_partner_id,
            'customerId', p_customer_id,
            'operatingOrganizationId', p_operating_organization_id,
            'companyCodeId', p_company_code_id, 'action', p_action,
            'reasonCode', p_reason_code, 'businessDate', p_business_date,
            'readinessFingerprint', p_readiness_fingerprint,
            'readinessEvidence', COALESCE(p_readiness_evidence, '{}'::jsonb),
            'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
        )::text, 'UTF8'), 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':customer-lifecycle:' || p_customer_id::text, 0
    ));
    SELECT event.* INTO v_existing
      FROM control.customer_lifecycle_event event
     WHERE event.tenant_id = p_tenant_id
       AND event.idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.command_fingerprint IS DISTINCT FROM v_command_fingerprint THEN
            RAISE EXCEPTION 'Customer lifecycle idempotency key was reused for another command'
                USING ERRCODE = 'unique_violation';
        END IF;
        RETURN QUERY SELECT v_existing.customer_id, v_existing.to_status,
                            v_existing.id, true;
        RETURN;
    END IF;

    SELECT customer.* INTO v_customer
      FROM master.customer customer
     WHERE customer.tenant_id = p_tenant_id
       AND customer.id = p_customer_id
       AND customer.business_partner_id = p_business_partner_id
     FOR UPDATE;
    IF NOT FOUND OR v_customer.status::text <> v_from_status THEN
        RETURN;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.business_partner_operating_organization_assignment assignment
          JOIN master.operating_organization_company_assignment company_scope
            ON company_scope.tenant_id = assignment.tenant_id
           AND company_scope.operating_organization_id = assignment.operating_organization_id
           AND company_scope.company_code_id = p_company_code_id
           AND company_scope.status = 'active'
           AND company_scope.effective_from <= p_business_date
           AND (company_scope.effective_until IS NULL OR company_scope.effective_until > p_business_date)
         WHERE assignment.tenant_id = p_tenant_id
           AND assignment.business_partner_id = p_business_partner_id
           AND assignment.operating_organization_id = p_operating_organization_id
           AND assignment.partner_role = 'customer'
           AND assignment.status = 'active'
           AND assignment.effective_from <= p_business_date
           AND (assignment.effective_until IS NULL OR assignment.effective_until > p_business_date)
    ) THEN
        RAISE EXCEPTION 'Customer lifecycle command is outside an active organization/company scope'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO control.customer_lifecycle_event(
        tenant_id, business_partner_id, customer_id,
        operating_organization_id, company_code_id, action_code,
        from_status, to_status, reason_code, business_date,
        readiness_fingerprint, readiness_evidence, idempotency_key,
        command_fingerprint, occurred_by
    ) VALUES (
        p_tenant_id, p_business_partner_id, p_customer_id,
        p_operating_organization_id, p_company_code_id, p_action,
        v_from_status, v_to_status, p_reason_code, p_business_date,
        p_readiness_fingerprint, COALESCE(p_readiness_evidence, '{}'::jsonb),
        p_idempotency_key, v_command_fingerprint, p_actor_id
    ) RETURNING id INTO v_event_id;

    PERFORM set_config('app.customer_lifecycle_event_id', v_event_id::text, true);
    UPDATE master.customer
       SET status = v_to_status::master.customer_status_d,
           updated_by = p_actor_id
     WHERE tenant_id = p_tenant_id AND id = p_customer_id;
    PERFORM set_config('app.customer_lifecycle_event_id', '', true);

    RETURN QUERY SELECT p_customer_id, v_to_status, v_event_id, false;
END;
$$;

COMMENT ON FUNCTION control.command_customer_lifecycle(
    uuid, uuid, uuid, uuid, uuid, text, text, date, text, jsonb, text, uuid
) IS 'Sole tenant-bound command authority for Customer activation, suspension, and reactivation; atomically records immutable evidence and projects master.customer.status.';
COMMENT ON TABLE control.customer_lifecycle_event IS
  'Immutable audited and idempotent Customer lifecycle command ledger. It is the sole authority permitted to change master.customer.status.';

REVOKE ALL ON FUNCTION control.command_customer_lifecycle(
  uuid,uuid,uuid,uuid,uuid,text,text,date,text,jsonb,text,uuid
) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    REVOKE UPDATE ON master.customer FROM athyperapp;
    GRANT UPDATE(customer_type,metadata,updated_at,updated_by)
      ON master.customer TO athyperapp;
    REVOKE ALL ON control.customer_lifecycle_event FROM athyperapp;
    GRANT SELECT ON control.customer_lifecycle_event TO athyperapp;
    GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(
      uuid,uuid,uuid,uuid,uuid,text,text,date,text,jsonb,text,uuid
    ) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    REVOKE UPDATE ON master.customer FROM athyperadmin;
    GRANT UPDATE(business_partner_id,customer_code,customer_type,metadata,updated_at,updated_by)
      ON master.customer TO athyperadmin;
    REVOKE ALL ON control.customer_lifecycle_event FROM athyperadmin;
    GRANT SELECT ON control.customer_lifecycle_event TO athyperadmin;
    GRANT EXECUTE ON FUNCTION control.command_customer_lifecycle(
      uuid,uuid,uuid,uuid,uuid,text,text,date,text,jsonb,text,uuid
    ) TO athyperadmin;
  END IF;
END $$;

COMMIT;
