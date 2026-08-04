CREATE TABLE document.stocktake (
    id                     uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                        NOT NULL,
    company_code_id        uuid                        NOT NULL,
    site_id                uuid                        NOT NULL,
    warehouse_id           uuid                        NOT NULL,
    code                   text                        NOT NULL,
    name                   text                        NOT NULL,
    reference_no           text,
    stocktake_type         document.stocktake_type_d   NOT NULL DEFAULT 'full',
    stocktake_date         date                        NOT NULL,
    system_quantity_as_of  timestamptz                 NOT NULL,
    blind_count            boolean                     NOT NULL DEFAULT false,
    variance_journal_entry_id uuid,
    completed_at           timestamptz,
    completed_by           uuid,
    metadata               jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    status                 document.stocktake_status_d NOT NULL DEFAULT 'planned',
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                 NOT NULL DEFAULT now(),
    created_by             uuid                        NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT stocktake_pkey PRIMARY KEY (id),
    CONSTRAINT stocktake_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT stocktake_warehouse_code_uq UNIQUE (tenant_id, warehouse_id, code),
    CONSTRAINT stocktake_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT stocktake_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT stocktake_reference_chk CHECK (reference_no IS NULL OR btrim(reference_no) <> ''),
    CONSTRAINT stocktake_completion_pair_chk CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
    CONSTRAINT stocktake_completion_status_chk CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL AND variance_journal_entry_id IS NULL)
    ),
    CONSTRAINT stocktake_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT stocktake_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT stocktake_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.stocktake_line (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    stocktake_id             uuid          NOT NULL,
    line_no                  integer       NOT NULL,
    item_id                  uuid          NOT NULL,
    lot_number               text,
    serial_number            text,
    system_quantity          numeric(20,6) NOT NULL,
    counted_quantity         numeric(20,6),
    variance_quantity        numeric(20,6) GENERATED ALWAYS AS
        (CASE WHEN counted_quantity IS NULL THEN NULL ELSE counted_quantity - system_quantity END) STORED,
    uom_code                 text          NOT NULL,
    unit_cost                numeric(20,6) NOT NULL DEFAULT 0,
    variance_value           numeric(20,4) GENERATED ALWAYS AS
        (CASE WHEN counted_quantity IS NULL THEN NULL ELSE (counted_quantity - system_quantity) * unit_cost END) STORED,
    currency_code            character(3)  NOT NULL,
    counted_at               timestamptz,
    counted_by               uuid,
    posted_inventory_movement_id uuid,
    metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT stocktake_line_pkey PRIMARY KEY (id),
    CONSTRAINT stocktake_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT stocktake_line_no_uq UNIQUE (tenant_id, stocktake_id, line_no),
    CONSTRAINT stocktake_line_coordinate_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, stocktake_id, item_id, lot_number, serial_number),
    CONSTRAINT stocktake_line_no_chk CHECK (line_no >= 1),
    CONSTRAINT stocktake_line_quantities_chk CHECK (
        system_quantity >= 0 AND (counted_quantity IS NULL OR counted_quantity >= 0)
    ),
    CONSTRAINT stocktake_line_cost_chk CHECK (unit_cost >= 0),
    CONSTRAINT stocktake_line_count_pair_chk CHECK ((counted_at IS NULL) = (counted_by IS NULL)),
    CONSTRAINT stocktake_line_count_evidence_chk CHECK ((counted_quantity IS NULL) = (counted_at IS NULL)),
    CONSTRAINT stocktake_line_lot_chk CHECK (lot_number IS NULL OR btrim(lot_number) <> ''),
    CONSTRAINT stocktake_line_serial_chk CHECK (serial_number IS NULL OR btrim(serial_number) <> ''),
    CONSTRAINT stocktake_line_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT stocktake_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_opportunity (
    id                          uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                          NOT NULL,
    customer_id                 uuid                          NOT NULL,
    operating_organization_id   uuid                          NOT NULL,
    code                        text                          NOT NULL,
    name                        text                          NOT NULL,
    description                 text,
    selling_model               master.selling_model_d        NOT NULL DEFAULT 'federated',
    principal_seller_company_id uuid,
    estimated_amount            numeric(18,6),
    currency_code               character(3),
    probability_percent         numeric(5,2),
    expected_close_date         date,
    requested_by                uuid,
    metadata                    jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                      document.sales_opportunity_status_d NOT NULL DEFAULT 'draft',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz                   NOT NULL DEFAULT now(),
    created_by                  uuid                          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sales_opportunity_pkey PRIMARY KEY (id),
    CONSTRAINT sales_opportunity_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_opportunity_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT sales_opportunity_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT sales_opportunity_amount_pair_chk CHECK ((estimated_amount IS NULL) = (currency_code IS NULL)),
    CONSTRAINT sales_opportunity_amount_chk CHECK (estimated_amount IS NULL OR estimated_amount >= 0),
    CONSTRAINT sales_opportunity_probability_chk CHECK (probability_percent IS NULL OR probability_percent BETWEEN 0 AND 100),
    CONSTRAINT sales_opportunity_selling_model_chk CHECK (
        (selling_model = 'principal_seller' AND principal_seller_company_id IS NOT NULL)
        OR (selling_model <> 'principal_seller' AND principal_seller_company_id IS NULL)
    ),
    CONSTRAINT sales_opportunity_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_opportunity_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_opportunity_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_opportunity_company (
    id               uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid                                  NOT NULL,
    opportunity_id   uuid                                  NOT NULL,
    company_code_id  uuid                                  NOT NULL,
    participation_role document.sales_participation_role_d NOT NULL DEFAULT 'participant',
    status           document.sales_participation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz                           NOT NULL DEFAULT now(),
    created_by       uuid                                  NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT sales_opportunity_company_pkey PRIMARY KEY (id),
    CONSTRAINT sales_opportunity_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_company_member_uq UNIQUE (tenant_id, opportunity_id, company_code_id),
    CONSTRAINT sales_opportunity_company_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_opportunity_company_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation (
    id                          uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                          NOT NULL,
    opportunity_id              uuid,
    customer_id                 uuid                          NOT NULL,
    operating_organization_id   uuid                          NOT NULL,
    code                        text                          NOT NULL,
    name                        text                          NOT NULL,
    selling_model               master.selling_model_d        NOT NULL DEFAULT 'federated',
    principal_seller_company_id uuid,
    quotation_date              date                          NOT NULL,
    valid_until                 date,
    currency_code               character(3)                  NOT NULL,
    total_amount                numeric(18,6)                  NOT NULL DEFAULT 0,
    requested_by                uuid,
    metadata                    jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                      document.sales_quotation_status_d NOT NULL DEFAULT 'draft',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz                   NOT NULL DEFAULT now(),
    created_by                  uuid                          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT sales_quotation_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_quotation_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT sales_quotation_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT sales_quotation_validity_chk CHECK (valid_until IS NULL OR valid_until >= quotation_date),
    CONSTRAINT sales_quotation_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT sales_quotation_selling_model_chk CHECK (
        (selling_model = 'principal_seller' AND principal_seller_company_id IS NOT NULL)
        OR (selling_model <> 'principal_seller' AND principal_seller_company_id IS NULL)
    ),
    CONSTRAINT sales_quotation_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_quotation_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation_company (
    id               uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid                                  NOT NULL,
    quotation_id     uuid                                  NOT NULL,
    company_code_id  uuid                                  NOT NULL,
    participation_role document.sales_participation_role_d NOT NULL DEFAULT 'participant',
    status           document.sales_participation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz                           NOT NULL DEFAULT now(),
    created_by       uuid                                  NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT sales_quotation_company_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_company_member_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_company_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_company_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation_allocation (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    quotation_id          uuid          NOT NULL,
    company_code_id       uuid          NOT NULL,
    allocation_percent    numeric(7,4),
    allocation_amount     numeric(18,6),
    output_sales_order_id uuid,
    status                document.sales_quotation_allocation_status_d NOT NULL DEFAULT 'planned',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT sales_quotation_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_allocation_company_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_allocation_measure_chk CHECK (
        allocation_percent IS NOT NULL OR allocation_amount IS NOT NULL
    ),
    CONSTRAINT sales_quotation_allocation_percent_chk CHECK (allocation_percent IS NULL OR allocation_percent BETWEEN 0 AND 100),
    CONSTRAINT sales_quotation_allocation_amount_chk CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
    CONSTRAINT sales_quotation_allocation_conversion_chk CHECK (
        (status = 'converted' AND output_sales_order_id IS NOT NULL)
        OR (status <> 'converted' AND output_sales_order_id IS NULL)
    ),
    CONSTRAINT sales_quotation_allocation_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_allocation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

ALTER TABLE document.sales_order
    ADD COLUMN quotation_id uuid;

CREATE TABLE document.sales_order_intercompany_fulfillment (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    sales_order_id              uuid          NOT NULL,
    selling_company_code_id     uuid          NOT NULL,
    fulfillment_company_code_id uuid          NOT NULL,
    allocation_amount           numeric(18,6) NOT NULL,
    currency_code               character(3)  NOT NULL,
    status                      document.intercompany_fulfillment_status_d NOT NULL DEFAULT 'planned',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT sales_order_intercompany_fulfillment_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_intercompany_fulfillment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_intercompany_fulfillment_route_uq UNIQUE
        (tenant_id, sales_order_id, selling_company_code_id, fulfillment_company_code_id),
    CONSTRAINT sales_order_intercompany_fulfillment_amount_chk CHECK (allocation_amount >= 0),
    CONSTRAINT sales_order_intercompany_fulfillment_company_chk CHECK (selling_company_code_id <> fulfillment_company_code_id),
    CONSTRAINT sales_order_intercompany_fulfillment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_intercompany_fulfillment_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_intercompany_fulfillment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.stocktake IS
  'Warehouse count document with a frozen inventory cut-off. Completion requires every line to be counted and every non-zero variance to reference its posted inventory movement.';
COMMENT ON TABLE document.stocktake_line IS
  'Counted item/lot/serial coordinate. Variance quantity and value are generated evidence, not application-supplied state.';
COMMENT ON TABLE document.sales_opportunity IS
  'Customer opportunity owned by one sales operating organization; participating legal companies are explicit child rows.';
COMMENT ON TABLE document.sales_quotation IS
  'Commercial quotation that can allocate fulfilment across participating company codes and convert allocations into company sales orders.';
COMMENT ON COLUMN document.sales_order.quotation_id IS
  'Optional originating quotation. Multi-company quotation conversion produces at most one order per quotation/company.';
COMMENT ON TABLE document.sales_order_intercompany_fulfillment IS
  'Planned or posted value fulfilled by another company code for the company owning the sales order.';
