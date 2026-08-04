-- Category intent eligibility and inventory defaults.  Direct accounting
-- coordinates are intentionally excluded; account determination resolves
-- through accounting profiles and posting-role account maps.
CREATE TABLE control.commodity_category_buy_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    commodity_category_id               uuid        NOT NULL,
    company_code_id                     uuid,
    company_code_supplier_profile_id    uuid,
    business_intent_id                  uuid        NOT NULL,
    is_default                          boolean     NOT NULL DEFAULT false,
    is_selectable                       boolean     NOT NULL DEFAULT true,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT cc_buy_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_buy_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_buy_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id,
        company_code_supplier_profile_id, business_intent_id, effective_from
    ),
    CONSTRAINT cc_buy_policy_scope_chk CHECK (
        company_code_supplier_profile_id IS NULL OR company_code_id IS NOT NULL
    ),
    CONSTRAINT cc_buy_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_buy_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_buy_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_buy_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_buy_policy IS
  'Allowed and default purchasing intents for a commodity category. Resolution replaces the complete intent set at supplier-company, then company, then tenant scope; direct GL, tax, asset and budget defaults are excluded.';

CREATE TABLE control.commodity_category_sell_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    commodity_category_id               uuid        NOT NULL,
    company_code_id                     uuid,
    company_code_customer_profile_id    uuid,
    business_intent_id                  uuid        NOT NULL,
    is_default                          boolean     NOT NULL DEFAULT false,
    is_selectable                       boolean     NOT NULL DEFAULT true,
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT cc_sell_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_sell_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_sell_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id,
        company_code_customer_profile_id, business_intent_id, effective_from
    ),
    CONSTRAINT cc_sell_policy_scope_chk CHECK (
        company_code_customer_profile_id IS NULL OR company_code_id IS NOT NULL
    ),
    CONSTRAINT cc_sell_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_sell_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_sell_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_sell_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_sell_policy IS
  'Allowed and default sales intents for a commodity category. Resolution replaces the complete intent set at customer-company, then company, then tenant scope; revenue, deferral, COGS and tax determination remain in finance control.';

CREATE TABLE control.commodity_category_inventory_policy (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    commodity_category_id       uuid        NOT NULL,
    company_code_id             uuid,
    stocking_status             control.stocking_status_d NOT NULL DEFAULT 'stocked',
    valuation_method            control.valuation_method_d,
    lot_tracking_required       boolean     NOT NULL DEFAULT false,
    serial_tracking_required    boolean     NOT NULL DEFAULT false,
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.commodity_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT cc_inventory_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cc_inventory_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cc_inventory_policy_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, commodity_category_id, company_code_id, effective_from
    ),
    CONSTRAINT cc_inventory_policy_valuation_chk CHECK (
        stocking_status <> 'stocked' OR valuation_method IS NOT NULL
    ),
    CONSTRAINT cc_inventory_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cc_inventory_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cc_inventory_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cc_inventory_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.commodity_category_inventory_policy IS
  'Tenant or company category defaults for stocking, valuation method and tracking. Company-item policy overrides this row; costs, replenishment quantities, UOM and GL accounts are excluded.';
