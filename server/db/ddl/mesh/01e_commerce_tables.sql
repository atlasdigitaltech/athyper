-- ============================================================================
-- mesh/01e_commerce_tables.sql
-- Concept: Mesh network commerce tables for supplier coverage, catalog, and
--          logistics pricing.
-- Depends on: mesh/01_tables.sql, mesh/01a_foundation_tables.sql,
--             mesh/01b_participant_profile_tables.sql, shared/01_tables.sql
-- ============================================================================
-- Scope rule:
--   This slice does not duplicate participant/profile/bank/contact tables.
--   It adds only the missing network commerce structures that sit beside the
--   existing Mesh participant account model.

CREATE TABLE IF NOT EXISTS mesh.bank_account_disclosure (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code                text        NOT NULL,
    bank_account_id             uuid        NOT NULL,
    connection_id               uuid        NOT NULL,
    disclosed_to_account_code   text        NOT NULL,
    purpose                     text        NOT NULL DEFAULT 'settlement',
    disclosed_at                timestamptz NOT NULL DEFAULT now(),
    disclosed_by                text        NOT NULL DEFAULT 'system',
    expires_at                  timestamptz,
    revoked_at                  timestamptz,
    revoked_by                  text,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT 'system',
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT mesh_bank_account_disclosure_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_bank_account_disclosure_purpose_chk CHECK (btrim(purpose) <> ''),
    CONSTRAINT mesh_bank_account_disclosure_not_self_chk CHECK (disclosed_to_account_code <> account_code),
    CONSTRAINT mesh_bank_account_disclosure_expiry_chk CHECK (
        expires_at IS NULL OR expires_at > disclosed_at
    ),
    CONSTRAINT mesh_bank_account_disclosure_revoked_pair_chk CHECK (
        (revoked_at IS NULL) = (revoked_by IS NULL)
    ),
    CONSTRAINT mesh_bank_account_disclosure_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_bank_account_disclosure_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_bank_account_disclosure_bank_fk FOREIGN KEY (account_code, bank_account_id)
        REFERENCES mesh.bank_account (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_bank_account_disclosure_connection_fk FOREIGN KEY (connection_id)
        REFERENCES mesh.network_relationship (id) ON DELETE CASCADE,
    CONSTRAINT mesh_bank_account_disclosure_disclosed_to_fk FOREIGN KEY (disclosed_to_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh.bank_account_disclosure IS
    'Explicit disclosure grant for exposing one bank account to one connected Mesh counterparty.';

CREATE TABLE IF NOT EXISTS mesh.supplier_service_coverage (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    country_code        character(2) NOT NULL,
    state_region_code   text,
    coverage_type       text        NOT NULL,
    lead_time_days      integer,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_supplier_service_coverage_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_supplier_service_coverage_uq UNIQUE NULLS NOT DISTINCT (
        account_code, country_code, state_region_code, coverage_type
    ),
    CONSTRAINT mesh_supplier_service_coverage_type_chk CHECK (
        coverage_type IN ('delivery', 'service', 'manufacturing', 'customs')
    ),
    CONSTRAINT mesh_supplier_service_coverage_lead_time_chk CHECK (
        lead_time_days IS NULL OR lead_time_days >= 0
    ),
    CONSTRAINT mesh_supplier_service_coverage_temporal_chk CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT mesh_supplier_service_coverage_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_supplier_service_coverage_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_supplier_service_coverage_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_supplier_service_coverage_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_supplier_service_coverage_region_fk FOREIGN KEY (country_code, state_region_code)
        REFERENCES shared.state_region (country_code, code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh.supplier_service_coverage IS
    'Countries/regions where a supplier account can deliver, service, manufacture, or clear customs.';

CREATE TABLE IF NOT EXISTS mesh.supplier_commodity_capability (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    domain_code         text        NOT NULL,
    commodity_code      text        NOT NULL,
    capability_level    text        NOT NULL DEFAULT 'approved',
    verified_at         timestamptz,
    verified_by         text,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_supplier_commodity_capability_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_supplier_commodity_capability_uq UNIQUE (account_code, domain_code, commodity_code),
    CONSTRAINT mesh_supplier_commodity_capability_level_chk CHECK (
        capability_level IN ('approved', 'preferred', 'restricted')
    ),
    CONSTRAINT mesh_supplier_commodity_capability_verified_pair_chk CHECK (
        (verified_at IS NULL) = (verified_by IS NULL)
    ),
    CONSTRAINT mesh_supplier_commodity_capability_temporal_chk CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT mesh_supplier_commodity_capability_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_supplier_commodity_capability_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_supplier_commodity_capability_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_supplier_commodity_capability_commodity_fk FOREIGN KEY (domain_code, commodity_code)
        REFERENCES shared.commodity_code (domain_code, code) ON DELETE RESTRICT
);

COMMENT ON TABLE mesh.supplier_commodity_capability IS
    'Commodity classifications a supplier account can supply on the Mesh network.';

CREATE TABLE IF NOT EXISTS mesh.supplier_profile_verification (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    verification_type   text        NOT NULL,
    verifier_source     text        NOT NULL,
    evidence_uri        text,
    outcome             text        NOT NULL,
    valid_from          date,
    valid_until         date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_supplier_profile_verification_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_supplier_profile_verification_type_chk CHECK (btrim(verification_type) <> ''),
    CONSTRAINT mesh_supplier_profile_verification_source_chk CHECK (btrim(verifier_source) <> ''),
    CONSTRAINT mesh_supplier_profile_verification_outcome_chk CHECK (
        outcome IN ('pending', 'verified', 'rejected', 'expired')
    ),
    CONSTRAINT mesh_supplier_profile_verification_temporal_chk CHECK (
        valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
    ),
    CONSTRAINT mesh_supplier_profile_verification_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_supplier_profile_verification_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh.supplier_profile_verification IS
    'Verification evidence and outcome records for Mesh supplier profile facts.';

CREATE TABLE IF NOT EXISTS mesh.catalog (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text        NOT NULL,
    catalog_code    text        NOT NULL,
    catalog_name    text        NOT NULL,
    catalog_type    text        NOT NULL DEFAULT 'mixed',
    visibility      text        NOT NULL DEFAULT 'private',
    published_at    timestamptz,
    valid_from      date,
    valid_until     date,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'draft',
    is_active       boolean     GENERATED ALWAYS AS (status = 'published') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_catalog_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_catalog_code_uq UNIQUE (account_code, catalog_code),
    CONSTRAINT mesh_catalog_code_chk CHECK (catalog_code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_catalog_name_chk CHECK (btrim(catalog_name) <> ''),
    CONSTRAINT mesh_catalog_type_chk CHECK (catalog_type IN ('product', 'service', 'mixed')),
    CONSTRAINT mesh_catalog_visibility_chk CHECK (visibility IN ('private', 'connected', 'open')),
    CONSTRAINT mesh_catalog_status_chk CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
    CONSTRAINT mesh_catalog_published_chk CHECK (status <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT mesh_catalog_temporal_chk CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT mesh_catalog_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

COMMENT ON TABLE mesh.catalog IS
    'Supplier-owned published product/service catalog for the Mesh network.';

CREATE TABLE IF NOT EXISTS mesh.catalog_item (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    catalog_id          uuid        NOT NULL,
    item_code           text        NOT NULL,
    item_name           text        NOT NULL,
    item_type           text        NOT NULL DEFAULT 'product',
    base_uom_code       text        NOT NULL,
    description         text,
    manufacturer_name   text,
    external_item_ref   text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'draft',
    is_active           boolean     GENERATED ALWAYS AS (status = 'published') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_catalog_item_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_item_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_catalog_item_code_uq UNIQUE (account_code, catalog_id, item_code),
    CONSTRAINT mesh_catalog_item_code_chk CHECK (btrim(item_code) <> ''),
    CONSTRAINT mesh_catalog_item_name_chk CHECK (btrim(item_name) <> ''),
    CONSTRAINT mesh_catalog_item_type_chk CHECK (item_type IN ('product', 'service', 'digital')),
    CONSTRAINT mesh_catalog_item_status_chk CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
    CONSTRAINT mesh_catalog_item_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_item_catalog_fk FOREIGN KEY (account_code, catalog_id)
        REFERENCES mesh.catalog (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_item_uom_fk FOREIGN KEY (base_uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.catalog_item_classification (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    catalog_item_id     uuid        NOT NULL,
    domain_code         text        NOT NULL,
    commodity_code      text        NOT NULL,
    is_primary          boolean     NOT NULL DEFAULT false,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_catalog_item_classification_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_item_classification_uq UNIQUE (
        account_code, catalog_item_id, domain_code, commodity_code
    ),
    CONSTRAINT mesh_catalog_item_classification_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_item_classification_item_fk FOREIGN KEY (account_code, catalog_item_id)
        REFERENCES mesh.catalog_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_item_classification_commodity_fk FOREIGN KEY (domain_code, commodity_code)
        REFERENCES shared.commodity_code (domain_code, code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.catalog_item_uom (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    catalog_item_id     uuid        NOT NULL,
    uom_code            text        NOT NULL,
    conversion_factor   numeric(18,8) NOT NULL DEFAULT 1,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_catalog_item_uom_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_item_uom_uq UNIQUE (account_code, catalog_item_id, uom_code),
    CONSTRAINT mesh_catalog_item_uom_factor_chk CHECK (conversion_factor > 0),
    CONSTRAINT mesh_catalog_item_uom_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_item_uom_item_fk FOREIGN KEY (account_code, catalog_item_id)
        REFERENCES mesh.catalog_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_item_uom_uom_fk FOREIGN KEY (uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.catalog_price (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    catalog_item_id     uuid        NOT NULL,
    price_type          text        NOT NULL DEFAULT 'list',
    connection_id       uuid,
    unit_price          numeric(18,6) NOT NULL,
    currency_code       character(3) NOT NULL,
    min_qty             numeric(18,6),
    max_qty             numeric(18,6),
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_catalog_price_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_price_type_chk CHECK (price_type IN ('list', 'connection', 'tiered')),
    CONSTRAINT mesh_catalog_price_connection_chk CHECK (
        price_type <> 'connection' OR connection_id IS NOT NULL
    ),
    CONSTRAINT mesh_catalog_price_amount_chk CHECK (unit_price >= 0),
    CONSTRAINT mesh_catalog_price_qty_chk CHECK (
        (min_qty IS NULL OR min_qty >= 0)
        AND (max_qty IS NULL OR max_qty >= 0)
        AND (min_qty IS NULL OR max_qty IS NULL OR max_qty >= min_qty)
    ),
    CONSTRAINT mesh_catalog_price_temporal_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_catalog_price_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_catalog_price_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_price_item_fk FOREIGN KEY (account_code, catalog_item_id)
        REFERENCES mesh.catalog_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_price_connection_fk FOREIGN KEY (connection_id)
        REFERENCES mesh.network_relationship (id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_price_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.catalog_availability (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    catalog_item_id     uuid        NOT NULL,
    country_code        character(2) NOT NULL,
    state_region_code   text,
    is_available        boolean     NOT NULL DEFAULT true,
    notes               text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_catalog_availability_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_catalog_availability_uq UNIQUE NULLS NOT DISTINCT (
        account_code, catalog_item_id, country_code, state_region_code
    ),
    CONSTRAINT mesh_catalog_availability_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_catalog_availability_item_fk FOREIGN KEY (account_code, catalog_item_id)
        REFERENCES mesh.catalog_item (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_catalog_availability_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_catalog_availability_region_fk FOREIGN KEY (country_code, state_region_code)
        REFERENCES shared.state_region (country_code, code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.carrier (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text,
    carrier_code    text        NOT NULL,
    carrier_name    text        NOT NULL,
    carrier_type    text        NOT NULL,
    provider_code   text,
    website_url     text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_carrier_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_carrier_scope_code_uq UNIQUE NULLS NOT DISTINCT (account_code, carrier_code),
    CONSTRAINT mesh_carrier_code_chk CHECK (carrier_code ~ '^[A-Z0-9_-]+$'),
    CONSTRAINT mesh_carrier_name_chk CHECK (btrim(carrier_name) <> ''),
    CONSTRAINT mesh_carrier_type_chk CHECK (
        carrier_type IN ('road', 'sea', 'air', 'rail', 'courier', 'multimodal')
    ),
    CONSTRAINT mesh_carrier_website_chk CHECK (website_url IS NULL OR website_url ~ '^https?://'),
    CONSTRAINT mesh_carrier_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_carrier_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_carrier_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_carrier_provider_fk FOREIGN KEY (provider_code)
        REFERENCES mesh.network_provider (code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.logistics_zone (
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code    text        NOT NULL,
    zone_code       text        NOT NULL,
    zone_name       text        NOT NULL,
    zone_type       text        NOT NULL DEFAULT 'custom',
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text        NOT NULL DEFAULT 'system',
    updated_at      timestamptz,
    updated_by      text,

    CONSTRAINT mesh_logistics_zone_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_logistics_zone_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_logistics_zone_code_uq UNIQUE (account_code, zone_code),
    CONSTRAINT mesh_logistics_zone_code_chk CHECK (zone_code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_logistics_zone_name_chk CHECK (btrim(zone_name) <> ''),
    CONSTRAINT mesh_logistics_zone_type_chk CHECK (zone_type IN ('country', 'region', 'port', 'custom')),
    CONSTRAINT mesh_logistics_zone_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_logistics_zone_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_logistics_zone_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesh.logistics_zone_member (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    zone_id             uuid        NOT NULL,
    country_code        character(2) NOT NULL,
    state_region_code   text,
    port_code           text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_logistics_zone_member_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_logistics_zone_member_uq UNIQUE NULLS NOT DISTINCT (
        account_code, zone_id, country_code, state_region_code, port_code
    ),
    CONSTRAINT mesh_logistics_zone_member_port_chk CHECK (port_code IS NULL OR btrim(port_code) <> ''),
    CONSTRAINT mesh_logistics_zone_member_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_logistics_zone_member_zone_fk FOREIGN KEY (account_code, zone_id)
        REFERENCES mesh.logistics_zone (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_logistics_zone_member_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_zone_member_region_fk FOREIGN KEY (country_code, state_region_code)
        REFERENCES shared.state_region (country_code, code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.logistics_rate (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text        NOT NULL,
    rate_code               text,
    carrier_id              uuid,
    origin_zone_id          uuid        NOT NULL,
    destination_zone_id     uuid        NOT NULL,
    incoterm_code           text        NOT NULL,
    weight_uom_code         text,
    volume_uom_code         text,
    currency_code           character(3) NOT NULL,
    base_rate               numeric(18,6) NOT NULL DEFAULT 0,
    transit_days_min        integer,
    transit_days_max        integer,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text        NOT NULL DEFAULT 'system',
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT mesh_logistics_rate_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_logistics_rate_account_id_uq UNIQUE (account_code, id),
    CONSTRAINT mesh_logistics_rate_code_uq UNIQUE NULLS NOT DISTINCT (account_code, rate_code),
    CONSTRAINT mesh_logistics_rate_code_chk CHECK (rate_code IS NULL OR rate_code ~ '^[a-z][a-z0-9_-]*$'),
    CONSTRAINT mesh_logistics_rate_zones_distinct_chk CHECK (origin_zone_id <> destination_zone_id),
    CONSTRAINT mesh_logistics_rate_incoterm_chk CHECK (
        incoterm_code IN ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF')
    ),
    CONSTRAINT mesh_logistics_rate_amount_chk CHECK (base_rate >= 0),
    CONSTRAINT mesh_logistics_rate_transit_chk CHECK (
        (transit_days_min IS NULL OR transit_days_min >= 0)
        AND (transit_days_max IS NULL OR transit_days_max >= 0)
        AND (transit_days_min IS NULL OR transit_days_max IS NULL OR transit_days_max >= transit_days_min)
    ),
    CONSTRAINT mesh_logistics_rate_temporal_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_logistics_rate_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT mesh_logistics_rate_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_logistics_rate_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE CASCADE,
    CONSTRAINT mesh_logistics_rate_carrier_fk FOREIGN KEY (carrier_id)
        REFERENCES mesh.carrier (id) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_rate_origin_zone_fk FOREIGN KEY (account_code, origin_zone_id)
        REFERENCES mesh.logistics_zone (account_code, id) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_rate_destination_zone_fk FOREIGN KEY (account_code, destination_zone_id)
        REFERENCES mesh.logistics_zone (account_code, id) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_rate_weight_uom_fk FOREIGN KEY (weight_uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_rate_volume_uom_fk FOREIGN KEY (volume_uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT,
    CONSTRAINT mesh_logistics_rate_currency_fk FOREIGN KEY (currency_code)
        REFERENCES shared.currency (code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mesh.logistics_rate_break (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text        NOT NULL,
    logistics_rate_id   uuid        NOT NULL,
    break_from_qty      numeric(18,6) NOT NULL,
    break_to_qty        numeric(18,6),
    break_uom_code      text        NOT NULL,
    unit_rate           numeric(18,6) NOT NULL,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_logistics_rate_break_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_logistics_rate_break_range_chk CHECK (
        break_from_qty >= 0 AND (break_to_qty IS NULL OR break_to_qty > break_from_qty)
    ),
    CONSTRAINT mesh_logistics_rate_break_amount_chk CHECK (unit_rate >= 0),
    CONSTRAINT mesh_logistics_rate_break_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_logistics_rate_break_rate_fk FOREIGN KEY (account_code, logistics_rate_id)
        REFERENCES mesh.logistics_rate (account_code, id) ON DELETE CASCADE,
    CONSTRAINT mesh_logistics_rate_break_uom_fk FOREIGN KEY (break_uom_code)
        REFERENCES shared.uom (code) ON DELETE RESTRICT
);

ALTER TABLE mesh.network_event DROP CONSTRAINT IF EXISTS mesh_network_event_type_chk;
ALTER TABLE mesh.network_event
    ADD CONSTRAINT mesh_network_event_type_chk CHECK (event_type IN (
        'account.created',
        'account.status_changed',
        'connection.requested',
        'connection.accepted',
        'connection.suspended',
        'connection.terminated',
        'connection.reactivated',
        'membership.added',
        'membership.removed',
        'invitation.created',
        'invitation.accepted',
        'invitation.rejected',
        'invitation.expired',
        'participant_profile.updated',
        'supplier_service_coverage.changed',
        'supplier_commodity_capability.changed',
        'catalog.published',
        'catalog.unpublished',
        'catalog_item.published',
        'catalog_price.updated',
        'logistics_rate.updated',
        'document.received',
        'document.accepted',
        'document.rejected'
    ));
