-- Compatibility prelude for incremental runs where shared DDL is skipped or
-- its original migration key is already recorded. SQL-language functions are
-- parsed at creation time, so the policy relation must already exist here.
CREATE TABLE IF NOT EXISTS shared.permission_scope_policy (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    permission_id           uuid        NOT NULL,
    assignment_scope_type   text        NOT NULL,
    organization_domain     text,
    propagation_mode        text        NOT NULL DEFAULT 'none',
    requires_resource_scope boolean     NOT NULL DEFAULT false,
    status                  text        NOT NULL DEFAULT 'active',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT permission_scope_policy_pkey PRIMARY KEY (id),
    CONSTRAINT permission_scope_policy_uq UNIQUE NULLS NOT DISTINCT
        (permission_id, assignment_scope_type, organization_domain),
    CONSTRAINT permission_scope_policy_scope_chk CHECK (
        assignment_scope_type IN (
            'tenant', 'legal_entity', 'company_code',
            'operating_organization', 'network_membership'
        )
    ),
    CONSTRAINT permission_scope_policy_domain_chk CHECK (
        (assignment_scope_type = 'operating_organization'
            AND organization_domain IN ('procurement', 'sales'))
        OR
        (assignment_scope_type <> 'operating_organization'
            AND organization_domain IS NULL)
    ),
    CONSTRAINT permission_scope_policy_propagation_chk CHECK (
        propagation_mode IN ('none', 'member_companies', 'resource_only')
    ),
    CONSTRAINT permission_scope_policy_resource_chk CHECK (
        propagation_mode <> 'resource_only' OR requires_resource_scope = true
    ),
    CONSTRAINT permission_scope_policy_status_chk CHECK (
        status IN ('active', 'inactive', 'deprecated')
    )
);

