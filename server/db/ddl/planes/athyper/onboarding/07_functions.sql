-- ============================================================================
-- onboarding/07_functions.sql
-- Deterministic helpers for onboarding orchestration persistence.
-- ============================================================================

CREATE OR REPLACE FUNCTION onboarding.fn_create_case_with_target(
    p_case_code text,
    p_canonical_party_id uuid,
    p_target_plane shared.application_plane_d,
    p_target_tenant_id uuid,
    p_requested_plan_id uuid DEFAULT NULL,
    p_requested_workspace_id uuid DEFAULT NULL,
    p_requested_module_id uuid DEFAULT NULL,
    p_requested_projection_id uuid DEFAULT NULL,
    p_requested_scope_target_id uuid DEFAULT NULL,
    p_request_metadata jsonb DEFAULT '{}'::jsonb,
    p_request_payload jsonb DEFAULT '{}'::jsonb,
    p_subject_principal_id uuid DEFAULT NULL,
    p_requesting_principal_id uuid DEFAULT NULL,
    p_source_onboarding_mode onboarding.entry_mode_d DEFAULT 'self_service',
    p_priority text DEFAULT 'normal',
    p_activation_criticality onboarding.activation_criticality_d DEFAULT 'independent'
)
RETURNS TABLE(case_id uuid, target_id uuid, revision_no integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, onboarding, master, shared, authz, control
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_actor uuid := master.current_principal_id_soft();
    v_normalized_code text;
    v_target_id uuid;
    v_request_by uuid := COALESCE(p_requesting_principal_id, v_actor);
BEGIN
    IF v_tenant_id IS NULL OR v_actor IS NULL THEN
        RAISE EXCEPTION 'Current tenant/principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_case_code IS NULL OR btrim(p_case_code) = '' THEN
        RAISE EXCEPTION 'p_case_code is required'
            USING ERRCODE = 'check_violation';
    END IF;

    v_normalized_code := lower(regexp_replace(btrim(p_case_code), '[^a-zA-Z0-9_.-]', '', 'g'));
    IF v_normalized_code !~ '^[a-z][a-z0-9_.-]{1,126}$' THEN
        RAISE EXCEPTION 'Invalid case_code format'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_canonical_party_id IS NULL THEN
        RAISE EXCEPTION 'canonical party is required'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'target tenant is required'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_requested_projection_id IS NULL
       AND p_requested_scope_target_id IS NULL
       AND p_requested_plan_id IS NULL
       AND p_requested_workspace_id IS NULL
       AND p_requested_module_id IS NULL THEN
        RAISE EXCEPTION 'At least one requested target artifact is required'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_subject_principal_id IS NOT NULL
       AND NOT EXISTS (
        SELECT 1
          FROM master.principal p
         WHERE p.tenant_id = v_tenant_id
           AND p.id = p_subject_principal_id
           AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Subject principal is not valid for this tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.canonical_party cp
         WHERE cp.authority_tenant_id = v_tenant_id
           AND cp.id = p_canonical_party_id
    ) THEN
        RAISE EXCEPTION 'Canonical party not found for current tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid priority value'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO onboarding.onboarding_case (
        tenant_id,
        case_code,
        canonical_party_id,
        requested_plan_id,
        requested_workspace_id,
        requested_module_id,
        requested_flow_id,
        source_onboarding_mode,
        requested_by_principal_id,
        subject_principal_id,
        activation_criticality,
        request_metadata,
        request_payload,
        priority,
        status,
        decision_status,
        created_by,
        updated_by
    )
    VALUES (
        v_tenant_id,
        v_normalized_code,
        p_canonical_party_id,
        p_requested_plan_id,
        p_requested_workspace_id,
        p_requested_module_id,
        NULL,
        p_source_onboarding_mode,
        v_request_by,
        p_subject_principal_id,
        p_activation_criticality,
        COALESCE(p_request_metadata, '{}'::jsonb),
        COALESCE(p_request_payload, '{}'::jsonb),
        p_priority,
        'draft',
        'pending',
        v_actor,
        v_actor
    )
    RETURNING id INTO case_id;

    INSERT INTO onboarding.onboarding_case_target (
        tenant_id,
        onboarding_case_id,
        target_plane,
        target_tenant_id,
        requested_projection_id,
        requested_plan_id,
        requested_workspace_id,
        requested_module_id,
        requested_scope_target_id,
        criticality,
        status,
        created_by,
        updated_by
    )
    VALUES (
        v_tenant_id,
        case_id,
        p_target_plane,
        p_target_tenant_id,
        p_requested_projection_id,
        p_requested_plan_id,
        p_requested_workspace_id,
        p_requested_module_id,
        p_requested_scope_target_id,
        p_activation_criticality,
        'draft',
        v_actor,
        v_actor
    )
    RETURNING id INTO target_id;

    INSERT INTO onboarding.onboarding_case_revision (
        tenant_id,
        onboarding_case_id,
        revision_no,
        from_status,
        to_status,
        changed_by,
        change_reason,
        change_context
    )
    VALUES (
        v_tenant_id,
        case_id,
        1,
        NULL,
        'draft',
        v_actor,
        'Created via fn_create_case_with_target',
        jsonb_build_object(
            'mode', p_source_onboarding_mode,
            'target_plane', p_target_plane,
            'target_tenant_id', p_target_tenant_id
        )
    )
    RETURNING revision_no INTO revision_no;

    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION onboarding.fn_advance_case_status(
    p_case_id uuid,
    p_next_status onboarding.case_status_d,
    p_change_reason text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL
)
RETURNS onboarding.case_status_d
LANGUAGE plpgsql
SET search_path = pg_catalog, onboarding, master, shared
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_actor uuid := COALESCE(p_actor_id, master.current_principal_id_soft());
    v_case onboarding.onboarding_case%ROWTYPE;
    v_revision integer;
    v_prev_status onboarding.case_status_d;
BEGIN
    IF v_tenant_id IS NULL OR v_actor IS NULL THEN
        RAISE EXCEPTION 'Current tenant/principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT *
      INTO v_case
      FROM onboarding.onboarding_case
     WHERE tenant_id = v_tenant_id
       AND id = p_case_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding case % does not exist in tenant %', p_case_id, v_tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF p_next_status = v_case.status THEN
        RETURN v_case.status;
    END IF;

    IF p_next_status IN ('approved', 'rejected', 'active', 'cancelled', 'offboarded')
       AND v_case.status IN ('draft', 'cancelled', 'offboarded') THEN
        RAISE EXCEPTION 'Invalid transition from % to %', v_case.status, p_next_status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    v_prev_status := v_case.status;

    UPDATE onboarding.onboarding_case
       SET status = p_next_status,
           status_changed_at = now(),
           status_changed_by = v_actor,
           updated_at = now(),
           updated_by = v_actor,
           decision_at = CASE WHEN p_next_status IN ('approved', 'rejected') THEN now() ELSE decision_at END,
           decision_reason = CASE WHEN p_next_status IN ('approved', 'rejected')
                                 THEN COALESCE(nullif(btrim(p_change_reason), ''), decision_reason)
                                 ELSE decision_reason END,
           activated_at = CASE WHEN p_next_status = 'active' THEN now() ELSE activated_at END,
           offboarded_at = CASE WHEN p_next_status = 'offboarded' THEN now() ELSE offboarded_at END
     WHERE tenant_id = v_tenant_id
       AND id = p_case_id;

    SELECT COALESCE(MAX(revision_no), 0) + 1
      INTO v_revision
      FROM onboarding.onboarding_case_revision
     WHERE tenant_id = v_tenant_id
       AND onboarding_case_id = p_case_id;

    INSERT INTO onboarding.onboarding_case_revision (
        tenant_id,
        onboarding_case_id,
        revision_no,
        from_status,
        to_status,
        changed_by,
        change_reason,
        change_context
    )
    VALUES (
        v_tenant_id,
        p_case_id,
        v_revision,
        v_prev_status,
        p_next_status,
        v_actor,
        nullif(btrim(p_change_reason), ''),
        jsonb_build_object(
            'mode', 'manual_transition'
        )
    );

    RETURN p_next_status;
END;
$$;

COMMENT ON FUNCTION onboarding.fn_create_case_with_target(text, uuid, shared.application_plane_d, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, uuid, onboarding.entry_mode_d, text, onboarding.activation_criticality_d) IS
    'Creates an onboarding_case and one onboarding_case_target row atomically, then writes revision 1.';

COMMENT ON FUNCTION onboarding.fn_advance_case_status(uuid, onboarding.case_status_d, text, uuid) IS
    'Transitions onboarding case status with audit-safe revision capture.';

CREATE OR REPLACE FUNCTION onboarding.fn_access_token_raw()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, onboarding, shared
AS $$
    SELECT nullif(current_setting('app.current_onboarding_access_token', true), '');
$$;

CREATE OR REPLACE FUNCTION onboarding.fn_guest_case_has_access(
    p_tenant_id uuid,
    p_onboarding_case_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, onboarding
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM onboarding.onboarding_case_guest_access ga
         WHERE ga.tenant_id = $1
           AND ga.onboarding_case_id = $2
           AND ga.revoked_at IS NULL
           AND ga.expires_at > now()
           AND ga.token_hash = encode(public.digest(coalesce(fn_access_token_raw(), ''), 'sha256'), 'hex')
    );
$$;

CREATE OR REPLACE FUNCTION onboarding.fn_can_read_onboarding_case(
    p_tenant_id uuid,
    p_onboarding_case_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, onboarding, shared
AS $$
    SELECT
        (p_tenant_id = shared.current_tenant_id_soft())
        OR onboarding.fn_guest_case_has_access(p_tenant_id, p_onboarding_case_id);
$$;

COMMENT ON FUNCTION onboarding.fn_access_token_raw() IS
    'Reads the session onboarding access token from app.current_onboarding_access_token (app-side short-lived token).';

COMMENT ON FUNCTION onboarding.fn_guest_case_has_access(uuid, uuid) IS
    'Checks token-scoped, tenant+case scoped read access for guest/self-service onboarding flows.';

COMMENT ON FUNCTION onboarding.fn_can_read_onboarding_case(uuid, uuid) IS
    'Combines tenant-context and guest token authorization for onboarding case-scoped reads.';

CREATE OR REPLACE FUNCTION onboarding.fn_bind_onboarding_guest_context(
    p_tenant_id uuid,
    p_onboarding_case_id uuid,
    p_access_token text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, onboarding, shared
AS $$
DECLARE
    v_token text := nullif(trim(p_access_token), '');
BEGIN
    IF p_tenant_id IS NULL OR p_onboarding_case_id IS NULL OR v_token IS NULL THEN
        RAISE EXCEPTION 'tenant_id, onboarding_case_id, and access token are required'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    PERFORM set_config('app.current_onboarding_access_token', v_token, true);

    IF NOT onboarding.fn_can_read_onboarding_case(p_tenant_id, p_onboarding_case_id) THEN
        RAISE EXCEPTION 'Onboarding guest token is not valid for the requested case'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION onboarding.fn_clear_onboarding_guest_context()
RETURNS void
LANGUAGE sql
AS $$
    SELECT
        set_config('app.current_onboarding_access_token', '', true);
$$;

COMMENT ON FUNCTION onboarding.fn_bind_onboarding_guest_context(uuid, uuid, text) IS
    'Validates token access for a specific onboarding case and binds request-scoped GUCs for guest-safe reads.';
COMMENT ON FUNCTION onboarding.fn_clear_onboarding_guest_context() IS
    'Clears guest onboarding access token from the current session context.';
