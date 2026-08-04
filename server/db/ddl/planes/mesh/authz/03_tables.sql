-- Unified plane-local authorization authority.
-- Keycloak authenticates; master.principal identifies actors; authz grants.

CREATE TABLE authz.permission (
    id                    uuid                      NOT NULL DEFAULT shared.uuidv7(),
    canonical_code        text                      NOT NULL,
    permission_kind       authz.permission_kind_d   NOT NULL,
    resource_code         text                      NOT NULL,
    operation_code        text                      NOT NULL,
    module_id             uuid                      NOT NULL,
    risk_tier             authz.risk_tier_d          NOT NULL DEFAULT 'low',
    requires_mfa          boolean                   NOT NULL DEFAULT false,
    requires_sod          boolean                   NOT NULL DEFAULT false,
    is_shareable          boolean                   NOT NULL DEFAULT false,
    is_delegable          boolean                   NOT NULL DEFAULT false,
    is_overridable        boolean                   NOT NULL DEFAULT false,
    provenance_ref        text                      NOT NULL,
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
    CONSTRAINT permission_resource_fmt_chk
        CHECK (resource_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT permission_operation_fmt_chk
        CHECK (operation_code ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT permission_exact_code_chk
        CHECK (canonical_code = resource_code || '.' || operation_code),
    CONSTRAINT permission_provenance_chk CHECK (btrim(provenance_ref) <> ''),
    CONSTRAINT permission_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT permission_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT permission_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.permission IS
  'Plane-local seed-owned exact permission catalog. Tenant-defined permission creation is prohibited.';

CREATE TABLE authz.permission_scope_policy (
    permission_id       uuid                         NOT NULL,
    scope_kind          authz.scope_kind_d           NOT NULL,
    propagation_mode    authz.propagation_mode_d     NOT NULL DEFAULT 'exact',
    created_at          timestamptz                  NOT NULL DEFAULT now(),
    created_by          uuid                         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT permission_scope_policy_pkey
        PRIMARY KEY (permission_id, scope_kind),
    CONSTRAINT permission_scope_policy_propagation_chk
        CHECK (
            propagation_mode = 'exact'
            OR (
                propagation_mode = 'subtree'
                AND scope_kind IN (
                    'tenant',
                    'workspace',
                    'module',
                    'company_code',
                    'legal_entity',
                    'operating_organization',
                    'network_account'
                )
            )
            OR (
                propagation_mode = 'member_companies'
                AND scope_kind IN ('legal_entity', 'operating_organization')
            )
            OR (
                propagation_mode = 'relationship_participants'
                AND scope_kind = 'network_relationship'
            )
        ),
    CONSTRAINT permission_scope_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE authz.permission_scope_policy IS
  'Scope-kind and propagation rules owned by a permission definition. Rules may change only while the parent permission is draft or suspended.';

COMMENT ON COLUMN authz.permission_scope_policy.scope_kind IS
  'Kind of scope target at which the permission may be assigned.';

COMMENT ON COLUMN authz.permission_scope_policy.propagation_mode IS
  'Coverage from the assignment anchor: exact covers only the anchor; subtree covers the anchor and descendants. Advanced graph modes fail closed until their authoritative resolver is wired.';

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
