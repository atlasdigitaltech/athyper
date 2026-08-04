CREATE TABLE control.item_inventory_policy (
    id                             uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                      uuid                              NOT NULL,
    company_code_id                uuid                              NOT NULL,
    item_id                        uuid                              NOT NULL,
    stocking_status                control.stocking_status_d         NOT NULL DEFAULT 'stocked',
    valuation_method               control.valuation_method_d        NOT NULL,
    lot_tracking_required          boolean                           NOT NULL DEFAULT false,
    serial_tracking_required       boolean                           NOT NULL DEFAULT false,
    effective_from                 date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_to                   date,
    metadata                       jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                         control.inventory_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                      boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at              timestamptz,
    status_changed_by              uuid,
    created_at                     timestamptz                       NOT NULL DEFAULT now(),
    created_by                     uuid                              NOT NULL,
    updated_at                     timestamptz,
    updated_by                     uuid,

    CONSTRAINT item_inventory_policy_pkey PRIMARY KEY (id),
    CONSTRAINT item_inventory_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT item_inventory_policy_coordinate_uq
        UNIQUE (tenant_id, company_code_id, item_id, effective_from),
    CONSTRAINT item_inventory_policy_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT item_inventory_policy_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT item_inventory_policy_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT item_inventory_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.item_inventory_policy IS
  'Effective-dated company/item inventory override for stocking, valuation method and tracking. UOM derives from master.item; costs, replenishment quantities and GL accounts deliberately live outside this policy.';
