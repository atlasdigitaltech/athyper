-- ============================================================================
-- master/01q_tables_plane_access.sql
-- Concept: Admin plane tenant grants.
-- Depends on: master.tenant, master.principal
-- ============================================================================

-- Tenant-level authority for the Admin product plane.
-- Admin is intentionally tenant-scoped: an Owner/Admin can operate across all
-- legal entities inside the tenant unless future delegated-admin rows narrow it.
CREATE TABLE IF NOT EXISTS master.tenant_admin_grant (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    principal_id        uuid        NOT NULL,
    persona_key         text        NOT NULL,
    all_legal_entities  boolean     NOT NULL DEFAULT true,

    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    effective_from      timestamptz NOT NULL DEFAULT now(),
    effective_until     timestamptz,

    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tag_pkey                    PRIMARY KEY (id),
    CONSTRAINT tag_tenant_principal_persona_uq UNIQUE (tenant_id, principal_id, persona_key),
    CONSTRAINT tag_persona_key_chk         CHECK (persona_key IN ('owner', 'admin')),
    CONSTRAINT tag_status_chk              CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    CONSTRAINT tag_effective_range_chk     CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT tag_metadata_obj_chk        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT tag_audit_pair_chk          CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.tenant_admin_grant IS
    'ARCHETYPE=C;SCOPE=T. Tenant-level Admin plane grant. '
    'Admin application access is tenant-scoped, not company-code scoped.';
COMMENT ON COLUMN master.tenant_admin_grant.persona_key IS
    'Admin plane persona: owner or admin.';
COMMENT ON COLUMN master.tenant_admin_grant.all_legal_entities IS
    'True means the grant covers all legal entities in the tenant.';