DO $$ BEGIN
    ALTER TABLE shared.permission_scope_policy
        ADD CONSTRAINT permission_scope_policy_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS permission_scope_policy_permission_pidx
    ON shared.permission_scope_policy (permission_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS permission_scope_policy_lookup_pidx
    ON shared.permission_scope_policy (
        assignment_scope_type, organization_domain, permission_id
    )
    WHERE status = 'active';

ALTER TABLE shared.permission_scope_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.permission_scope_policy FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read ON shared.permission_scope_policy;
CREATE POLICY open_read ON shared.permission_scope_policy
    FOR SELECT USING (true);

DROP POLICY IF EXISTS seed_write ON shared.permission_scope_policy;
CREATE POLICY seed_write ON shared.permission_scope_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

COMMENT ON TABLE shared.permission_scope_policy IS
    'Authoritative permission-to-assignment-scope policy. Operating Organization domain is explicit and must never be inferred from a permission-code prefix.';

-- ============================================================================
-- Permission-specific effective authorization scope
-- ============================================================================

CREATE OR REPLACE FUNCTION master.resolve_allowed_companies(
    p_tenant_id uuid,
    p_principal_id uuid,
    p_permission_id uuid
) RETURNS TABLE (company_code_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
WITH active_group_roles AS (
    SELECT DISTINCT gr.id, gr.group_id, gr.role_id,
           gr.assignment_scope_type AS scope_type,
           gr.assignment_scope_ref_id AS scope_ref_id,
           gr.include_descendants
    FROM master.auth_group_member gm
    JOIN master.auth_group_role gr
      ON gr.group_id = gm.group_id
     AND gr.tenant_id = gm.tenant_id
     AND gr.status = 'active'
     AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp
      ON pp.persona_id = r.persona_id
     AND pp.permission_id = p_permission_id
     AND pp.is_granted = true
    WHERE gm.tenant_id = p_tenant_id
      AND gm.principal_id = p_principal_id
),
role_sources AS (
    SELECT agr.scope_type, agr.scope_ref_id, agr.include_descendants,
           psp.propagation_mode
    FROM active_group_roles agr
    LEFT JOIN master.operating_organization oo
      ON agr.scope_type = 'operating_organization'
     AND oo.id = agr.scope_ref_id
     AND oo.tenant_id = p_tenant_id
     AND oo.status <> 'archived'
    JOIN shared.permission_scope_policy psp
      ON psp.permission_id = p_permission_id
     AND psp.assignment_scope_type = agr.scope_type
     AND psp.status = 'active'
     AND (agr.scope_type <> 'operating_organization' OR psp.organization_domain = oo.domain)
),
grant_sources AS (
    SELECT ag.assignment_scope_type AS scope_type,
           ag.assignment_scope_ref_id AS scope_ref_id,
           true AS include_descendants,
           psp.propagation_mode
    FROM master.access_grant ag
    LEFT JOIN master.operating_organization oo
      ON ag.assignment_scope_type = 'operating_organization'
     AND oo.id = ag.assignment_scope_ref_id
     AND oo.tenant_id = p_tenant_id
     AND oo.status <> 'archived'
    JOIN shared.permission_scope_policy psp
      ON psp.permission_id = p_permission_id
     AND psp.assignment_scope_type = ag.assignment_scope_type
     AND psp.status = 'active'
     AND (ag.assignment_scope_type <> 'operating_organization' OR psp.organization_domain = oo.domain)
    WHERE ag.tenant_id = p_tenant_id
      AND ag.permission_id = p_permission_id
      AND ag.effect = 'allow'
      AND ag.status = 'active'
      AND ag.resource_type IS NULL
      AND ag.resource_id IS NULL
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND (
          ag.principal_id = p_principal_id
          OR ag.group_id IN (SELECT group_id FROM active_group_roles)
          OR ag.role_id IN (SELECT role_id FROM active_group_roles)
      )
),
sources AS (
    SELECT * FROM role_sources
    UNION ALL
    SELECT * FROM grant_sources
),
allowed_companies AS (
    SELECT cc.id
    FROM sources s
    JOIN master.company_code cc
      ON s.scope_type = 'tenant'
     AND cc.tenant_id = p_tenant_id
     AND cc.is_active = true

    UNION
    SELECT cc.id
    FROM sources s
    JOIN master.company_code cc
      ON s.scope_type = 'company_code'
     AND cc.id = s.scope_ref_id
     AND cc.tenant_id = p_tenant_id
     AND cc.is_active = true

    UNION
    SELECT cc.id
    FROM sources s
    JOIN master.company_code cc
      ON s.scope_type = 'legal_entity'
     AND s.include_descendants = false
     AND cc.legal_entity_id = s.scope_ref_id
     AND cc.tenant_id = p_tenant_id
     AND cc.is_active = true
    WHERE s.propagation_mode = 'member_companies'

    UNION
    SELECT sub.company_code_id
    FROM sources s
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(p_tenant_id, s.scope_ref_id) sub
    WHERE s.scope_type = 'legal_entity'
      AND s.include_descendants = true
      AND s.propagation_mode = 'member_companies'

    UNION
    SELECT org_cc.company_code_id
    FROM sources s
    CROSS JOIN LATERAL master.resolve_operating_organization_companies(
        p_tenant_id, s.scope_ref_id, current_date
    ) org_cc
    WHERE s.scope_type = 'operating_organization'
      AND s.propagation_mode = 'member_companies'
),
active_denies AS (
    SELECT ag.assignment_scope_type AS scope_type,
           ag.assignment_scope_ref_id AS scope_ref_id
    FROM master.access_grant ag
    LEFT JOIN master.operating_organization oo
      ON ag.assignment_scope_type = 'operating_organization'
     AND oo.id = ag.assignment_scope_ref_id
     AND oo.tenant_id = p_tenant_id
    JOIN shared.permission_scope_policy psp
      ON psp.permission_id = p_permission_id
     AND psp.assignment_scope_type = ag.assignment_scope_type
     AND psp.status = 'active'
     AND (ag.assignment_scope_type <> 'operating_organization' OR psp.organization_domain = oo.domain)
    WHERE ag.tenant_id = p_tenant_id
      AND ag.principal_id = p_principal_id
      AND ag.permission_id = p_permission_id
      AND ag.effect = 'deny'
      AND ag.status = 'active'
      AND ag.resource_type IS NULL
      AND ag.resource_id IS NULL
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
),
denied_companies AS (
    SELECT cc.id
    FROM active_denies d
    JOIN master.company_code cc
      ON d.scope_type = 'tenant'
     AND cc.tenant_id = p_tenant_id
     AND cc.is_active = true

    UNION
    SELECT cc.id
    FROM active_denies d
    JOIN master.company_code cc
      ON d.scope_type = 'company_code'
     AND cc.id = d.scope_ref_id
     AND cc.tenant_id = p_tenant_id
     AND cc.is_active = true

    UNION
    SELECT sub.company_code_id
    FROM active_denies d
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(p_tenant_id, d.scope_ref_id) sub
    WHERE d.scope_type = 'legal_entity'

    UNION
    SELECT org_cc.company_code_id
    FROM active_denies d
    CROSS JOIN LATERAL master.resolve_operating_organization_companies(
        p_tenant_id, d.scope_ref_id, current_date
    ) org_cc
    WHERE d.scope_type = 'operating_organization'
)
SELECT id FROM allowed_companies
EXCEPT
SELECT id FROM denied_companies;
$$;

COMMENT ON FUNCTION master.resolve_allowed_companies IS
    'Permission-specific company scope: policy-gated assignments intersected with active membership, minus applicable scoped denies. No persona-to-all-companies expansion.';


CREATE OR REPLACE FUNCTION master.resolve_effective_authorization_scope(
    p_tenant_id uuid,
    p_principal_id uuid,
    p_permission_id uuid
) RETURNS TABLE (
    tenant_wide boolean,
    legal_entity_ids uuid[],
    company_code_ids uuid[],
    operating_organization_ids uuid[],
    network_membership_ids uuid[],
    visibility_scope text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
WITH active_group_roles AS (
    SELECT DISTINCT gr.group_id, gr.role_id,
           gr.assignment_scope_type AS scope_type,
           gr.assignment_scope_ref_id AS scope_ref_id
    FROM master.auth_group_member gm
    JOIN master.auth_group_role gr
      ON gr.group_id = gm.group_id
     AND gr.tenant_id = gm.tenant_id
     AND gr.status = 'active'
     AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp
      ON pp.persona_id = r.persona_id
     AND pp.permission_id = p_permission_id
     AND pp.is_granted = true
    WHERE gm.tenant_id = p_tenant_id
      AND gm.principal_id = p_principal_id
),
sources AS (
    SELECT agr.scope_type, agr.scope_ref_id
    FROM active_group_roles agr
    LEFT JOIN master.operating_organization oo
      ON agr.scope_type = 'operating_organization'
     AND oo.id = agr.scope_ref_id
     AND oo.tenant_id = p_tenant_id
     AND oo.status <> 'archived'
    JOIN shared.permission_scope_policy psp
      ON psp.permission_id = p_permission_id
     AND psp.assignment_scope_type = agr.scope_type
     AND psp.status = 'active'
     AND (agr.scope_type <> 'operating_organization' OR psp.organization_domain = oo.domain)

    UNION

    SELECT ag.assignment_scope_type, ag.assignment_scope_ref_id
    FROM master.access_grant ag
    LEFT JOIN master.operating_organization oo
      ON ag.assignment_scope_type = 'operating_organization'
     AND oo.id = ag.assignment_scope_ref_id
     AND oo.tenant_id = p_tenant_id
     AND oo.status <> 'archived'
    JOIN shared.permission_scope_policy psp
      ON psp.permission_id = p_permission_id
     AND psp.assignment_scope_type = ag.assignment_scope_type
     AND psp.status = 'active'
     AND (ag.assignment_scope_type <> 'operating_organization' OR psp.organization_domain = oo.domain)
    WHERE ag.tenant_id = p_tenant_id
      AND ag.permission_id = p_permission_id
      AND ag.effect = 'allow'
      AND ag.status = 'active'
      AND ag.resource_type IS NULL
      AND ag.resource_id IS NULL
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND (
          ag.principal_id = p_principal_id
          OR ag.group_id IN (SELECT group_id FROM active_group_roles)
          OR ag.role_id IN (SELECT role_id FROM active_group_roles)
      )
),
denies AS (
    SELECT ag.assignment_scope_type AS scope_type,
           ag.assignment_scope_ref_id AS scope_ref_id
    FROM master.access_grant ag
    WHERE ag.tenant_id = p_tenant_id
      AND ag.principal_id = p_principal_id
      AND ag.permission_id = p_permission_id
      AND ag.effect = 'deny'
      AND ag.status = 'active'
      AND ag.resource_type IS NULL
      AND ag.resource_id IS NULL
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
),
effective_sources AS (
    SELECT s.*
    FROM sources s
    WHERE NOT EXISTS (SELECT 1 FROM denies d WHERE d.scope_type = 'tenant')
      AND NOT EXISTS (
          SELECT 1 FROM denies d
          WHERE d.scope_type = s.scope_type
            AND d.scope_ref_id = s.scope_ref_id
      )
)
SELECT
    EXISTS (SELECT 1 FROM effective_sources WHERE scope_type = 'tenant'),
    ARRAY(SELECT DISTINCT scope_ref_id FROM effective_sources WHERE scope_type = 'legal_entity' ORDER BY scope_ref_id),
    ARRAY(SELECT company_code_id FROM master.resolve_allowed_companies(p_tenant_id, p_principal_id, p_permission_id) ORDER BY company_code_id),
    ARRAY(SELECT DISTINCT scope_ref_id FROM effective_sources WHERE scope_type = 'operating_organization' ORDER BY scope_ref_id),
    ARRAY(SELECT DISTINCT scope_ref_id FROM effective_sources WHERE scope_type = 'network_membership' ORDER BY scope_ref_id),
    master.get_effective_visibility_scope(p_tenant_id, p_principal_id, p_permission_id);
$$;

COMMENT ON FUNCTION master.resolve_effective_authorization_scope IS
    'Returns the permission-specific assignment boundary after policy validation and scoped-deny subtraction.';
