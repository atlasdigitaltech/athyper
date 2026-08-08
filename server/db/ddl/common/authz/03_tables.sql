-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
-- Unified plane-local authorization authority.
-- Keycloak authenticates; master.principal identifies actors; authz grants.

CREATE TABLE authz.permission (
    id                    uuid                      NOT NULL DEFAULT shared.uuidv7(),
    canonical_code        text                      NOT NULL,
    permission_kind       authz.permission_kind_d   NOT NULL,
    module_id             uuid                      NOT NULL,
    risk_tier             authz.risk_tier_d          NOT NULL DEFAULT 'low',
    requires_mfa          boolean                   NOT NULL DEFAULT false,
    requires_sod          boolean                   NOT NULL DEFAULT false,
    is_shareable          boolean                   NOT NULL DEFAULT false,
    is_delegable          boolean                   NOT NULL DEFAULT false,
    is_overridable        boolean                   NOT NULL DEFAULT false,
    metadata              jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status                authz.catalog_status_d     NOT NULL DEFAULT 'draft',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz               NOT NULL DEFAULT now(),
    created_by            uuid                      NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT permission_pkey PRIMARY KEY (id),
    CONSTRAINT permission_code_uq UNIQUE (canonical_code),
    CONSTRAINT permission_code_fmt_chk
        CHECK (canonical_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'),
    CONSTRAINT permission_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT permission_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT permission_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.permission IS
  'Plane-local seed-owned exact permission catalog. Tenant-defined permission creation is prohibited.';

CREATE TABLE authz.plane_membership (
    id                  uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                       NOT NULL,
    principal_id        uuid                       NOT NULL,
    membership_kind     authz.membership_kind_d    NOT NULL DEFAULT 'standard',
    source_type         authz.source_type_d         NOT NULL DEFAULT 'manual',
    source_ref          text,
    metadata            jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    status              authz.membership_status_d   NOT NULL DEFAULT 'pending',
    effective_from      timestamptz                NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                NOT NULL DEFAULT now(),
    created_by          uuid                       NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT plane_membership_pkey PRIMARY KEY (id),
    CONSTRAINT plane_membership_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT plane_membership_principal_id_uq
        UNIQUE (tenant_id, principal_id, id),
    CONSTRAINT plane_membership_source_ref_chk
        CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT plane_membership_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT plane_membership_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT plane_membership_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT plane_membership_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.plane_membership IS
  'Explicit admission to the current physical plane. Membership is a gate and never grants a permission.';

CREATE TABLE authz.scope_target (
    id                      uuid                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid                 NOT NULL,
    scope_kind              authz.scope_kind_d   NOT NULL,
    scope_key               text                 NOT NULL,
    target_id               uuid                 NOT NULL,
    parent_scope_target_id  uuid,
    display_name            text                 NOT NULL,
    metadata                jsonb                NOT NULL DEFAULT '{}'::jsonb,
    status                  authz.scope_status_d  NOT NULL DEFAULT 'active',
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz          NOT NULL DEFAULT now(),
    created_by              uuid                 NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT scope_target_pkey PRIMARY KEY (id),
    CONSTRAINT scope_target_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT scope_target_key_uq UNIQUE (tenant_id, scope_kind, scope_key),
    CONSTRAINT scope_target_resource_uq UNIQUE (tenant_id, scope_kind, target_id),
    CONSTRAINT scope_target_key_fmt_chk
        CHECK (scope_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:@/-]{0,255}$'),
    CONSTRAINT scope_target_display_name_chk
        CHECK (btrim(display_name) <> '' AND length(display_name) <= 256),
    CONSTRAINT scope_target_root_chk
        CHECK (
            (scope_kind = 'tenant'
                AND target_id = tenant_id
                AND parent_scope_target_id IS NULL)
            OR (
                scope_kind <> 'tenant'
                AND parent_scope_target_id IS NOT NULL
            )
        ),
    CONSTRAINT scope_target_not_self_parent_chk
        CHECK (parent_scope_target_id IS NULL OR parent_scope_target_id <> id),
    CONSTRAINT scope_target_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT scope_target_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT scope_target_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.scope_target IS
  'Stable hierarchical authorization target. target_id is a plane-owned opaque UUID retained for authorization history.';

CREATE TABLE authz.role (
    id                  uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                       NOT NULL,
    code                text                       NOT NULL,
    name                text                       NOT NULL,
    description         text,
    role_kind           authz.role_kind_d           NOT NULL DEFAULT 'custom',
    source_type         authz.source_type_d         NOT NULL DEFAULT 'manual',
    source_ref          text,
    metadata            jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    status              authz.definition_status_d  NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                NOT NULL DEFAULT now(),
    created_by          uuid                       NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT role_pkey PRIMARY KEY (id),
    CONSTRAINT role_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT role_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT role_code_fmt_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT role_name_chk CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT role_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT role_source_consistency_chk
        CHECK (
            (
                role_kind IN ('system', 'managed')
                AND source_type = 'seed'
                AND source_ref IS NOT NULL
            )
            OR (
                role_kind = 'custom'
                AND source_type IN ('manual', 'api', 'import')
            )
        ),
    CONSTRAINT role_source_ref_chk
        CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT role_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT role_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT role_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE authz.role_permission (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    role_id             uuid        NOT NULL,
    permission_id       uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT role_permission_pkey PRIMARY KEY (id),
    CONSTRAINT role_permission_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT role_permission_uq UNIQUE (tenant_id, role_id, permission_id),
    CONSTRAINT role_permission_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.role_permission IS
  'Permission child of a role definition. Rows may change only while the parent role is draft or suspended.';

CREATE TABLE authz.principal_group (
    id                  uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                      NOT NULL,
    code                text                      NOT NULL,
    name                text                      NOT NULL,
    description         text,
    group_kind          authz.group_kind_d         NOT NULL DEFAULT 'custom',
    source_type         authz.source_type_d        NOT NULL DEFAULT 'manual',
    source_ref          text,
    metadata            jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status              authz.scope_status_d       NOT NULL DEFAULT 'active',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz               NOT NULL DEFAULT now(),
    created_by          uuid                      NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT principal_group_pkey PRIMARY KEY (id),
    CONSTRAINT principal_group_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT principal_group_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT principal_group_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT principal_group_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT principal_group_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT principal_group_source_consistency_chk
        CHECK (
            (
                group_kind = 'iam_managed'
                AND source_type = 'iam_sync'
                AND source_ref IS NOT NULL
            )
            OR (
                group_kind = 'system'
                AND source_type = 'seed'
                AND source_ref IS NOT NULL
            )
            OR (
                group_kind = 'custom'
                AND source_type IN ('manual', 'api', 'import')
            )
        ),
    CONSTRAINT principal_group_source_ref_chk
        CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT principal_group_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT principal_group_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT principal_group_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.principal_group IS
  'Plane-local authorization group. IAM-managed groups are synchronized inputs whose local rows remain authoritative.';

CREATE TABLE authz.group_member (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    group_id            uuid                     NOT NULL,
    principal_id        uuid                     NOT NULL,
    source_type         authz.source_type_d       NOT NULL DEFAULT 'manual',
    source_ref          text,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              authz.authority_status_d  NOT NULL DEFAULT 'active',
    effective_from      timestamptz              NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT group_member_pkey PRIMARY KEY (id),
    CONSTRAINT group_member_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT group_member_source_ref_chk
        CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT group_member_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT group_member_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT group_member_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT group_member_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE authz.group_role (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    group_id            uuid                     NOT NULL,
    role_id             uuid                     NOT NULL,
    scope_target_id     uuid                     NOT NULL,
    propagation_mode    authz.propagation_mode_d NOT NULL DEFAULT 'exact',
    source_type         authz.source_type_d       NOT NULL DEFAULT 'manual',
    source_ref          text,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              authz.authority_status_d  NOT NULL DEFAULT 'active',
    effective_from      timestamptz              NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT group_role_pkey PRIMARY KEY (id),
    CONSTRAINT group_role_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT group_role_source_type_chk
        CHECK (source_type IN ('seed', 'manual', 'api', 'import')),
    CONSTRAINT group_role_source_ref_chk
        CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT group_role_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT group_role_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT group_role_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT group_role_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE authz.deny_rule (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    permission_id       uuid                     NOT NULL,
    scope_target_id     uuid                     NOT NULL,
    subject_kind        authz.subject_kind_d      NOT NULL,
    principal_id        uuid,
    group_id            uuid,
    reason              text                     NOT NULL,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              authz.authority_status_d  NOT NULL DEFAULT 'active',
    effective_from      timestamptz              NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT deny_rule_pkey PRIMARY KEY (id),
    CONSTRAINT deny_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT deny_rule_subject_chk
        CHECK (
            (subject_kind = 'tenant' AND principal_id IS NULL AND group_id IS NULL)
            OR (subject_kind = 'principal' AND principal_id IS NOT NULL AND group_id IS NULL)
            OR (subject_kind = 'group' AND group_id IS NOT NULL AND principal_id IS NULL)
        ),
    CONSTRAINT deny_rule_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 2048),
    CONSTRAINT deny_rule_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT deny_rule_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT deny_rule_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT deny_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.deny_rule IS
  'Explicit tenant, principal, or group deny. Every matching deny has absolute precedence over allow proofs.';

CREATE TABLE authz.delegation (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    delegator_id        uuid                     NOT NULL,
    delegate_id         uuid                     NOT NULL,
    reason              text                     NOT NULL,
    approval_ticket     text,
    approved_by         uuid,
    approved_at         timestamptz,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              authz.approval_status_d   NOT NULL DEFAULT 'pending',
    effective_from      timestamptz              NOT NULL DEFAULT now(),
    effective_until     timestamptz              NOT NULL,
    revoked_by          uuid,
    revoked_at          timestamptz,
    revocation_reason   text,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT delegation_pkey PRIMARY KEY (id),
    CONSTRAINT delegation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT delegation_distinct_principals_chk
        CHECK (delegator_id <> delegate_id),
    CONSTRAINT delegation_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 2048),
    CONSTRAINT delegation_approval_ticket_chk
        CHECK (approval_ticket IS NULL OR btrim(approval_ticket) <> ''),
    CONSTRAINT delegation_approval_chk
        CHECK (
            (status = 'pending' AND approved_by IS NULL AND approved_at IS NULL)
            OR (
                status IN ('active', 'revoked')
                AND approved_by IS NOT NULL
                AND approved_at IS NOT NULL
            )
        ),
    CONSTRAINT delegation_approver_separation_chk
        CHECK (
            approved_by IS NULL
            OR (
                approved_by <> created_by
                AND approved_by <> delegator_id
            )
        ),
    CONSTRAINT delegation_effective_range_chk
        CHECK (effective_until > effective_from),
    CONSTRAINT delegation_revocation_chk
        CHECK (
            (
                status = 'revoked'
                AND revoked_by IS NOT NULL
                AND revoked_at IS NOT NULL
                AND revocation_reason IS NOT NULL
                AND btrim(revocation_reason) <> ''
            )
            OR (
                status <> 'revoked'
                AND revoked_by IS NULL
                AND revoked_at IS NULL
                AND revocation_reason IS NULL
            )
        ),
    CONSTRAINT delegation_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT delegation_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT delegation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE authz.delegation_grant (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    delegation_id       uuid        NOT NULL,
    permission_id       uuid        NOT NULL,
    scope_target_id     uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT delegation_grant_pkey PRIMARY KEY (id),
    CONSTRAINT delegation_grant_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT delegation_grant_uq
        UNIQUE (tenant_id, delegation_id, permission_id, scope_target_id)
);

COMMENT ON TABLE authz.delegation_grant IS
  'Immutable exact permission and scope delegated under a finite parent delegation.';

CREATE TABLE authz.override (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    principal_id        uuid                     NOT NULL,
    permission_id       uuid                     NOT NULL,
    scope_target_id     uuid                     NOT NULL,
    reason              text                     NOT NULL,
    approval_ticket     text                     NOT NULL,
    approved_by         uuid,
    approved_at         timestamptz,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              authz.approval_status_d   NOT NULL DEFAULT 'pending',
    effective_from      timestamptz              NOT NULL DEFAULT now(),
    effective_until     timestamptz              NOT NULL,
    revoked_by          uuid,
    revoked_at          timestamptz,
    revocation_reason   text,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT override_pkey PRIMARY KEY (id),
    CONSTRAINT override_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT override_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 2048),
    CONSTRAINT override_approval_ticket_chk CHECK (btrim(approval_ticket) <> ''),
    CONSTRAINT override_approval_chk
        CHECK (
            (status = 'pending' AND approved_by IS NULL AND approved_at IS NULL)
            OR (status IN ('active', 'revoked') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
        ),
    CONSTRAINT override_approver_separation_chk
        CHECK (approved_by IS NULL OR approved_by <> created_by),
    CONSTRAINT override_effective_range_chk
        CHECK (effective_until > effective_from),
    CONSTRAINT override_revocation_chk
        CHECK (
            (
                status = 'revoked'
                AND revoked_by IS NOT NULL
                AND revoked_at IS NOT NULL
                AND revocation_reason IS NOT NULL
                AND btrim(revocation_reason) <> ''
            )
            OR (
                status <> 'revoked'
                AND revoked_by IS NULL
                AND revoked_at IS NULL
                AND revocation_reason IS NULL
            )
        ),
    CONSTRAINT override_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT override_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT override_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.override IS
  'Approved finite exceptional allow. It cannot bypass isolation, membership, entitlement, MFA, SoD, hard policy, or a matching deny.';

CREATE TABLE authz.record_acl (
    id                  uuid                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                 NOT NULL,
    resource_code       text                 NOT NULL,
    record_id           uuid                 NOT NULL,
    permission_id       uuid                 NOT NULL,
    subject_kind        authz.subject_kind_d  NOT NULL,
    principal_id        uuid,
    group_id            uuid,
    reason              text                 NOT NULL,
    granted_by          uuid                 NOT NULL,
    metadata            jsonb                NOT NULL DEFAULT '{}'::jsonb,
    status              authz.acl_status_d     NOT NULL DEFAULT 'active',
    effective_from      timestamptz          NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    revoked_by          uuid,
    revoked_at          timestamptz,
    revocation_reason   text,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz          NOT NULL DEFAULT now(),
    created_by          uuid                 NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT record_acl_pkey PRIMARY KEY (id),
    CONSTRAINT record_acl_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT record_acl_resource_code_fmt_chk
        CHECK (resource_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT record_acl_subject_chk
        CHECK (
            (subject_kind = 'principal' AND principal_id IS NOT NULL AND group_id IS NULL)
            OR (subject_kind = 'group' AND group_id IS NOT NULL AND principal_id IS NULL)
        ),
    CONSTRAINT record_acl_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 2048),
    CONSTRAINT record_acl_effective_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT record_acl_revocation_chk
        CHECK (
            (
                status = 'revoked'
                AND revoked_by IS NOT NULL
                AND revoked_at IS NOT NULL
                AND revocation_reason IS NOT NULL
                AND btrim(revocation_reason) <> ''
            )
            OR (
                status <> 'revoked'
                AND revoked_by IS NULL
                AND revoked_at IS NULL
                AND revocation_reason IS NULL
            )
        ),
    CONSTRAINT record_acl_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT record_acl_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT record_acl_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.record_acl IS
  'Share of one exact record through one published shareable permission. It never grants collection access.';

CREATE TABLE authz.trusted_device (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    principal_id        uuid        NOT NULL,
    device_token_hash   text        NOT NULL,
    device_name         text,
    user_agent          text,
    ip_address          inet,
    expires_at          timestamptz NOT NULL,
    last_seen_at        timestamptz,
    revoked_at          timestamptz,
    revoked_by          uuid,
    revocation_reason   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT trusted_device_pkey PRIMARY KEY (id),
    CONSTRAINT trusted_device_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT trusted_device_token_uq UNIQUE (tenant_id, device_token_hash),
    CONSTRAINT trusted_device_token_hash_chk
        CHECK (device_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT trusted_device_name_chk
        CHECK (
            device_name IS NULL
            OR (btrim(device_name) <> '' AND length(device_name) <= 160)
        ),
    CONSTRAINT trusted_device_user_agent_chk
        CHECK (user_agent IS NULL OR length(user_agent) <= 2048),
    CONSTRAINT trusted_device_expiry_chk CHECK (expires_at > created_at),
    CONSTRAINT trusted_device_last_seen_chk
        CHECK (last_seen_at IS NULL OR last_seen_at >= created_at),
    CONSTRAINT trusted_device_revocation_chk
        CHECK (
            (
                revoked_at IS NULL
                AND revoked_by IS NULL
                AND revocation_reason IS NULL
            )
            OR (
                revoked_at IS NOT NULL
                AND revoked_at >= created_at
                AND revocation_reason IS NOT NULL
                AND btrim(revocation_reason) <> ''
                AND length(revocation_reason) <= 240
            )
        ),
    CONSTRAINT trusted_device_creator_chk CHECK (created_by = principal_id)
);

COMMENT ON TABLE authz.trusted_device IS
  'Plane-local remembered-browser evidence created only after successful IAM step-up. The browser holds the opaque token; only its SHA-256 hash is stored.';
COMMENT ON COLUMN authz.trusted_device.device_token_hash IS
  'Lowercase SHA-256 digest of the opaque HttpOnly cookie. Raw token material must never be persisted.';

-- Athyper-published and reconciled authorization projections.
CREATE TABLE authz.application_projection (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,realm_key text NOT NULL,
 external_organization_id text NOT NULL,organization_alias text,organization_name text NOT NULL,
 source_projection_id uuid NOT NULL,source_version bigint NOT NULL,source_hash text NOT NULL,
 status authz.application_projection_status_d NOT NULL DEFAULT 'pending',effective_from timestamptz,effective_until timestamptz,
 reconciled_at timestamptz,reconciliation_error_code text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 status_changed_at timestamptz,status_changed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT application_projection_pkey PRIMARY KEY(id),CONSTRAINT application_projection_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT application_projection_source_version_uq UNIQUE(source_projection_id,source_version),
 CONSTRAINT application_projection_realm_chk CHECK(realm_key~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT application_projection_external_chk CHECK(btrim(external_organization_id)<>''),
 CONSTRAINT application_projection_name_chk CHECK(btrim(organization_name)<>''),
 CONSTRAINT application_projection_source_version_chk CHECK(source_version>0),
 CONSTRAINT application_projection_source_hash_chk CHECK(source_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT application_projection_range_chk CHECK(effective_until IS NULL OR (effective_from IS NOT NULL AND effective_until>effective_from)),
 CONSTRAINT application_projection_active_chk CHECK(status<>'active' OR effective_from IS NOT NULL),
 CONSTRAINT application_projection_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
 CONSTRAINT application_projection_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
 CONSTRAINT application_projection_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE authz.projection_provider (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,projection_id uuid NOT NULL,
 provider_code text NOT NULL,protocol text NOT NULL,external_provider_id text,
 source_provider_id uuid NOT NULL,source_version bigint NOT NULL,status authz.projection_provider_status_d NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT projection_provider_pkey PRIMARY KEY(id),CONSTRAINT projection_provider_coordinate_uq UNIQUE(projection_id,provider_code),
 CONSTRAINT projection_provider_code_chk CHECK(provider_code~'^[a-z][a-z0-9_.-]{1,62}$'),
 CONSTRAINT projection_provider_protocol_chk CHECK(protocol IN ('native','oidc','saml')),
 CONSTRAINT projection_provider_version_chk CHECK(source_version>0),
 CONSTRAINT projection_provider_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE authz.projection_scope (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,projection_id uuid NOT NULL,scope_target_id uuid NOT NULL,
 ceiling_mode authz.projection_ceiling_mode_d NOT NULL DEFAULT 'exact',network_role_ceiling text,
 source_scope_id uuid NOT NULL,source_version bigint NOT NULL,status shared.ref_status_d NOT NULL DEFAULT 'active',
 effective_from timestamptz NOT NULL,effective_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT projection_scope_pkey PRIMARY KEY(id),CONSTRAINT projection_scope_coordinate_uq UNIQUE(projection_id,scope_target_id),
 CONSTRAINT projection_scope_network_role_chk CHECK(network_role_ceiling IS NULL OR network_role_ceiling IN ('buyer','supplier','both')),
 CONSTRAINT projection_scope_version_chk CHECK(source_version>0),
 CONSTRAINT projection_scope_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
 CONSTRAINT projection_scope_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE authz.application_projection IS 'Plane-local reconciled TrustIAM organization projection. It limits admission ceilings but grants no membership, role, permission, or scope assignment.';
COMMENT ON COLUMN authz.application_projection.organization_alias IS 'Safe display snapshot only; never a tenant identifier or authorization key.';

CREATE TABLE authz.entity_operation_binding (
    id                          uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    applied_release_id          uuid NOT NULL,
    plane_code                  text NOT NULL,
    source_entity_id            uuid NOT NULL,
    source_entity_operation_id  uuid NOT NULL,
    source_release_id           uuid NOT NULL,
    source_release_hash         text NOT NULL,
    source_compiled_hash        text NOT NULL,
    entity_code                 text NOT NULL,
    operation_key               text NOT NULL,
    permission_id               uuid NOT NULL,
    decision_mode               authz.operation_decision_mode_d NOT NULL,
    status                      authz.operation_scope_binding_status_d NOT NULL DEFAULT 'draft',
    effective_from              timestamptz,
    effective_until             timestamptz,
    published_at                timestamptz,
    published_by                uuid,
    retired_at                  timestamptz,
    retired_by                  uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT entity_operation_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id,id),
    CONSTRAINT entity_operation_binding_coordinate_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id,applied_release_id,source_entity_operation_id),
    CONSTRAINT entity_operation_binding_plane_chk CHECK (plane_code IN ('athyper','neon','mesh')),
    CONSTRAINT entity_operation_binding_release_hash_chk CHECK (source_release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_operation_binding_compiled_hash_chk CHECK (source_compiled_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_operation_binding_entity_code_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_binding_operation_key_chk CHECK (operation_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_binding_publication_chk CHECK (
        (status = 'draft' AND effective_from IS NULL AND effective_until IS NULL AND published_at IS NULL AND published_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
        OR (status = 'published' AND effective_from IS NOT NULL AND effective_until IS NULL AND published_at IS NOT NULL AND published_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL)
        OR (status = 'retired' AND effective_from IS NOT NULL AND effective_until IS NOT NULL AND published_at IS NOT NULL AND published_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
    ),
    CONSTRAINT entity_operation_binding_time_chk CHECK (
        (effective_until IS NULL OR effective_until >= effective_from)
        AND (published_at IS NULL OR published_at >= created_at)
        AND (retired_at IS NULL OR retired_at >= published_at)),
    CONSTRAINT entity_operation_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE authz.entity_operation_scope_binding (
    id                           uuid NOT NULL DEFAULT shared.uuidv7(),
    entity_operation_binding_id  uuid NOT NULL,
    scope_kind                   authz.scope_kind_d NOT NULL,
    coordinate_source            authz.scope_coordinate_source_d NOT NULL,
    coordinate_key               text,
    resolver_key                 text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid NOT NULL,
    CONSTRAINT entity_operation_scope_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_scope_binding_coordinate_uq UNIQUE
        (entity_operation_binding_id,scope_kind),
    CONSTRAINT entity_operation_scope_binding_coordinate_key_chk CHECK (
        coordinate_key IS NULL OR coordinate_key ~ '^[a-z][a-z0-9_]{0,126}$'),
    CONSTRAINT entity_operation_scope_binding_resolver_key_chk CHECK (
        resolver_key IS NULL OR resolver_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_scope_binding_source_shape_chk CHECK (
        (coordinate_source IN ('request_field','record_field','collection_field') AND coordinate_key IS NOT NULL AND resolver_key IS NULL)
        OR (coordinate_source = 'relation_resolver' AND coordinate_key IS NULL AND resolver_key IS NOT NULL)
        OR (coordinate_source = 'tenant_context' AND coordinate_key IS NULL AND resolver_key IS NULL)),
    CONSTRAINT entity_operation_scope_binding_scope_source_chk CHECK (
        (scope_kind = 'tenant' AND coordinate_source = 'tenant_context')
        OR (scope_kind <> 'tenant' AND coordinate_source <> 'tenant_context'))
);

COMMENT ON TABLE authz.entity_operation_binding IS
  'Compiler-owned, plane-local immutable operation-to-permission projection installed and activated with its runtime_meta descriptor. It grants no authority.';
COMMENT ON TABLE authz.entity_operation_scope_binding IS
  'Child scope coordinates for one entity operation binding. Missing or ambiguous coordinates deny authorization.';
COMMENT ON COLUMN authz.entity_operation_binding.permission_id IS
  'Local canonical permission definition only. Roles, grants, groups, denies, delegation, ACLs, devices, memberships, and scope targets remain plane-local authority.';
COMMENT ON COLUMN authz.entity_operation_scope_binding.coordinate_key IS
  'Canonical field key only; executable SQL, JSONPath, and caller-supplied expressions are prohibited.';
