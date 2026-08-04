-- Canonical Neon product, item, catalog, and bill-of-material foundation.

CREATE TABLE master.commodity_category (
    id                 uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                           NOT NULL,
    code               text                           NOT NULL,
    name               text                           NOT NULL,
    description        text,
    parent_id          uuid,
    sort_order         integer                        NOT NULL DEFAULT 0,
    metadata           jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status             master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                    NOT NULL DEFAULT now(),
    created_by         uuid                           NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT commodity_category_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_category_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_category_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT commodity_category_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT commodity_category_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT commodity_category_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT commodity_category_no_self_parent_chk
        CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT commodity_category_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_category_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_category_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.commodity_category IS
  'Tenant-owned hierarchical business taxonomy only. Buy, sell, inventory, accounting, tax, and tracking behavior belongs in control policy.';

CREATE TABLE master.product (
    id                    uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                           NOT NULL,
    code                  text                           NOT NULL,
    name                  text                           NOT NULL,
    description           text,
    product_type          master.product_type_d          NOT NULL,
    commodity_category_id uuid                           NOT NULL,
    base_uom_code         text                           NOT NULL,
    metadata              jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                    NOT NULL DEFAULT now(),
    created_by            uuid                           NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT product_pkey PRIMARY KEY (id),
    CONSTRAINT product_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT product_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT product_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT product_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT product_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT product_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT product_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT product_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.product IS
  'Tenant-wide commercial or technical definition. Supplier, price, tax, company, inventory, and BOM behavior are intentionally excluded.';

CREATE TABLE master.item (
    id                   uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                           NOT NULL,
    company_code_id      uuid                           NOT NULL,
    product_id           uuid                           NOT NULL,
    code                 text                           NOT NULL,
    name                 text                           NOT NULL,
    description          text,
    base_uom_code        text                           NOT NULL,
    is_purchasable       boolean                        NOT NULL DEFAULT false,
    is_sellable          boolean                        NOT NULL DEFAULT false,
    is_inventory_managed boolean                        NOT NULL DEFAULT false,
    is_manufactured      boolean                        NOT NULL DEFAULT false,
    metadata             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status               master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                    NOT NULL DEFAULT now(),
    created_by           uuid                           NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT item_pkey PRIMARY KEY (id),
    CONSTRAINT item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT item_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT item_company_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT item_company_product_uq
        UNIQUE (tenant_id, company_code_id, product_id),
    CONSTRAINT item_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT item_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT item_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT item_capability_chk CHECK (
        is_purchasable OR is_sellable OR is_inventory_managed OR is_manufactured
        OR status = 'draft'
    ),
    CONSTRAINT item_manufactured_inventory_chk
        CHECK (NOT is_manufactured OR is_inventory_managed),
    CONSTRAINT item_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.item IS
  'Company-code operational identity used by procurement, sales, inventory, BOM, production, and projects. Category derives through product.';

CREATE TABLE master.commodity_code_assignment (
    id                    uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                               NOT NULL,
    commodity_category_id uuid,
    product_id            uuid,
    item_id               uuid,
    commodity_domain_code text                               NOT NULL,
    commodity_code_id     uuid                               NOT NULL,
    mapping_type          master.classification_mapping_d    NOT NULL DEFAULT 'exact',
    confidence            numeric(5,2),
    provenance            master.classification_provenance_d NOT NULL DEFAULT 'manual',
    is_owner_primary      boolean                            NOT NULL DEFAULT false,
    is_code_routing_default boolean                          NOT NULL DEFAULT false,
    description           text,
    metadata              jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                master.catalog_record_status_d     NOT NULL DEFAULT 'active',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                        NOT NULL DEFAULT now(),
    created_by            uuid                               NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT commodity_code_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT commodity_code_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commodity_code_assignment_exact_owner_chk CHECK (
        num_nonnulls(commodity_category_id, product_id, item_id) = 1
    ),
    CONSTRAINT commodity_code_assignment_domain_chk
        CHECK (commodity_domain_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT commodity_code_assignment_confidence_chk
        CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT commodity_code_assignment_routing_owner_chk CHECK (
        NOT is_code_routing_default
        OR commodity_category_id IS NOT NULL
    ),
    CONSTRAINT commodity_code_assignment_routing_mapping_chk CHECK (
        NOT is_code_routing_default
        OR mapping_type IN ('exact', 'broader')
    ),
    CONSTRAINT commodity_code_assignment_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT commodity_code_assignment_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT commodity_code_assignment_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commodity_code_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.commodity_code_assignment IS
  'Authoritative bidirectional commodity-code assignment for exactly one category, product, or company item. Owner-primary rows resolve owner to code; category routing-default rows resolve incoming codes and their nearest classified ancestors back to a tenant category.';

COMMENT ON COLUMN master.commodity_code_assignment.is_owner_primary IS
  'Preferred code for the owner within commodity_domain_code. Multiple domains may each have one primary assignment.';

COMMENT ON COLUMN master.commodity_code_assignment.is_code_routing_default IS
  'Permits reverse code-to-category routing. Valid only for category assignments and unique for an active tenant/domain/code coordinate.';

CREATE TABLE master.catalog (
    id                           uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                           NOT NULL,
    company_code_id              uuid                           NOT NULL,
    code                         text                           NOT NULL,
    name                         text                           NOT NULL,
    catalog_direction            master.catalog_direction_d     NOT NULL,
    supplier_business_partner_id uuid,
    source_system                text,
    source_account_id            uuid,
    source_catalog_id            uuid,
    source_publication_id        uuid,
    source_revision_no           integer,
    source_content_hash          text,
    valid_from                   date,
    valid_until                  date,
    metadata                     jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                       master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active                    boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                    NOT NULL DEFAULT now(),
    created_by                   uuid                           NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT catalog_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT catalog_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT catalog_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT catalog_supplier_direction_chk CHECK (
        catalog_direction <> 'buy'
        OR supplier_business_partner_id IS NOT NULL
        OR status = 'draft'
    ),
    CONSTRAINT catalog_source_coordinate_chk CHECK (
        (
            source_system IS NULL
            AND source_account_id IS NULL
            AND source_catalog_id IS NULL
            AND source_publication_id IS NULL
            AND source_revision_no IS NULL
            AND source_content_hash IS NULL
        )
        OR (
            source_system IS NOT NULL
            AND source_account_id IS NOT NULL
            AND source_catalog_id IS NOT NULL
            AND source_publication_id IS NOT NULL
            AND source_revision_no IS NOT NULL
            AND source_content_hash IS NOT NULL
        )
    ),
    CONSTRAINT catalog_source_system_chk
        CHECK (source_system IS NULL OR btrim(source_system) <> ''),
    CONSTRAINT catalog_source_revision_chk
        CHECK (source_revision_no IS NULL OR source_revision_no >= 1),
    CONSTRAINT catalog_source_hash_chk CHECK (
        source_content_hash IS NULL
        OR source_content_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT catalog_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.catalog_item (
    id                     uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                           NOT NULL,
    catalog_id             uuid                           NOT NULL,
    item_id                uuid                           NOT NULL,
    source_catalog_item_id uuid,
    external_item_code     text,
    display_name_override  text,
    minimum_order_qty      numeric(18,6),
    order_multiple         numeric(18,6),
    lead_time_days         integer,
    valid_from             date,
    valid_until            date,
    metadata               jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                 master.catalog_record_status_d NOT NULL DEFAULT 'draft',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                    NOT NULL DEFAULT now(),
    created_by             uuid                           NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT catalog_item_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_coordinate_uq UNIQUE (tenant_id, catalog_id, item_id),
    CONSTRAINT catalog_item_external_code_chk
        CHECK (external_item_code IS NULL OR btrim(external_item_code) <> ''),
    CONSTRAINT catalog_item_display_name_chk
        CHECK (display_name_override IS NULL OR btrim(display_name_override) <> ''),
    CONSTRAINT catalog_item_order_chk CHECK (
        (minimum_order_qty IS NULL OR minimum_order_qty > 0)
        AND (order_multiple IS NULL OR order_multiple > 0)
    ),
    CONSTRAINT catalog_item_lead_time_chk
        CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    CONSTRAINT catalog_item_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_item_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.catalog_item IS
  'Purchaser-approved catalog listing. item_id is mandatory; unmatched supplier offers remain in document.catalog_import_line.';

CREATE TABLE master.catalog_price (
    id                 uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                           NOT NULL,
    catalog_item_id    uuid                           NOT NULL,
    price_type         text                           NOT NULL DEFAULT 'list',
    unit_price         numeric(18,6)                  NOT NULL,
    price_unit         numeric(18,6)                  NOT NULL DEFAULT 1,
    currency_code      character(3)                   NOT NULL,
    price_uom_code     text                           NOT NULL,
    minimum_quantity   numeric(18,6),
    maximum_quantity   numeric(18,6),
    valid_from         date                           NOT NULL DEFAULT CURRENT_DATE,
    valid_until        date,
    source_price_id    uuid,
    metadata           jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status             master.catalog_record_status_d NOT NULL DEFAULT 'active',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                    NOT NULL DEFAULT now(),
    created_by         uuid                           NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_price_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_price_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_price_type_chk
        CHECK (price_type IN ('list', 'contract', 'tier', 'promotional', 'internal')),
    CONSTRAINT catalog_price_amount_chk
        CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT catalog_price_quantity_chk CHECK (
        (minimum_quantity IS NULL OR minimum_quantity >= 0)
        AND (maximum_quantity IS NULL OR maximum_quantity >= 0)
        AND (
            minimum_quantity IS NULL
            OR maximum_quantity IS NULL
            OR maximum_quantity >= minimum_quantity
        )
    ),
    CONSTRAINT catalog_price_range_chk
        CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_price_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_price_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_price_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.bom (
    id                 uuid                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                NOT NULL,
    company_code_id    uuid                NOT NULL,
    output_item_id     uuid                NOT NULL,
    code               text                NOT NULL,
    name               text                NOT NULL,
    bom_type           master.bom_type_d   NOT NULL,
    base_quantity      numeric(18,6)       NOT NULL DEFAULT 1,
    uom_code           text                NOT NULL,
    effective_from     date,
    effective_until    date,
    metadata           jsonb               NOT NULL DEFAULT '{}'::jsonb,
    status             master.bom_status_d NOT NULL DEFAULT 'draft',
    is_active          boolean GENERATED ALWAYS AS (status = 'released') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz         NOT NULL DEFAULT now(),
    created_by         uuid                NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT bom_pkey PRIMARY KEY (id),
    CONSTRAINT bom_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_company_id_uq UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT bom_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT bom_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT bom_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bom_quantity_chk CHECK (base_quantity > 0),
    CONSTRAINT bom_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
    CONSTRAINT bom_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bom_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bom_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.bom_component (
    id                   uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                           NOT NULL,
    company_code_id      uuid                           NOT NULL,
    bom_id               uuid                           NOT NULL,
    component_item_id    uuid                           NOT NULL,
    line_no              integer                        NOT NULL,
    quantity             numeric(18,6)                  NOT NULL,
    uom_code             text                           NOT NULL,
    scrap_percent        numeric(7,4)                   NOT NULL DEFAULT 0,
    issue_method         text                           NOT NULL DEFAULT 'manual',
    is_optional          boolean                        NOT NULL DEFAULT false,
    alternate_group_code text,
    sort_order           integer                        NOT NULL DEFAULT 0,
    metadata             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status               master.catalog_record_status_d NOT NULL DEFAULT 'active',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                    NOT NULL DEFAULT now(),
    created_by           uuid                           NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT bom_component_pkey PRIMARY KEY (id),
    CONSTRAINT bom_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_component_line_uq UNIQUE (tenant_id, bom_id, line_no),
    CONSTRAINT bom_component_item_uq
        UNIQUE NULLS NOT DISTINCT (
            tenant_id, bom_id, component_item_id, alternate_group_code
        ),
    CONSTRAINT bom_component_line_chk CHECK (line_no >= 1),
    CONSTRAINT bom_component_quantity_chk CHECK (quantity > 0),
    CONSTRAINT bom_component_scrap_chk
        CHECK (scrap_percent >= 0 AND scrap_percent < 100),
    CONSTRAINT bom_component_issue_method_chk
        CHECK (issue_method IN ('manual', 'backflush', 'preflush')),
    CONSTRAINT bom_component_alternate_group_chk
        CHECK (alternate_group_code IS NULL OR btrim(alternate_group_code) <> ''),
    CONSTRAINT bom_component_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bom_component_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bom_component_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.bom IS
  'Company-specific bill of material whose output and components are operational master.item identities.';

COMMENT ON TABLE master.bom_component IS
  'BOM component requirement. Released historical content is copied into snapshot.bom_component.';
