CREATE TABLE control.business_partner_qualification (
    id                        uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                             NOT NULL,
    business_partner_id       uuid                             NOT NULL,
    partner_role              master.partner_role_d            NOT NULL,
    operating_organization_id uuid,
    company_code_id           uuid,
    commodity_capability_id   uuid,
    qualification_type_code   text                             NOT NULL,
    decision                  control.qualification_decision_d NOT NULL DEFAULT 'pending',
    decision_reason           text,
    risk_assessment_id        uuid,
    effective_from            date,
    effective_until           date,
    reviewed_at               timestamptz,
    reviewed_by               uuid,
    approved_at               timestamptz,
    approved_by               uuid,
    next_review_at            date,
    metadata                  jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    created_at                timestamptz                      NOT NULL DEFAULT now(),
    created_by                uuid                             NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_qualification_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_qualification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_qualification_type_chk
        CHECK (qualification_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_qualification_reason_chk
        CHECK (decision_reason IS NULL OR length(decision_reason) <= 4000),
    CONSTRAINT business_partner_qualification_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_qualification_review_pair_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT business_partner_qualification_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT business_partner_qualification_approved_chk
        CHECK (decision NOT IN ('approved', 'conditional')
               OR approved_at IS NOT NULL),
    CONSTRAINT business_partner_qualification_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_qualification_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.business_partner_block (
    id                        uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                           NOT NULL,
    business_partner_id       uuid                           NOT NULL,
    partner_role_scope        control.partner_role_scope_d   NOT NULL DEFAULT 'all',
    operating_organization_id uuid,
    company_code_id           uuid,
    operation_code            text                           NOT NULL,
    reason_code               text,
    reason                    text                           NOT NULL,
    effective_from            timestamptz                    NOT NULL DEFAULT now(),
    effective_until           timestamptz,
    blocked_at                timestamptz                    NOT NULL DEFAULT now(),
    blocked_by                uuid                           NOT NULL,
    lifted_at                 timestamptz,
    lifted_by                 uuid,
    lift_reason               text,
    metadata                  jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                    control.partner_block_status_d NOT NULL DEFAULT 'active',
    created_at                timestamptz                    NOT NULL DEFAULT now(),
    created_by                uuid                           NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_block_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_block_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_block_operation_chk
        CHECK (operation_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_block_reason_code_chk
        CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_block_reason_chk
        CHECK (btrim(reason) <> '' AND length(reason) <= 4000),
    CONSTRAINT business_partner_block_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_block_lift_chk CHECK (
        (status = 'lifted' AND lifted_at IS NOT NULL AND lifted_by IS NOT NULL
         AND nullif(btrim(lift_reason), '') IS NOT NULL)
        OR
        (status <> 'lifted' AND lifted_at IS NULL AND lifted_by IS NULL
         AND lift_reason IS NULL)
    ),
    CONSTRAINT business_partner_block_status_time_chk
        CHECK (status <> 'expired' OR effective_until IS NOT NULL),
    CONSTRAINT business_partner_block_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_block_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
