CREATE OR REPLACE FUNCTION mesh.resolve_account_permission_entitlement(
    p_account_id uuid,
    p_permission_id uuid,
    p_at timestamptz DEFAULT now()
)
RETURNS TABLE (
    available boolean,
    evidence_id text,
    reason_code text,
    next_authority_change_at timestamptz,
    evidence jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_product_code text;
    v_capability_code text;
    v_permission_found boolean := false;
    v_base_available boolean := false;
    v_allow_override boolean := false;
    v_deny_override boolean := false;
    v_next timestamptz;
BEGIN
    SELECT permission.product_code, permission.capability_code, true
      INTO v_product_code, v_capability_code, v_permission_found
      FROM mesh_control.auth_permission permission
      JOIN mesh_control.auth_permission_plane permission_plane
        ON permission_plane.permission_id = permission.id
       AND permission_plane.plane_code = 'mesh'
       AND permission_plane.status = 'active'
       AND permission_plane.effective_from <= p_at
       AND (
           permission_plane.effective_until IS NULL
           OR permission_plane.effective_until > p_at
       )
     WHERE permission.id = p_permission_id
       AND permission.status = 'published'
       AND permission.effective_from <= p_at
       AND (
           permission.effective_until IS NULL
           OR permission.effective_until > p_at
       )
       AND (
           permission.account_id IS NULL
           OR permission.account_id = p_account_id
       );

    IF NOT v_permission_found OR v_product_code IS NULL THEN
        RETURN QUERY SELECT
            false,
            concat('mesh:', p_account_id::text, ':', p_permission_id::text),
            'permission_or_product_binding_unavailable',
            NULL::timestamptz,
            jsonb_build_object(
                'product_code', v_product_code,
                'capability_code', v_capability_code
            );
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM mesh.network_account account
        JOIN mesh.account_entitlement entitlement
          ON entitlement.account_id = account.id
         AND entitlement.plane_code = 'mesh'
         AND entitlement.product_code = v_product_code
         AND (
             entitlement.capability_code IS NULL
             OR entitlement.capability_code = v_capability_code
         )
         AND entitlement.status = 'active'
         AND entitlement.effective_from <= p_at
         AND (
             entitlement.effective_until IS NULL
             OR entitlement.effective_until > p_at
         )
        WHERE account.id = p_account_id
          AND account.status = 'active'
    ) INTO v_base_available;

    SELECT EXISTS (
        SELECT 1
        FROM mesh.account_entitlement_override authority_override
        WHERE authority_override.account_id = p_account_id
          AND authority_override.plane_code = 'mesh'
          AND authority_override.decision = 'deny'
          AND authority_override.status = 'active'
          AND authority_override.effective_from <= p_at
          AND (
              authority_override.effective_until IS NULL
              OR authority_override.effective_until > p_at
          )
          AND authority_override.product_code = v_product_code
          AND (
              authority_override.capability_code IS NULL
              OR authority_override.capability_code = v_capability_code
          )
    ) INTO v_deny_override;

    SELECT EXISTS (
        SELECT 1
        FROM mesh.account_entitlement_override authority_override
        JOIN mesh_control.auth_entitlement_policy policy
          ON policy.product_code = authority_override.product_code
         AND (
             policy.capability_code IS NULL
             OR policy.capability_code = authority_override.capability_code
         )
         AND policy.allow_override
         AND policy.status = 'active'
         AND policy.effective_from <= p_at
         AND (
             policy.effective_until IS NULL
             OR policy.effective_until > p_at
         )
        WHERE authority_override.account_id = p_account_id
          AND authority_override.plane_code = 'mesh'
          AND authority_override.product_code = v_product_code
          AND (
              authority_override.capability_code IS NULL
              OR authority_override.capability_code = v_capability_code
          )
          AND authority_override.decision = 'allow'
          AND authority_override.status = 'active'
          AND authority_override.effective_from <= p_at
          AND (
              authority_override.effective_until IS NULL
              OR authority_override.effective_until > p_at
          )
    ) INTO v_allow_override;

    SELECT min(change_at)
      INTO v_next
      FROM (
          SELECT entitlement.effective_until AS change_at
          FROM mesh.account_entitlement entitlement
          WHERE entitlement.account_id = p_account_id
            AND entitlement.product_code = v_product_code
          UNION ALL
          SELECT authority_override.effective_until
          FROM mesh.account_entitlement_override authority_override
          WHERE authority_override.account_id = p_account_id
            AND authority_override.product_code = v_product_code
      ) changes
     WHERE change_at > p_at;

    available := NOT v_deny_override
        AND (v_base_available OR v_allow_override);
    evidence_id := concat(
        'mesh:', p_account_id::text, ':', p_permission_id::text
    );
    reason_code := CASE
        WHEN v_deny_override THEN 'entitlement_deny_override'
        WHEN NOT (v_base_available OR v_allow_override)
            THEN 'account_product_unavailable'
        ELSE 'available'
    END;
    next_authority_change_at := v_next;
    evidence := jsonb_build_object(
        'product_code', v_product_code,
        'capability_code', v_capability_code,
        'base_available', v_base_available,
        'allow_override', v_allow_override,
        'deny_override', v_deny_override
    );
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION
    mesh.resolve_account_permission_entitlement(uuid, uuid, timestamptz)
    FROM PUBLIC;
