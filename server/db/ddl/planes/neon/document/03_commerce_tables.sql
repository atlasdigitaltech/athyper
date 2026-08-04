-- Supplier catalog review, PunchOut return, assembly execution, and sales.

CREATE TABLE document.catalog_import (
    id                           uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                             NOT NULL,
    company_code_id              uuid                             NOT NULL,
    supplier_business_partner_id uuid                             NOT NULL,
    source_system                text                             NOT NULL,
    source_account_id            uuid,
    source_catalog_id            uuid                             NOT NULL,
    source_publication_id        uuid                             NOT NULL,
    source_revision_no           integer                          NOT NULL,
    source_content_hash          text                             NOT NULL,
    received_at                  timestamptz                      NOT NULL DEFAULT now(),
    reviewed_at                  timestamptz,
    reviewed_by                  uuid,
    published_at                 timestamptz,
    published_by                 uuid,
    error_message                text,
    metadata                     jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                       document.catalog_import_status_d NOT NULL DEFAULT 'received',
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                      NOT NULL DEFAULT now(),
    created_by                   uuid                             NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT catalog_import_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_import_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_import_source_uq
        UNIQUE (tenant_id, company_code_id, source_system, source_publication_id),
    CONSTRAINT catalog_import_source_system_chk
        CHECK (btrim(source_system) <> ''),
    CONSTRAINT catalog_import_revision_chk CHECK (source_revision_no >= 1),
    CONSTRAINT catalog_import_hash_chk
        CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT catalog_import_review_evidence_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT catalog_import_publish_evidence_chk
        CHECK ((published_at IS NULL) = (published_by IS NULL)),
    CONSTRAINT catalog_import_error_chk
        CHECK (error_message IS NULL OR btrim(error_message) <> ''),
    CONSTRAINT catalog_import_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_import_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_import_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.catalog_import_line (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                           NOT NULL,
    catalog_import_id          uuid                           NOT NULL,
    line_no                    integer                        NOT NULL,
    source_catalog_item_id     uuid                           NOT NULL,
    supplier_item_code         text                           NOT NULL,
    supplier_item_name         text                           NOT NULL,
    supplier_description       text,
    manufacturer_name          text,
    manufacturer_part_number  text,
    gtin                       text,
    commodity_code_id          uuid,
    supplier_uom_code          text                           NOT NULL,
    normalized_uom_code        text,
    minimum_order_qty          numeric(18,6),
    order_multiple             numeric(18,6),
    unit_price                 numeric(18,6),
    price_unit                 numeric(18,6)                  NOT NULL DEFAULT 1,
    currency_code              character(3),
    valid_from                 date,
    valid_until                date,
    proposed_item_id           uuid,
    match_status               document.item_match_status_d   NOT NULL DEFAULT 'unmatched',
    match_method               document.item_match_method_d,
    match_confidence           numeric(5,2),
    review_decision            document.catalog_review_decision_d,
    reviewed_at                timestamptz,
    reviewed_by                uuid,
    review_note                text,
    published_catalog_item_id  uuid,
    source_payload             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                     text                           NOT NULL DEFAULT 'active',
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT catalog_import_line_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_import_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_import_line_number_uq
        UNIQUE (tenant_id, catalog_import_id, line_no),
    CONSTRAINT catalog_import_line_source_uq
        UNIQUE (tenant_id, catalog_import_id, source_catalog_item_id),
    CONSTRAINT catalog_import_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT catalog_import_line_supplier_code_chk
        CHECK (btrim(supplier_item_code) <> ''),
    CONSTRAINT catalog_import_line_supplier_name_chk
        CHECK (btrim(supplier_item_name) <> ''),
    CONSTRAINT catalog_import_line_uom_chk
        CHECK (btrim(supplier_uom_code) <> ''),
    CONSTRAINT catalog_import_line_order_chk CHECK (
        (minimum_order_qty IS NULL OR minimum_order_qty > 0)
        AND (order_multiple IS NULL OR order_multiple > 0)
    ),
    CONSTRAINT catalog_import_line_price_chk CHECK (
        (unit_price IS NULL AND currency_code IS NULL)
        OR (unit_price IS NOT NULL AND unit_price >= 0 AND currency_code IS NOT NULL)
    ),
    CONSTRAINT catalog_import_line_price_unit_chk CHECK (price_unit > 0),
    CONSTRAINT catalog_import_line_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_import_line_match_evidence_chk CHECK (
        (match_method IS NULL AND match_confidence IS NULL)
        OR match_status IN ('candidate_found', 'matched', 'conflict')
    ),
    CONSTRAINT catalog_import_line_confidence_chk
        CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 100),
    CONSTRAINT catalog_import_line_review_evidence_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT catalog_import_line_review_decision_chk CHECK (
        review_decision IS NULL
        OR reviewed_at IS NOT NULL
    ),
    CONSTRAINT catalog_import_line_publish_chk CHECK (
        published_catalog_item_id IS NULL
        OR review_decision IN ('map_existing_item', 'create_product_and_item')
    ),
    CONSTRAINT catalog_import_line_review_note_chk
        CHECK (review_note IS NULL OR btrim(review_note) <> ''),
    CONSTRAINT catalog_import_line_payload_object_chk
        CHECK (jsonb_typeof(source_payload) = 'object'),
    CONSTRAINT catalog_import_line_status_chk
        CHECK (status IN ('active', 'ignored', 'published', 'failed')),
    CONSTRAINT catalog_import_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_import_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.punchout_cart (
    id                           uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                            NOT NULL,
    company_code_id              uuid                            NOT NULL,
    supplier_business_partner_id uuid                            NOT NULL,
    mesh_session_id              uuid                            NOT NULL,
    network_relationship_id      uuid,
    external_cart_id             text                            NOT NULL,
    currency_code                character(3)                    NOT NULL,
    returned_at                  timestamptz                     NOT NULL,
    expires_at                   timestamptz,
    converted_requisition_id     uuid,
    metadata                     jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status                       document.punchout_cart_status_d NOT NULL DEFAULT 'returned',
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                     NOT NULL DEFAULT now(),
    created_by                   uuid                            NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT punchout_cart_pkey PRIMARY KEY (id),
    CONSTRAINT punchout_cart_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT punchout_cart_session_uq UNIQUE (tenant_id, mesh_session_id),
    CONSTRAINT punchout_cart_external_uq
        UNIQUE (tenant_id, supplier_business_partner_id, external_cart_id),
    CONSTRAINT punchout_cart_external_chk
        CHECK (btrim(external_cart_id) <> ''),
    CONSTRAINT punchout_cart_range_chk
        CHECK (expires_at IS NULL OR expires_at > returned_at),
    CONSTRAINT punchout_cart_conversion_chk CHECK (
        (status = 'converted') = (converted_requisition_id IS NOT NULL)
    ),
    CONSTRAINT punchout_cart_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT punchout_cart_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT punchout_cart_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.punchout_cart_line (
    id                        uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                         NOT NULL,
    punchout_cart_id          uuid                         NOT NULL,
    line_no                   integer                      NOT NULL,
    supplier_item_code        text                         NOT NULL,
    supplier_item_description text                         NOT NULL,
    manufacturer_name         text,
    manufacturer_part_number text,
    gtin                      text,
    commodity_code_id         uuid,
    item_id                   uuid,
    quantity                  numeric(18,6)                NOT NULL,
    uom_code                  text                         NOT NULL,
    unit_price                numeric(18,6)                NOT NULL,
    price_unit                numeric(18,6)                NOT NULL DEFAULT 1,
    currency_code             character(3)                 NOT NULL,
    match_status              document.item_match_status_d NOT NULL DEFAULT 'unmatched',
    match_method              document.item_match_method_d,
    match_confidence          numeric(5,2),
    matched_at                timestamptz,
    matched_by                uuid,
    metadata                  jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                    text                         NOT NULL DEFAULT 'active',
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                         NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT punchout_cart_line_pkey PRIMARY KEY (id),
    CONSTRAINT punchout_cart_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT punchout_cart_line_number_uq
        UNIQUE (tenant_id, punchout_cart_id, line_no),
    CONSTRAINT punchout_cart_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT punchout_cart_line_supplier_code_chk
        CHECK (btrim(supplier_item_code) <> ''),
    CONSTRAINT punchout_cart_line_description_chk
        CHECK (btrim(supplier_item_description) <> ''),
    CONSTRAINT punchout_cart_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT punchout_cart_line_price_chk
        CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT punchout_cart_line_match_chk CHECK (
        (item_id IS NULL AND match_status <> 'matched')
        OR (item_id IS NOT NULL AND match_status = 'matched')
    ),
    CONSTRAINT punchout_cart_line_match_evidence_chk CHECK (
        (matched_at IS NULL) = (matched_by IS NULL)
        AND (matched_at IS NULL OR match_method IS NOT NULL)
    ),
    CONSTRAINT punchout_cart_line_confidence_chk
        CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 100),
    CONSTRAINT punchout_cart_line_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT punchout_cart_line_status_chk
        CHECK (status IN ('active', 'converted', 'ignored', 'rejected')),
    CONSTRAINT punchout_cart_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT punchout_cart_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.production_order (
    id                    uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                               NOT NULL,
    company_code_id       uuid                               NOT NULL,
    code                  text                               NOT NULL,
    output_item_id        uuid                               NOT NULL,
    bom_snapshot_id       uuid                               NOT NULL,
    planned_quantity      numeric(18,6)                      NOT NULL,
    completed_quantity    numeric(18,6)                      NOT NULL DEFAULT 0,
    uom_code              text                               NOT NULL,
    assembly_site_id      uuid,
    planned_start_at      timestamptz,
    planned_end_at        timestamptz,
    actual_start_at       timestamptz,
    actual_end_at         timestamptz,
    metadata              jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                document.production_order_status_d NOT NULL DEFAULT 'draft',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                        NOT NULL DEFAULT now(),
    created_by            uuid                               NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT production_order_pkey PRIMARY KEY (id),
    CONSTRAINT production_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT production_order_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT production_order_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT production_order_quantity_chk CHECK (
        planned_quantity > 0
        AND completed_quantity >= 0
        AND completed_quantity <= planned_quantity
    ),
    CONSTRAINT production_order_planned_range_chk CHECK (
        planned_end_at IS NULL
        OR planned_start_at IS NULL
        OR planned_end_at >= planned_start_at
    ),
    CONSTRAINT production_order_actual_range_chk CHECK (
        actual_end_at IS NULL
        OR actual_start_at IS NULL
        OR actual_end_at >= actual_start_at
    ),
    CONSTRAINT production_order_completion_evidence_chk CHECK (
        status NOT IN ('completed', 'closed')
        OR (
            completed_quantity > 0
            AND actual_start_at IS NOT NULL
            AND actual_end_at IS NOT NULL
        )
    ),
    CONSTRAINT production_order_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT production_order_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT production_order_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.production_order_component (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    production_order_id  uuid        NOT NULL,
    bom_component_snapshot_id uuid,
    component_item_id    uuid        NOT NULL,
    line_no              integer     NOT NULL,
    planned_quantity     numeric(18,6) NOT NULL,
    reserved_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    issued_quantity      numeric(18,6) NOT NULL DEFAULT 0,
    consumed_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    returned_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    scrapped_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    uom_code             text        NOT NULL,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status               text        NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT production_order_component_pkey PRIMARY KEY (id),
    CONSTRAINT production_order_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT production_order_component_line_uq
        UNIQUE (tenant_id, production_order_id, line_no),
    CONSTRAINT production_order_component_line_chk CHECK (line_no >= 1),
    CONSTRAINT production_order_component_quantity_chk CHECK (
        planned_quantity > 0
        AND reserved_quantity >= 0
        AND issued_quantity >= 0
        AND consumed_quantity >= 0
        AND returned_quantity >= 0
        AND scrapped_quantity >= 0
        AND consumed_quantity + returned_quantity + scrapped_quantity
            <= issued_quantity
    ),
    CONSTRAINT production_order_component_status_chk CHECK (
        status IN ('planned', 'reserved', 'issued', 'consumed', 'completed', 'cancelled')
    ),
    CONSTRAINT production_order_component_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT production_order_component_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT production_order_component_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Required parent for the requested sales_order_line; no sales-order header
-- existed in the new Neon path.
CREATE TABLE document.sales_order (
    id                 uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                          NOT NULL,
    company_code_id    uuid                          NOT NULL,
    customer_id        uuid                          NOT NULL,
    code               text                          NOT NULL,
    order_date         date                          NOT NULL,
    requested_date     date,
    currency_code      character(3)                  NOT NULL,
    total_amount       numeric(18,6)                 NOT NULL DEFAULT 0,
    metadata           jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status             document.sales_order_status_d NOT NULL DEFAULT 'draft',
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                   NOT NULL DEFAULT now(),
    created_by         uuid                          NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT sales_order_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT sales_order_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT sales_order_requested_date_chk
        CHECK (requested_date IS NULL OR requested_date >= order_date),
    CONSTRAINT sales_order_total_chk CHECK (total_amount >= 0),
    CONSTRAINT sales_order_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_order_line (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    sales_order_id     uuid        NOT NULL,
    line_no            integer     NOT NULL,
    item_id            uuid        NOT NULL,
    item_description   text        NOT NULL,
    quantity           numeric(18,6) NOT NULL,
    uom_code           text        NOT NULL,
    unit_price         numeric(18,6) NOT NULL,
    price_unit         numeric(18,6) NOT NULL DEFAULT 1,
    currency_code      character(3) NOT NULL,
    tax_amount         numeric(18,6) NOT NULL DEFAULT 0,
    net_amount         numeric(18,6)
        GENERATED ALWAYS AS ((quantity * unit_price) / price_unit) STORED,
    gross_amount       numeric(18,6)
        GENERATED ALWAYS AS (((quantity * unit_price) / price_unit) + tax_amount) STORED,
    requested_date     date,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status             text        NOT NULL DEFAULT 'open',
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT sales_order_line_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_line_number_uq
        UNIQUE (tenant_id, sales_order_id, line_no),
    CONSTRAINT sales_order_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT sales_order_line_description_chk
        CHECK (btrim(item_description) <> ''),
    CONSTRAINT sales_order_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT sales_order_line_price_chk
        CHECK (unit_price >= 0 AND price_unit > 0 AND tax_amount >= 0),
    CONSTRAINT sales_order_line_status_chk
        CHECK (status IN ('open', 'allocated', 'partially_fulfilled', 'fulfilled', 'cancelled')),
    CONSTRAINT sales_order_line_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
