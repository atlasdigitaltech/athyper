CREATE TABLE control.commodity_code_classification_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    primary_commodity_domain_code       text        NOT NULL,
    trade_commodity_domain_code         text,
    commodity_code_required             boolean     NOT NULL DEFAULT false,
    trade_code_required                 boolean     NOT NULL DEFAULT false,
    regulated_classification_required   boolean     NOT NULL DEFAULT true,
    auto_classification_enabled         boolean     NOT NULL DEFAULT true,
    auto_crosswalk_enabled              boolean     NOT NULL DEFAULT true,
    auto_accept_confidence              numeric(5,2) NOT NULL DEFAULT 90,
    suggestion_confidence               numeric(5,2) NOT NULL DEFAULT 60,
    crosswalk_strategy                  control.commodity_crosswalk_strategy_d
                                                    NOT NULL DEFAULT 'best_match',
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              shared.active_inactive_d NOT NULL DEFAULT 'active',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT commodity_code_classification_policy_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_code_classification_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_code_classification_policy_tenant_uq UNIQUE (tenant_id),
    CONSTRAINT commodity_code_classification_policy_primary_domain_chk
        CHECK (primary_commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT commodity_code_classification_policy_trade_domain_chk CHECK (
        trade_commodity_domain_code IS NULL
        OR (
            trade_commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
            AND trade_commodity_domain_code <> primary_commodity_domain_code
        )
    ),
    CONSTRAINT commodity_code_classification_policy_trade_required_chk
        CHECK (NOT trade_code_required OR trade_commodity_domain_code IS NOT NULL),
    CONSTRAINT commodity_code_classification_policy_crosswalk_chk CHECK (
        (auto_crosswalk_enabled AND trade_commodity_domain_code IS NOT NULL)
        OR (
            NOT auto_crosswalk_enabled
            AND crosswalk_strategy = 'exact_only'
        )
    ),
    CONSTRAINT commodity_code_classification_policy_ai_chk CHECK (
        crosswalk_strategy <> 'ai_assisted' OR auto_classification_enabled
    ),
    CONSTRAINT commodity_code_classification_policy_confidence_chk CHECK (
        suggestion_confidence BETWEEN 0 AND 100
        AND auto_accept_confidence BETWEEN suggestion_confidence AND 100
    ),
    CONSTRAINT commodity_code_classification_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_code_classification_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_code_classification_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_code_classification_policy IS
  'One Neon tenant policy governing preferred commodity-code domains, required classifications, automatic classification, crosswalk use and confidence thresholds. Actual category/product/item assignments remain authoritative master data.';
