-- Platform-owned banking identifier standards. This catalog is installed in
-- every plane so Admin can govern the standard and Neon/Mesh can validate
-- local bank-account data without copying payment-execution credentials.
CREATE TABLE control.bank_account_validation_rule (
    id                              uuid NOT NULL DEFAULT shared.uuidv7(),
    code                            text NOT NULL,
    name                            text NOT NULL,
    description                     text,
    country_code                    char(2) NOT NULL,
    payment_rail_code               text NOT NULL,
    direction                       control.bank_validation_direction_d NOT NULL DEFAULT 'both',
    currency_code                   char(3),
    account_identifier_type         text NOT NULL,
    bank_identifier_type            text NOT NULL,
    is_account_identifier_required  boolean NOT NULL DEFAULT true,
    is_bank_identifier_required     boolean NOT NULL DEFAULT true,
    is_bic_allowed                  boolean NOT NULL DEFAULT true,
    is_bic_required                 boolean NOT NULL DEFAULT false,
    is_branch_code_required         boolean NOT NULL DEFAULT false,
    is_national_bank_code_required  boolean NOT NULL DEFAULT false,
    account_pattern                 text,
    bank_identifier_pattern         text,
    branch_code_pattern             text,
    iban_country_prefix             char(2),
    is_checksum_validated           boolean NOT NULL DEFAULT false,
    validation_schema               jsonb NOT NULL DEFAULT '{}'::jsonb,
    priority                        smallint NOT NULL DEFAULT 0,
    metadata                        jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                          control.bank_validation_status_d NOT NULL DEFAULT 'active',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT bank_account_validation_rule_pkey PRIMARY KEY (id),
    CONSTRAINT bank_account_validation_rule_code_uq UNIQUE (code),
    CONSTRAINT bank_account_validation_rule_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT bank_account_validation_rule_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bank_account_validation_rule_rail_chk
        CHECK (payment_rail_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT bank_account_validation_rule_identifier_type_chk
        CHECK (
            account_identifier_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
            AND bank_identifier_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
        ),
    CONSTRAINT bank_account_validation_rule_country_chk
        CHECK (country_code = upper(country_code)),
    CONSTRAINT bank_account_validation_rule_currency_chk
        CHECK (currency_code IS NULL OR currency_code = upper(currency_code)),
    CONSTRAINT bank_account_validation_rule_iban_prefix_chk
        CHECK (iban_country_prefix IS NULL OR iban_country_prefix = upper(iban_country_prefix)),
    CONSTRAINT bank_account_validation_rule_bic_chk
        CHECK (NOT is_bic_required OR is_bic_allowed),
    CONSTRAINT bank_account_validation_rule_priority_chk CHECK (priority >= 0),
    CONSTRAINT bank_account_validation_rule_json_chk
        CHECK (jsonb_typeof(validation_schema) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_account_validation_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.bank_account_validation_rule IS
    'Platform-owned country and payment-rail validation standard for bank-account and institution identifiers. It carries no tenant credentials and is used by Neon and Mesh.';
