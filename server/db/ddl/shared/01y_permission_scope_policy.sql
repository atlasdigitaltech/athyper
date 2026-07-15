-- Additive migration for existing databases. The canonical definition also
-- remains in 01_tables.sql for clean full resets.

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
