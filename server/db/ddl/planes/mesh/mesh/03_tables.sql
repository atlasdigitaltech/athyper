-- Mesh tenant/account boundary. A network account belongs to one administrative
-- tenant; a relationship may join accounts owned by different tenants.

CREATE TABLE mesh.network_account (
    id                uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                          NOT NULL,
    canonical_party_id uuid,
    account_purpose_code text                       NOT NULL DEFAULT 'primary',
    account_code      text                          NOT NULL,
    display_name      text                          NOT NULL,
    legal_name        text,
    network_role      mesh.network_account_role_d   NOT NULL,
    country_code      character(2),
    default_currency  character(3),
    logo_asset_ref    text,
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
    CONSTRAINT network_account_purpose_chk
        CHECK (account_purpose_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_account_names_chk CHECK (
        btrim(display_name) <> ''
        AND (legal_name IS NULL OR btrim(legal_name) <> '')
    ),
    CONSTRAINT network_account_logo_asset_ref_chk CHECK (
        logo_asset_ref IS NULL
        OR (
            btrim(logo_asset_ref) = logo_asset_ref
            AND length(logo_asset_ref) BETWEEN 2 AND 1024
            AND logo_asset_ref ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$'
            AND logo_asset_ref !~ '(^|/)\.\.(/|$)'
        )
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
  'Mesh exchange boundary owned by one participant tenant and reconciled to a canonical party. network_role declares buyer, supplier, or both and never replaces tenant_id or grants user access.';

COMMENT ON COLUMN mesh.network_account.logo_asset_ref IS
  'Optional same-origin managed logo path for buyer or supplier account presentation.';

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

CREATE TABLE mesh.document_envelope (
    id                       uuid                            NOT NULL DEFAULT shared.uuidv7(),
    envelope_code            text                            NOT NULL,
    network_relationship_id  uuid                            NOT NULL,
    document_type_id         uuid                            NOT NULL,
    document_direction       mesh.document_direction_d       NOT NULL,
    sender_tenant_id         uuid                            NOT NULL,
    sender_account_id        uuid                            NOT NULL,
    receiver_tenant_id       uuid                            NOT NULL,
    receiver_account_id      uuid                            NOT NULL,
    entity_id                uuid                            NOT NULL,
    entity_version_id        uuid                            NOT NULL,
    entity_contract_hash     text                            NOT NULL,
    business_key             text,
    correlation_id           text,
    idempotency_key          text                            NOT NULL,
    status                   mesh.document_envelope_status_d NOT NULL DEFAULT 'received',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    received_at              timestamptz                     NOT NULL DEFAULT now(),
    processed_at             timestamptz,
    metadata                 jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz                     NOT NULL DEFAULT now(),
    created_by               uuid                            NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT document_envelope_pkey PRIMARY KEY (id),
    CONSTRAINT document_envelope_code_uq UNIQUE (envelope_code),
    CONSTRAINT document_envelope_idempotency_uq
        UNIQUE (sender_tenant_id, sender_account_id, idempotency_key),
    CONSTRAINT document_envelope_participant_chk
        CHECK (sender_account_id <> receiver_account_id),
    CONSTRAINT document_envelope_code_chk
        CHECK (envelope_code ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,126}$'),
    CONSTRAINT document_envelope_business_key_chk
        CHECK (business_key IS NULL OR btrim(business_key) <> ''),
    CONSTRAINT document_envelope_correlation_chk
        CHECK (correlation_id IS NULL OR btrim(correlation_id) <> ''),
    CONSTRAINT document_envelope_idempotency_chk
        CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT document_envelope_contract_hash_chk
        CHECK (entity_contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT document_envelope_processing_chk CHECK (
        (processed_at IS NULL)
        OR (processed_at >= received_at AND status IN (
            'accepted', 'rejected', 'routed', 'failed', 'archived'
        ))
    ),
    CONSTRAINT document_envelope_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_envelope_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT document_envelope_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.document_envelope IS
  'Cross-tenant exchange header. It freezes the resolved Entity version and contract hash so validation and replay never drift with later Entity Studio publications.';

CREATE TABLE mesh.document_payload (
    id                 uuid                                NOT NULL DEFAULT shared.uuidv7(),
    envelope_id        uuid                                NOT NULL,
    payload_role       mesh.document_payload_role_d        NOT NULL DEFAULT 'primary',
    sequence_no        integer                             NOT NULL DEFAULT 1,
    storage_uri        text                                NOT NULL,
    payload_hash       text                                NOT NULL,
    content_type       text                                NOT NULL,
    size_bytes         bigint                              NOT NULL,
    scan_status        mesh.document_payload_scan_status_d NOT NULL DEFAULT 'pending',
    scanned_at         timestamptz,
    retention_until    timestamptz,
    metadata           jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    status             mesh.document_payload_status_d      NOT NULL DEFAULT 'active',
    created_at         timestamptz                         NOT NULL DEFAULT now(),
    created_by_tenant_id uuid                               NOT NULL,
    created_by         uuid                                NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT document_payload_pkey PRIMARY KEY (id),
    CONSTRAINT document_payload_coordinate_uq
        UNIQUE (envelope_id, payload_role, sequence_no),
    CONSTRAINT document_payload_sequence_chk CHECK (sequence_no > 0),
    CONSTRAINT document_payload_storage_uri_chk CHECK (btrim(storage_uri) <> ''),
    CONSTRAINT document_payload_hash_chk CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT document_payload_content_type_chk CHECK (btrim(content_type) <> ''),
    CONSTRAINT document_payload_size_chk CHECK (size_bytes >= 0),
    CONSTRAINT document_payload_scan_pair_chk CHECK (
        (scan_status = 'pending' AND scanned_at IS NULL)
        OR (scan_status <> 'pending' AND scanned_at IS NOT NULL)
    ),
    CONSTRAINT document_payload_retention_chk
        CHECK (retention_until IS NULL OR retention_until > created_at),
    CONSTRAINT document_payload_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_payload_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.document_event (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    envelope_id        uuid        NOT NULL,
    event_code         text        NOT NULL,
    actor_tenant_id    uuid,
    actor_account_id   uuid,
    actor_principal_id uuid,
    idempotency_key    text,
    event_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by_tenant_id uuid      NOT NULL,
    created_by         uuid        NOT NULL,

    CONSTRAINT document_event_pkey PRIMARY KEY (id),
    CONSTRAINT document_event_code_chk
        CHECK (event_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT document_event_actor_pair_chk CHECK (
        (actor_tenant_id IS NULL) = (actor_account_id IS NULL)
    ),
    CONSTRAINT document_event_actor_principal_chk CHECK (
        actor_principal_id IS NULL OR actor_tenant_id IS NOT NULL
    ),
    CONSTRAINT document_event_idempotency_chk
        CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
    CONSTRAINT document_event_payload_object_chk
        CHECK (jsonb_typeof(event_payload) = 'object'),
    CONSTRAINT document_event_time_chk CHECK (occurred_at <= created_at)
);

CREATE TABLE mesh.document_acknowledgement (
    id                   uuid                       NOT NULL DEFAULT shared.uuidv7(),
    envelope_id          uuid                       NOT NULL,
    acknowledgement_type mesh.document_ack_type_d   NOT NULL,
    status               mesh.document_ack_status_d NOT NULL,
    responder_tenant_id  uuid                       NOT NULL,
    responder_account_id uuid                       NOT NULL,
    responder_principal_id uuid,
    acknowledgement_code text,
    message              text,
    idempotency_key      text                       NOT NULL,
    acknowledged_at      timestamptz                NOT NULL DEFAULT now(),
    metadata             jsonb                      NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz                NOT NULL DEFAULT now(),
    created_by           uuid                       NOT NULL,

    CONSTRAINT document_acknowledgement_pkey PRIMARY KEY (id),
    CONSTRAINT document_acknowledgement_idempotency_uq
        UNIQUE (envelope_id, responder_account_id, idempotency_key),
    CONSTRAINT document_acknowledgement_code_chk CHECK (
        acknowledgement_code IS NULL
        OR acknowledgement_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'
    ),
    CONSTRAINT document_acknowledgement_message_chk
        CHECK (message IS NULL OR btrim(message) <> ''),
    CONSTRAINT document_acknowledgement_idempotency_chk
        CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT document_acknowledgement_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT document_acknowledgement_time_chk
        CHECK (acknowledged_at <= created_at)
);

-- Mesh-owned participant profile and bank foundation.
-- Cross-plane publication/projection/onboarding is intentionally parked.

CREATE TABLE mesh.network_account_profile (
    id                       uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                          NOT NULL,
    network_account_id       uuid                          NOT NULL,
    legal_form               text,
    incorporation_date       date,
    website_url              text,
    description              text,
    preferred_language_code  text,
    profile_completeness_pct smallint                      NOT NULL DEFAULT 0,
    metadata                 jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.network_profile_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                   NOT NULL DEFAULT now(),
    created_by               uuid                          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT network_account_profile_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_profile_account_uq UNIQUE (tenant_id, network_account_id),
    CONSTRAINT network_account_profile_legal_form_chk
        CHECK (legal_form IS NULL OR btrim(legal_form) <> ''),
    CONSTRAINT network_account_profile_website_chk
        CHECK (website_url IS NULL OR (
            length(website_url) <= 2048 AND website_url ~* '^https?://'
        )),
    CONSTRAINT network_account_profile_description_chk
        CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT network_account_profile_language_chk
        CHECK (preferred_language_code IS NULL OR
               preferred_language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
    CONSTRAINT network_account_profile_completeness_chk
        CHECK (profile_completeness_pct BETWEEN 0 AND 100),
    CONSTRAINT network_account_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 16384),
    CONSTRAINT network_account_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_account_commodity_capability (
    id                  uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                         NOT NULL,
    network_account_id  uuid                         NOT NULL,
    commodity_code_id   uuid                         NOT NULL,
    trade_role          mesh.trade_role_d            NOT NULL,
    effective_from      date                         NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    notes               text,
    metadata            jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status              mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                  NOT NULL DEFAULT now(),
    created_by          uuid                         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT network_account_commodity_capability_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_commodity_capability_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_commodity_capability_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT network_account_commodity_capability_notes_chk
        CHECK (notes IS NULL OR length(notes) <= 2000),
    CONSTRAINT network_account_commodity_capability_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_commodity_capability_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_commodity_capability_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.network_account_tax_registration (
    id                     uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                         NOT NULL,
    network_account_id     uuid                         NOT NULL,
    country_code           character(2)                 NOT NULL,
    registration_type_code text                         NOT NULL,
    registration_number    text                         NOT NULL,
    issuing_authority      text,
    effective_from         date,
    effective_until        date,
    is_primary             boolean                      NOT NULL DEFAULT false,
    verified_at            timestamptz,
    verified_by            uuid,
    metadata               jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                 mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                  NOT NULL DEFAULT now(),
    created_by             uuid                         NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT network_account_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT network_account_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT network_account_tax_registration_type_chk
        CHECK (registration_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_account_tax_registration_number_chk
        CHECK (btrim(registration_number) <> '' AND length(registration_number) <= 128),
    CONSTRAINT network_account_tax_registration_authority_chk
        CHECK (issuing_authority IS NULL OR btrim(issuing_authority) <> ''),
    CONSTRAINT network_account_tax_registration_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT network_account_tax_registration_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT network_account_tax_registration_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_account_tax_registration_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_account_tax_registration_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_party (
    id                       uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                         NOT NULL,
    code                     text                         NOT NULL,
    name                     text                         NOT NULL,
    country_code             character(2)                 NOT NULL,
    institution_type         mesh.bank_institution_type_d NOT NULL DEFAULT 'bank',
    bic                      text,
    national_bank_code_type  text,
    national_bank_code       text,
    branch_code              text,
    branch_name              text,
    supports_swift           boolean                      NOT NULL DEFAULT false,
    supports_local_clearing  boolean                      NOT NULL DEFAULT false,
    supports_sepa            boolean                      NOT NULL DEFAULT false,
    supports_ach             boolean                      NOT NULL DEFAULT false,
    metadata                 jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.profile_record_status_d NOT NULL DEFAULT 'active',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                  NOT NULL DEFAULT now(),
    created_by               uuid                         NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT mesh_bank_party_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_party_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_party_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT mesh_bank_party_code_chk CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mesh_bank_party_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT mesh_bank_party_bic_chk
        CHECK (bic IS NULL OR bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_party_national_code_pair_chk
        CHECK ((national_bank_code_type IS NULL) = (national_bank_code IS NULL)),
    CONSTRAINT mesh_bank_party_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_party_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT mesh_bank_party_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_account (
    id                   uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                            NOT NULL,
    network_account_id   uuid                            NOT NULL,
    code                 text,
    name                 text,
    bank_party_id        uuid,
    account_holder_name  text                            NOT NULL,
    account_id_type      mesh.bank_account_id_type_d     NOT NULL,
    account_id_value     text                            NOT NULL,
    account_last4        text                            NOT NULL,
    currency_code        character(3)                    NOT NULL,
    bic_override         text,
    bank_name_override   text,
    bank_country_override character(2),
    provider_account_ref text,
    is_verified          boolean                         NOT NULL DEFAULT false,
    verified_at          timestamptz,
    verified_by          uuid,
    verification_method  mesh.bank_verification_method_d,
    metadata             jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status               mesh.bank_account_status_d      NOT NULL DEFAULT 'pending_verification',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                     NOT NULL DEFAULT now(),
    created_by           uuid                            NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT mesh_bank_account_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_account_owner_id_uq UNIQUE (tenant_id, network_account_id, id),
    CONSTRAINT mesh_bank_account_code_chk
        CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT mesh_bank_account_name_chk CHECK (name IS NULL OR btrim(name) <> ''),
    CONSTRAINT mesh_bank_account_holder_chk CHECK (btrim(account_holder_name) <> ''),
    CONSTRAINT mesh_bank_account_identifier_chk
        CHECK (account_id_value ~ '^[A-Z0-9]{4,64}$'),
    CONSTRAINT mesh_bank_account_last4_chk
        CHECK (account_last4 ~ '^[A-Z0-9]{4}$'
               AND account_last4 = right(account_id_value, 4)),
    CONSTRAINT mesh_bank_account_bank_identity_chk CHECK (
        (bank_party_id IS NOT NULL
         AND bank_name_override IS NULL AND bank_country_override IS NULL)
        OR
        (bank_party_id IS NULL
         AND nullif(btrim(bank_name_override), '') IS NOT NULL
         AND bank_country_override IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_account_bic_chk
        CHECK (bic_override IS NULL
               OR bic_override ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT mesh_bank_account_verification_chk CHECK (
        (NOT is_verified AND verified_at IS NULL AND verified_by IS NULL
         AND verification_method IS NULL)
        OR
        (is_verified AND verified_at IS NOT NULL AND verified_by IS NOT NULL
         AND verification_method IS NOT NULL)
    ),
    CONSTRAINT mesh_bank_account_active_chk CHECK (status <> 'active' OR is_verified),
    CONSTRAINT mesh_bank_account_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT mesh_bank_account_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON COLUMN mesh.bank_account.account_id_value IS
  'Sensitive normalized identifier. athyperapp receives no direct SELECT privilege on this column.';

CREATE TABLE mesh.bank_account_link (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    network_account_id uuid        NOT NULL,
    bank_account_id    uuid        NOT NULL,
    purpose            text        NOT NULL DEFAULT 'settlement',
    is_primary         boolean     NOT NULL DEFAULT false,
    effective_from     date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until    date,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT mesh_bank_account_link_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_bank_account_link_purpose_chk
        CHECK (purpose IN ('settlement', 'refund')),
    CONSTRAINT mesh_bank_account_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_bank_account_link_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE mesh.bank_account_disclosure (
    id                       uuid                          NOT NULL DEFAULT shared.uuidv7(),
    owner_tenant_id          uuid                          NOT NULL,
    owner_account_id         uuid                          NOT NULL,
    bank_account_id          uuid                          NOT NULL,
    network_relationship_id  uuid                          NOT NULL,
    recipient_tenant_id      uuid                          NOT NULL,
    recipient_account_id     uuid                          NOT NULL,
    purpose                  text                          NOT NULL DEFAULT 'settlement',
    disclosed_at             timestamptz                   NOT NULL DEFAULT now(),
    disclosed_by             uuid                          NOT NULL,
    expires_at               timestamptz,
    revoked_at               timestamptz,
    revoked_by               uuid,
    revocation_reason        text,
    metadata                 jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                   mesh.bank_disclosure_status_d NOT NULL DEFAULT 'active',
    created_at               timestamptz                   NOT NULL DEFAULT now(),
    created_by               uuid                          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT bank_account_disclosure_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_disclosure_parties_chk
        CHECK (owner_account_id <> recipient_account_id),
    CONSTRAINT bank_account_disclosure_purpose_chk
        CHECK (purpose IN ('settlement', 'refund')),
    CONSTRAINT bank_account_disclosure_expiry_chk
        CHECK (expires_at IS NULL OR expires_at > disclosed_at),
    CONSTRAINT bank_account_disclosure_revocation_chk CHECK (
        (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_by IS NOT NULL
         AND nullif(btrim(revocation_reason), '') IS NOT NULL)
    ),
    CONSTRAINT bank_account_disclosure_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096),
    CONSTRAINT bank_account_disclosure_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Mesh projection of the Neon-derived party finance/compliance optional pack.
-- The reusable core is tenant/owner scoped; Mesh deliberately omits Neon-only
-- company_code_id and site_id extensions.

CREATE TABLE mesh.certification_type (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  issuing_body text,
  category text,
  description text,
  is_custom boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT mesh_certification_type_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.certification_type IS
  'ARCHETYPE=A;SCOPE=P+T. Mesh certification registry. NULL tenant_id is a reusable platform standard; non-NULL is tenant custom.';

CREATE TABLE mesh.certification (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  certification_type_id uuid,
  custom_name text,
  certificate_number text,
  certified_by text,
  certified_location text,
  additional_info text,
  document_attachment_id uuid,
  effective_from date,
  effective_until date,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT mesh_certification_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  CONSTRAINT mesh_certification_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE mesh.certification IS
  'ARCHETYPE=B;SCOPE=T. Mesh certification attached polymorphically to a network account or another Mesh owner.';
COMMENT ON COLUMN mesh.certification.owner_type IS
  'Use network_account for participant certifications; other Mesh owner types require an owning service contract.';
COMMENT ON COLUMN mesh.certification.document_attachment_id IS
  'Optional document attachment identifier resolved by the Mesh document service.';


CREATE TABLE mesh.network_lifecycle_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    resource_kind text NOT NULL,
    resource_id uuid NOT NULL,
    owner_tenant_id uuid NOT NULL,
    counterparty_tenant_id uuid,
    sequence_no bigint NOT NULL,
    event_kind text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    reason text,
    correlation_id uuid,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    recorded_by uuid NOT NULL,
    CONSTRAINT network_lifecycle_event_pkey PRIMARY KEY(id),
    CONSTRAINT network_lifecycle_event_coordinate_uq UNIQUE(resource_kind,resource_id,sequence_no),
    CONSTRAINT network_lifecycle_event_kind_chk CHECK(resource_kind IN ('network_account','network_relationship')),
    CONSTRAINT network_lifecycle_event_sequence_chk CHECK(sequence_no>=1),
    CONSTRAINT network_lifecycle_event_event_chk CHECK(event_kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_lifecycle_event_status_chk CHECK(btrim(to_status)<>'' AND from_status IS DISTINCT FROM to_status),
    CONSTRAINT network_lifecycle_event_reason_chk CHECK(reason IS NULL OR (btrim(reason)<>'' AND length(reason)<=2000)),
    CONSTRAINT network_lifecycle_event_evidence_chk CHECK(jsonb_typeof(evidence)='object')
);
COMMENT ON TABLE mesh.network_lifecycle_event IS 'Append-only BNA and buyer-supplier relationship lifecycle evidence visible to the owning and participating tenants through Mesh RLS.';
