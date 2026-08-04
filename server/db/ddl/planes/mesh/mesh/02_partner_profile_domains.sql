CREATE DOMAIN mesh.network_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'suspended', 'retired'));

CREATE DOMAIN mesh.trade_role_d AS text
    CHECK (VALUE IN ('supplier', 'customer'));

CREATE DOMAIN mesh.profile_record_status_d AS text
    CHECK (VALUE IN ('active', 'inactive', 'revoked'));

CREATE DOMAIN mesh.bank_institution_type_d AS text
    CHECK (VALUE IN (
        'bank', 'correspondent_bank', 'central_bank', 'credit_union',
        'neobank', 'payment_provider', 'wallet_provider', 'fx_broker'
    ));

CREATE DOMAIN mesh.bank_account_id_type_d AS text
    CHECK (VALUE IN ('iban', 'local'));

CREATE DOMAIN mesh.bank_account_status_d AS text
    CHECK (VALUE IN (
        'draft', 'pending_verification', 'active',
        'suspended', 'closed', 'retired'
    ));

CREATE DOMAIN mesh.bank_verification_method_d AS text
    CHECK (VALUE IN (
        'micro_deposit', 'bank_letter', 'cancelled_cheque',
        'supplier_portal', 'manual', 'api_validation'
    ));

CREATE DOMAIN mesh.bank_disclosure_status_d AS text
    CHECK (VALUE IN ('active', 'expired', 'revoked', 'superseded'));
