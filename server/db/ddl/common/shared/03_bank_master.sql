-- ============================================================================
-- shared/03_bank_master.sql
-- Concept: Bank reference master data.
-- Plain, directly maintained tables referenced by master.bank_account,
-- master.bank_provisional_reference and the Mesh bank tables. There is no release,
-- publication, activation, version or source-manifest model: rows are created and
-- updated in place. Retire with status / effective_until; never delete a row that an
-- account references. A bank that is not in this master data is still captured on the
-- account itself (bank_name_override / bank_country_override / bic_override) or via
-- master.bank_provisional_reference.
-- ============================================================================

CREATE TABLE shared.bank_institution (
    id                uuid          NOT NULL DEFAULT shared.uuidv7(),
    name              text          NOT NULL,
    country_code      character(2)  NOT NULL,
    institution_type  text          NOT NULL DEFAULT 'bank',
    status            text          NOT NULL DEFAULT 'active',
    effective_from    date          NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    source            text,
    source_record_id  text,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    created_by        uuid          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT bank_institution_pkey PRIMARY KEY (id),
    CONSTRAINT bank_institution_country_fk FOREIGN KEY (country_code) REFERENCES shared.country (code),
    CONSTRAINT bank_institution_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_institution_type_chk
        CHECK (institution_type IN ('bank','credit_union','payment_institution','other')),
    CONSTRAINT bank_institution_status_chk CHECK (status IN ('active','retired')),
    CONSTRAINT bank_institution_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT bank_institution_source_chk CHECK (
        (source IS NULL) = (source_record_id IS NULL)
        AND (source IS NULL OR (btrim(source) <> '' AND btrim(source_record_id) <> ''))
    ),
    CONSTRAINT bank_institution_update_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE shared.bank_branch (
    id                uuid          NOT NULL DEFAULT shared.uuidv7(),
    institution_id    uuid          NOT NULL,
    name              text          NOT NULL,
    country_code      character(2)  NOT NULL,
    location          jsonb         NOT NULL DEFAULT '{}'::jsonb,
    status            text          NOT NULL DEFAULT 'active',
    effective_from    date          NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    source            text,
    source_record_id  text,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    created_by        uuid          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT bank_branch_pkey PRIMARY KEY (id),
    CONSTRAINT bank_branch_institution_id_uq UNIQUE (institution_id, id),
    CONSTRAINT bank_branch_institution_fk FOREIGN KEY (institution_id) REFERENCES shared.bank_institution (id),
    CONSTRAINT bank_branch_country_fk FOREIGN KEY (country_code) REFERENCES shared.country (code),
    CONSTRAINT bank_branch_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_branch_location_chk CHECK (jsonb_typeof(location) = 'object'),
    CONSTRAINT bank_branch_status_chk CHECK (status IN ('active','retired')),
    CONSTRAINT bank_branch_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT bank_branch_source_chk CHECK (
        (source IS NULL) = (source_record_id IS NULL)
        AND (source IS NULL OR (btrim(source) <> '' AND btrim(source_record_id) <> ''))
    ),
    CONSTRAINT bank_branch_update_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE shared.bank_identifier (
    id                uuid          NOT NULL DEFAULT shared.uuidv7(),
    institution_id    uuid          NOT NULL,
    branch_id         uuid,
    scheme            text          NOT NULL,
    scheme_namespace  text          NOT NULL,
    jurisdiction      character(2)  NOT NULL,
    value             text          NOT NULL,
    effective_from    date          NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    created_by        uuid          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT bank_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT bank_identifier_institution_fk FOREIGN KEY (institution_id) REFERENCES shared.bank_institution (id),
    CONSTRAINT bank_identifier_branch_fk FOREIGN KEY (institution_id, branch_id) REFERENCES shared.bank_branch (institution_id, id),
    CONSTRAINT bank_identifier_jurisdiction_fk FOREIGN KEY (jurisdiction) REFERENCES shared.country (code),
    CONSTRAINT bank_identifier_scheme_chk
        CHECK (scheme IN ('bic','national_bank_code','national_branch_code','clearing_member_id')),
    CONSTRAINT bank_identifier_namespace_chk CHECK (btrim(scheme_namespace) <> ''),
    CONSTRAINT bank_identifier_value_chk CHECK (btrim(value) = value AND value <> ''),
    CONSTRAINT bank_identifier_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT bank_identifier_bic_chk CHECK (
        scheme <> 'bic'
        OR (scheme_namespace = 'iso9362'
            AND value ~ '^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
            AND substring(value, 5, 2) = jurisdiction)
    ),
    CONSTRAINT bank_identifier_update_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT bank_identifier_no_overlap EXCLUDE USING gist (
        scheme WITH =, scheme_namespace WITH =, jurisdiction WITH =, value WITH =,
        daterange(effective_from, effective_until, '[)') WITH &&
    )
);

COMMENT ON TABLE shared.bank_institution IS
  'Bank master data. Referenced by master.bank_account.bank_institution_id and Mesh bank accounts. Maintained in place; retire with status/effective_until.';
COMMENT ON TABLE shared.bank_branch IS
  'Branch of a bank institution. Referenced by (bank_institution_id, bank_branch_id) on bank accounts.';
COMMENT ON TABLE shared.bank_identifier IS
  'Scheme-qualified routing identifiers (BIC, national bank/branch code) for an institution or branch.';
