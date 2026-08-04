-- Mesh tenant/account boundary. A network account belongs to one administrative
-- tenant; a relationship may join accounts owned by different tenants.

CREATE TABLE mesh.network_account (
    id                uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                          NOT NULL,
    account_code      text                          NOT NULL,
    display_name      text                          NOT NULL,
    legal_name        text,
    network_role      mesh.network_account_role_d   NOT NULL,
    country_code      character(2),
    default_currency  character(3),
    capabilities      jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status            mesh.network_account_status_d NOT NULL DEFAULT 'pending',
    is_active         boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz                   NOT NULL DEFAULT now(),
    created_by        uuid                          NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT network_account_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_code_uq UNIQUE (account_code),
    CONSTRAINT network_account_code_chk
        CHECK (account_code ~ '^[a-z][a-z0-9_.-]{2,62}$'),
    CONSTRAINT network_account_names_chk CHECK (
        btrim(display_name) <> ''
        AND (legal_name IS NULL OR btrim(legal_name) <> '')
    ),
    CONSTRAINT network_account_capabilities_object_chk
        CHECK (jsonb_typeof(capabilities) = 'object'),
    CONSTRAINT network_account_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.network_account IS
  'Mesh exchange boundary owned by one tenant. network_role declares buyer, supplier, or both capability and never replaces tenant_id.';

CREATE TABLE mesh.network_account_identifier (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    network_account_id uuid        NOT NULL,
    scheme             text        NOT NULL,
    identifier_value   text        NOT NULL,
    issuing_authority  text,
    is_primary         boolean     NOT NULL DEFAULT false,
    verified_at        timestamptz,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status             text        NOT NULL DEFAULT 'active',
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT network_account_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_identifier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_identifier_coordinate_uq
        UNIQUE (tenant_id, scheme, identifier_value),
    CONSTRAINT network_account_identifier_values_chk CHECK (
        scheme ~ '^[a-z][a-z0-9_.-]{1,62}$'
        AND btrim(identifier_value) <> ''
        AND (issuing_authority IS NULL OR btrim(issuing_authority) <> '')
    ),
    CONSTRAINT network_account_identifier_status_chk
        CHECK (status IN ('active', 'inactive', 'revoked')),
    CONSTRAINT network_account_identifier_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_identifier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_account_reference (
    id                 uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                            NOT NULL,
    network_account_id uuid                            NOT NULL,
    source_system      text                            NOT NULL,
    external_id        text                            NOT NULL,
    valid_from         timestamptz,
    valid_until        timestamptz,
    payload            jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status             mesh.network_reference_status_d NOT NULL DEFAULT 'active',
    created_at         timestamptz                     NOT NULL DEFAULT now(),
    created_by         uuid                            NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT network_account_reference_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_reference_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_reference_coordinate_uq
        UNIQUE (tenant_id, source_system, external_id),
    CONSTRAINT network_account_reference_values_chk CHECK (
        btrim(source_system) <> '' AND btrim(external_id) <> ''
    ),
    CONSTRAINT network_account_reference_range_chk CHECK (
        valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT network_account_reference_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT network_account_reference_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_relationship (
    id                     uuid                               NOT NULL DEFAULT shared.uuidv7(),
    buyer_tenant_id        uuid                               NOT NULL,
    buyer_account_id       uuid                               NOT NULL,
    supplier_tenant_id     uuid                               NOT NULL,
    supplier_account_id    uuid                               NOT NULL,
    relationship_kind      text                               NOT NULL DEFAULT 'commercial',
    effective_from         date,
    effective_until        date,
    metadata               jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                 mesh.network_relationship_status_d NOT NULL DEFAULT 'requested',
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_by_tenant_id   uuid                               NOT NULL,
    created_at             timestamptz                        NOT NULL DEFAULT now(),
    created_by             uuid                               NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT network_relationship_pkey PRIMARY KEY (id),
    CONSTRAINT network_relationship_participants_chk
        CHECK (buyer_account_id <> supplier_account_id),
    CONSTRAINT network_relationship_kind_chk
        CHECK (relationship_kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_relationship_creator_participant_chk CHECK (
        created_by_tenant_id IN (buyer_tenant_id, supplier_tenant_id)
    ),
    CONSTRAINT network_relationship_range_chk CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT network_relationship_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_relationship_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_relationship_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.network_relationship IS
  'Buyer-to-supplier graph edge. Both tenant coordinates are retained so each participant receives explicit RLS visibility and its own authz.scope_target when required.';

-- Supplier-owned exchange catalog. Catalog identity remains in the Mesh
-- exchange domain because published offers intentionally cross tenant
-- boundaries through network relationships and explicit audiences.
CREATE TABLE mesh.catalog (
    id                 uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                      NOT NULL,
    owner_account_id   uuid                      NOT NULL,
    code               text                      NOT NULL,
    name               text                      NOT NULL,
    catalog_kind       mesh.catalog_kind_d       NOT NULL DEFAULT 'mixed',
    visibility         mesh.catalog_visibility_d NOT NULL DEFAULT 'private',
    valid_from         date,
    valid_until        date,
    published_at       timestamptz,
    published_by       uuid,
    metadata           jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status             mesh.catalog_status_d     NOT NULL DEFAULT 'draft',
    is_active          boolean GENERATED ALWAYS AS (status = 'published') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz               NOT NULL DEFAULT now(),
    created_by         uuid                      NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_owner_id_uq UNIQUE (tenant_id, owner_account_id, id),
    CONSTRAINT catalog_code_uq UNIQUE (tenant_id, owner_account_id, code),
    CONSTRAINT catalog_code_fmt_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT catalog_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT catalog_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_publication_evidence_chk CHECK (
        (published_at IS NULL) = (published_by IS NULL)
        AND (status <> 'published' OR published_at IS NOT NULL)
    ),
    CONSTRAINT catalog_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.catalog IS
  'Supplier-owned exchange catalog. Buyers receive published revisions through relationship and audience visibility; the row is never a Neon product or item.';

CREATE TABLE mesh.catalog_item (
    id                        uuid                       NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                       NOT NULL,
    owner_account_id          uuid                       NOT NULL,
    catalog_id                uuid                       NOT NULL,
    code                      text                       NOT NULL,
    name                      text                       NOT NULL,
    description               text,
    item_kind                 mesh.catalog_item_kind_d   NOT NULL DEFAULT 'good',
    base_uom_code             text                       NOT NULL,
    manufacturer_name         text,
    manufacturer_part_number text,
    brand_name                text,
    metadata                  jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    status                    mesh.catalog_item_status_d NOT NULL DEFAULT 'draft',
    is_active                 boolean GENERATED ALWAYS AS (status = 'published') STORED,
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                NOT NULL DEFAULT now(),
    created_by                uuid                       NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT catalog_item_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_owner_id_uq
        UNIQUE (tenant_id, owner_account_id, id),
    CONSTRAINT catalog_item_code_uq
        UNIQUE (tenant_id, catalog_id, code),
    CONSTRAINT catalog_item_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT catalog_item_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT catalog_item_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT catalog_item_manufacturer_chk CHECK (
        manufacturer_name IS NULL OR btrim(manufacturer_name) <> ''
    ),
    CONSTRAINT catalog_item_manufacturer_part_chk CHECK (
        manufacturer_part_number IS NULL
        OR btrim(manufacturer_part_number) <> ''
    ),
    CONSTRAINT catalog_item_brand_chk
        CHECK (brand_name IS NULL OR btrim(brand_name) <> ''),
    CONSTRAINT catalog_item_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.catalog_item IS
  'Supplier offer identity inside one Mesh catalog. Purchasers map an approved offer to their plane-local Neon master.item.';

CREATE TABLE mesh.catalog_item_identifier (
    id                 uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                             NOT NULL,
    owner_account_id   uuid                             NOT NULL,
    catalog_item_id    uuid                             NOT NULL,
    identifier_scheme  mesh.catalog_identifier_scheme_d NOT NULL,
    identifier_value   text                             NOT NULL,
    issuing_authority  text,
    is_primary         boolean                          NOT NULL DEFAULT false,
    verified_at        timestamptz,
    metadata           jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status             mesh.network_reference_status_d NOT NULL DEFAULT 'active',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                      NOT NULL DEFAULT now(),
    created_by         uuid                             NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_item_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_identifier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_identifier_coordinate_uq UNIQUE (
        tenant_id,
        owner_account_id,
        identifier_scheme,
        identifier_value
    ),
    CONSTRAINT catalog_item_identifier_value_chk
        CHECK (btrim(identifier_value) <> ''),
    CONSTRAINT catalog_item_identifier_authority_chk
        CHECK (issuing_authority IS NULL OR btrim(issuing_authority) <> ''),
    CONSTRAINT catalog_item_identifier_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_identifier_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_identifier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.catalog_item_classification (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    owner_account_id   uuid        NOT NULL,
    catalog_item_id    uuid        NOT NULL,
    commodity_code_id  uuid        NOT NULL,
    is_primary         boolean     NOT NULL DEFAULT false,
    confidence         numeric(5,2),
    provenance         text        NOT NULL DEFAULT 'supplier',
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status             text        NOT NULL DEFAULT 'active',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_item_classification_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_classification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_classification_coordinate_uq
        UNIQUE (tenant_id, catalog_item_id, commodity_code_id),
    CONSTRAINT catalog_item_classification_confidence_chk
        CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT catalog_item_classification_provenance_chk
        CHECK (provenance IN ('supplier', 'verified', 'inferred', 'manual')),
    CONSTRAINT catalog_item_classification_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT catalog_item_classification_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_classification_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_classification_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.catalog_item_uom (
    id                   uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid          NOT NULL,
    owner_account_id     uuid          NOT NULL,
    catalog_item_id      uuid          NOT NULL,
    order_uom_code       text          NOT NULL,
    base_quantity        numeric(18,8) NOT NULL,
    order_quantity       numeric(18,8) NOT NULL DEFAULT 1,
    minimum_order_qty    numeric(18,6),
    order_multiple       numeric(18,6),
    is_default_order_uom boolean       NOT NULL DEFAULT false,
    metadata             jsonb         NOT NULL DEFAULT '{}'::jsonb,
    status               text          NOT NULL DEFAULT 'active',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    created_by           uuid          NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT catalog_item_uom_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_item_uom_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_item_uom_owner_id_uq
        UNIQUE (tenant_id, owner_account_id, id),
    CONSTRAINT catalog_item_uom_coordinate_uq
        UNIQUE (tenant_id, catalog_item_id, order_uom_code),
    CONSTRAINT catalog_item_uom_conversion_chk
        CHECK (base_quantity > 0 AND order_quantity > 0),
    CONSTRAINT catalog_item_uom_order_chk CHECK (
        (minimum_order_qty IS NULL OR minimum_order_qty > 0)
        AND (order_multiple IS NULL OR order_multiple > 0)
    ),
    CONSTRAINT catalog_item_uom_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT catalog_item_uom_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_item_uom_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_item_uom_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN mesh.catalog_item_uom.base_quantity IS
  'Base-UOM quantity represented by order_quantity units of order_uom_code.';

CREATE TABLE mesh.catalog_audience (
    id                       uuid                           NOT NULL DEFAULT shared.uuidv7(),
    supplier_tenant_id       uuid                           NOT NULL,
    supplier_account_id      uuid                           NOT NULL,
    catalog_id               uuid                           NOT NULL,
    buyer_tenant_id          uuid                           NOT NULL,
    buyer_account_id         uuid                           NOT NULL,
    network_relationship_id  uuid                           NOT NULL,
    access_kind              mesh.catalog_audience_access_d NOT NULL DEFAULT 'view',
    valid_from               date,
    valid_until              date,
    metadata                 jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                   text                           NOT NULL DEFAULT 'active',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                    NOT NULL DEFAULT now(),
    created_by               uuid                           NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT catalog_audience_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_audience_supplier_id_uq
        UNIQUE (supplier_tenant_id, id),
    CONSTRAINT catalog_audience_coordinate_uq UNIQUE (
        supplier_tenant_id,
        catalog_id,
        buyer_account_id,
        access_kind
    ),
    CONSTRAINT catalog_audience_participants_chk
        CHECK (supplier_account_id <> buyer_account_id),
    CONSTRAINT catalog_audience_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_audience_status_chk
        CHECK (status IN ('active', 'inactive', 'revoked', 'expired')),
    CONSTRAINT catalog_audience_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_audience_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_audience_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.catalog_audience IS
  'Explicit buyer access to a supplier publication. Required for relationship-private and contract catalogs.';

CREATE TABLE mesh.catalog_price (
    id                       uuid                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                      NOT NULL,
    owner_account_id         uuid                      NOT NULL,
    catalog_item_id          uuid                      NOT NULL,
    catalog_item_uom_id      uuid,
    price_type               mesh.catalog_price_type_d NOT NULL DEFAULT 'list',
    network_relationship_id  uuid,
    unit_price               numeric(18,6)             NOT NULL,
    price_unit               numeric(18,6)             NOT NULL DEFAULT 1,
    currency_code            character(3)              NOT NULL,
    minimum_quantity         numeric(18,6),
    maximum_quantity         numeric(18,6),
    effective_from           date                      NOT NULL DEFAULT CURRENT_DATE,
    effective_until          date,
    metadata                 jsonb                     NOT NULL DEFAULT '{}'::jsonb,
    status                   text                      NOT NULL DEFAULT 'active',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz               NOT NULL DEFAULT now(),
    created_by               uuid                      NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT catalog_price_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_price_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_price_relationship_chk CHECK (
        (price_type IN ('relationship', 'contract'))
        = (network_relationship_id IS NOT NULL)
    ),
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
        CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT catalog_price_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT catalog_price_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_price_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_price_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.catalog_availability (
    id                 uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid         NOT NULL,
    owner_account_id   uuid         NOT NULL,
    catalog_item_id    uuid         NOT NULL,
    country_code       character(2) NOT NULL,
    state_region_code  text,
    postal_pattern     text,
    available_from     date,
    available_until    date,
    is_available       boolean      NOT NULL DEFAULT true,
    lead_time_days     integer,
    notes              text,
    metadata           jsonb        NOT NULL DEFAULT '{}'::jsonb,
    status             text         NOT NULL DEFAULT 'active',
    is_active          boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    created_by         uuid         NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT catalog_availability_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_availability_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_availability_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id,
        catalog_item_id,
        country_code,
        state_region_code,
        postal_pattern
    ),
    CONSTRAINT catalog_availability_range_chk CHECK (
        available_until IS NULL
        OR available_from IS NULL
        OR available_until >= available_from
    ),
    CONSTRAINT catalog_availability_lead_time_chk
        CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    CONSTRAINT catalog_availability_postal_chk
        CHECK (postal_pattern IS NULL OR btrim(postal_pattern) <> ''),
    CONSTRAINT catalog_availability_notes_chk
        CHECK (notes IS NULL OR btrim(notes) <> ''),
    CONSTRAINT catalog_availability_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT catalog_availability_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_availability_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_availability_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.catalog_availability IS
  'Geographic and temporal availability of an offer; this table never represents supplier warehouse stock.';
