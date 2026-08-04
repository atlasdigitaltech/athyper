-- Neon authoritative business-partner extensions.

CREATE TABLE master.business_partner_relationship (
    id                       uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                              NOT NULL,
    source_business_partner_id uuid                            NOT NULL,
    target_business_partner_id uuid                            NOT NULL,
    relationship_type_code   text                              NOT NULL,
    country_code             character(2),
    effective_from           date,
    effective_until          date,
    notes                    text,
    metadata                 jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                   master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                       NOT NULL DEFAULT now(),
    created_by               uuid                              NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT business_partner_relationship_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_relationship_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_relationship_not_self_chk
        CHECK (source_business_partner_id <> target_business_partner_id),
    CONSTRAINT business_partner_relationship_type_chk
        CHECK (relationship_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_relationship_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_relationship_notes_chk
        CHECK (notes IS NULL OR length(notes) <= 4000),
    CONSTRAINT business_partner_relationship_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_relationship_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_relationship_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_governance_relation (
    id                         uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                               NOT NULL,
    business_partner_id        uuid                               NOT NULL,
    relation_type_code         text                               NOT NULL,
    member_name                text                               NOT NULL,
    member_type                master.governance_member_type_d    NOT NULL DEFAULT 'individual',
    member_business_partner_id uuid,
    member_country_code        character(2),
    business_title             text,
    ownership_pct              numeric(7,4),
    voting_pct                 numeric(7,4),
    beneficial_ownership_pct   numeric(7,4),
    appointed_date             date,
    end_of_term                date,
    notes                      text,
    metadata                   jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                     master.partner_extension_status_d  NOT NULL DEFAULT 'draft',
    is_active                  boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz                        NOT NULL DEFAULT now(),
    created_by                 uuid                               NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT business_partner_governance_relation_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_governance_relation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_governance_relation_type_chk
        CHECK (relation_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_governance_relation_name_chk
        CHECK (btrim(member_name) <> '' AND length(member_name) <= 320),
    CONSTRAINT business_partner_governance_relation_pct_chk CHECK (
        (ownership_pct IS NULL OR ownership_pct BETWEEN 0 AND 100)
        AND (voting_pct IS NULL OR voting_pct BETWEEN 0 AND 100)
        AND (beneficial_ownership_pct IS NULL
             OR beneficial_ownership_pct BETWEEN 0 AND 100)
    ),
    CONSTRAINT business_partner_governance_relation_dates_chk
        CHECK (end_of_term IS NULL OR appointed_date IS NULL
               OR end_of_term >= appointed_date),
    CONSTRAINT business_partner_governance_relation_member_chk
        CHECK (member_business_partner_id IS NULL
               OR member_business_partner_id <> business_partner_id),
    CONSTRAINT business_partner_governance_relation_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_governance_relation_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_governance_relation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_identifier (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    business_partner_id uuid                              NOT NULL,
    scheme_code         text                              NOT NULL,
    identifier_value    text                              NOT NULL,
    issuing_authority   text,
    issuing_country_code character(2),
    issued_at           date,
    effective_until     date,
    is_primary          boolean                           NOT NULL DEFAULT false,
    verified_at         timestamptz,
    verified_by         uuid,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT business_partner_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_identifier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_identifier_scheme_chk
        CHECK (scheme_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_identifier_value_chk
        CHECK (btrim(identifier_value) <> '' AND length(identifier_value) <= 256),
    CONSTRAINT business_partner_identifier_dates_chk
        CHECK (effective_until IS NULL OR issued_at IS NULL
               OR effective_until >= issued_at),
    CONSTRAINT business_partner_identifier_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT business_partner_identifier_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_identifier_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_identifier_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_tax_registration (
    id                     uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                              NOT NULL,
    business_partner_id    uuid                              NOT NULL,
    jurisdiction_id        uuid                              NOT NULL,
    tax_type_id            uuid,
    registration_type_code text                              NOT NULL,
    registration_number    text                              NOT NULL,
    effective_from         date,
    effective_until        date,
    is_primary             boolean                           NOT NULL DEFAULT false,
    verified_at            timestamptz,
    verified_by            uuid,
    metadata               jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                 master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active              boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                       NOT NULL DEFAULT now(),
    created_by             uuid                              NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT business_partner_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_tax_registration_type_chk
        CHECK (registration_type_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_tax_registration_number_chk
        CHECK (btrim(registration_number) <> ''
               AND length(registration_number) <= 128),
    CONSTRAINT business_partner_tax_registration_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT business_partner_tax_registration_verification_pair_chk
        CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
    CONSTRAINT business_partner_tax_registration_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_tax_registration_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_tax_registration_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_commodity_capability (
    id                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                              NOT NULL,
    business_partner_id   uuid                              NOT NULL,
    commodity_category_id uuid                              NOT NULL,
    partner_role          master.partner_role_d             NOT NULL,
    effective_from        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until       date,
    notes                 text,
    metadata              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                       NOT NULL DEFAULT now(),
    created_by            uuid                              NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT business_partner_commodity_capability_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_commodity_capability_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_commodity_capability_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_commodity_capability_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_commodity_capability_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_commodity_capability_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.business_partner_operating_organization_assignment (
    id                        uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                              NOT NULL,
    business_partner_id       uuid                              NOT NULL,
    operating_organization_id uuid                              NOT NULL,
    partner_role              master.partner_role_d             NOT NULL,
    effective_from            date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until           date,
    metadata                  jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                    master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                 boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                       NOT NULL DEFAULT now(),
    created_by                uuid                              NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT business_partner_operating_org_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_operating_org_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_operating_org_assignment_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT business_partner_operating_org_assignment_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT business_partner_operating_org_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_operating_org_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_supplier_profile (
    id                                uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                         uuid                              NOT NULL,
    supplier_id                       uuid                              NOT NULL,
    company_code_id                   uuid                              NOT NULL,
    currency_code                     character(3),
    payment_term_id                   uuid,
    default_accounting_profile_id     uuid,
    preferred_remittance_bank_link_id uuid,
    default_dimension_set_id          uuid,
    metadata                          jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                            master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                         boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                 timestamptz,
    status_changed_by                 uuid,
    created_at                        timestamptz                       NOT NULL DEFAULT now(),
    created_by                        uuid                              NOT NULL,
    updated_at                        timestamptz,
    updated_by                        uuid,

    CONSTRAINT company_code_supplier_profile_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_supplier_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_supplier_profile_company_id_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT company_code_supplier_profile_coordinate_uq
        UNIQUE (tenant_id, supplier_id, company_code_id),
    CONSTRAINT company_code_supplier_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_supplier_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_supplier_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.company_code_customer_profile (
    id                            uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid                              NOT NULL,
    customer_id                   uuid                              NOT NULL,
    company_code_id               uuid                              NOT NULL,
    currency_code                 character(3),
    credit_limit                  numeric(18,4),
    credit_limit_currency_code    character(3),
    payment_term_id               uuid,
    default_accounting_profile_id uuid,
    default_dimension_set_id      uuid,
    statement_cycle_code          text,
    metadata                      jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                        master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active                     boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at             timestamptz,
    status_changed_by             uuid,
    created_at                    timestamptz                       NOT NULL DEFAULT now(),
    created_by                    uuid                              NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT company_code_customer_profile_pkey PRIMARY KEY (id),
    CONSTRAINT company_code_customer_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT company_code_customer_profile_company_id_uq
        UNIQUE (tenant_id, company_code_id, id),
    CONSTRAINT company_code_customer_profile_coordinate_uq
        UNIQUE (tenant_id, customer_id, company_code_id),
    CONSTRAINT company_code_customer_profile_credit_chk
        CHECK (credit_limit IS NULL OR (
            credit_limit >= 0 AND credit_limit_currency_code IS NOT NULL
        )),
    CONSTRAINT company_code_customer_profile_statement_chk
        CHECK (statement_cycle_code IS NULL
               OR statement_cycle_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT company_code_customer_profile_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT company_code_customer_profile_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT company_code_customer_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.legal_entity_business_partner_link (
    id                  uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                              NOT NULL,
    legal_entity_id     uuid                              NOT NULL,
    business_partner_id uuid                              NOT NULL,
    effective_from      date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_until     date,
    notes               text,
    metadata            jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status              master.partner_extension_status_d NOT NULL DEFAULT 'draft',
    is_active           boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                       NOT NULL DEFAULT now(),
    created_by          uuid                              NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT legal_entity_business_partner_link_pkey PRIMARY KEY (id),
    CONSTRAINT legal_entity_business_partner_link_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT legal_entity_business_partner_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT legal_entity_business_partner_link_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT legal_entity_business_partner_link_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT legal_entity_business_partner_link_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.intercompany_trading_pair (
    id                              uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid                                   NOT NULL,
    source_company_code_id          uuid                                   NOT NULL,
    counterparty_company_code_id    uuid                                   NOT NULL,
    counterparty_supplier_profile_id uuid,
    mirror_customer_profile_id      uuid,
    requires_agreement              boolean                                NOT NULL DEFAULT true,
    mirror_mode                     master.intercompany_mirror_mode_d       NOT NULL DEFAULT 'manual',
    settlement_mode                 master.intercompany_settlement_mode_d   NOT NULL DEFAULT 'open_item',
    effective_from                  date,
    effective_until                 date,
    notes                           text,
    metadata                        jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                          master.partner_extension_status_d       NOT NULL DEFAULT 'draft',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz                             NOT NULL DEFAULT now(),
    created_by                      uuid                                    NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT intercompany_trading_pair_pkey PRIMARY KEY (id),
    CONSTRAINT intercompany_trading_pair_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT intercompany_trading_pair_not_self_chk
        CHECK (source_company_code_id <> counterparty_company_code_id),
    CONSTRAINT intercompany_trading_pair_range_chk
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until > effective_from),
    CONSTRAINT intercompany_trading_pair_mirror_chk
        CHECK (mirror_mode = 'disabled' OR mirror_customer_profile_id IS NOT NULL
               OR status <> 'active'),
    CONSTRAINT intercompany_trading_pair_supplier_chk
        CHECK (counterparty_supplier_profile_id IS NOT NULL OR status <> 'active'),
    CONSTRAINT intercompany_trading_pair_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT intercompany_trading_pair_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT intercompany_trading_pair_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE master.contact_person_identity_link (
    tenant_id         uuid        NOT NULL,
    contact_person_id uuid        NOT NULL,
    person_id         uuid        NOT NULL,
    link_type         text        NOT NULL DEFAULT 'same_person',
    effective_from    date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,

    CONSTRAINT contact_person_identity_link_pkey
        PRIMARY KEY (tenant_id, contact_person_id),
    CONSTRAINT contact_person_identity_link_type_chk
        CHECK (link_type = 'same_person'),
    CONSTRAINT contact_person_identity_link_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from)
);
