-- ============================================================================
-- Platform default bank format rules
-- ============================================================================
-- Country + payment rail validation policies. tenant_id IS NULL = global.
-- Tenant overrides can be seeded separately per tenant setup.
-- Idempotent: WHERE NOT EXISTS guard on code.
-- ============================================================================

INSERT INTO control.bank_format_rule (
    tenant_id, code, name, country_code, payment_network, direction, currency_code,
    account_id_type, bank_id_type,
    is_account_id_required, is_bank_id_required,
    is_bic_allowed, is_bic_required,
    is_branch_code_required, is_national_bank_code_required,
    account_pattern, iban_country_prefix, is_checksum_validated,
    priority, status, created_by
)
SELECT v.tenant_id, v.code, v.name, v.country_code, v.payment_network, v.direction, v.currency_code,
       v.account_id_type, v.bank_id_type,
       v.is_account_id_required, v.is_bank_id_required,
       v.is_bic_allowed, v.is_bic_required,
       v.is_branch_code_required, v.is_national_bank_code_required,
       v.account_pattern, v.iban_country_prefix, v.is_checksum_validated,
       v.priority, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- US
    (NULL::uuid, 'US-ACH',    'US ACH',          'US', 'ach',            'both',     NULL::char(3), 'local', 'aba',       true, true, false, false, false, true,  '^\d{4,17}$',              NULL::char(2), false, 10),
    (NULL,       'US-WIRE',   'US Wire',         'US', 'local_transfer', 'both',     NULL,          'local', 'aba',       true, true, true,  false, false, true,  '^\d{4,17}$',              NULL,          false, 10),
    (NULL,       'US-SWIFT',  'US SWIFT',        'US', 'swift',          'outbound', NULL,          'local', 'bic',       true, true, true,  true,  false, false, '^\d{4,17}$',              NULL,          false, 10),
    -- Germany
    (NULL,       'DE-SEPA',   'Germany SEPA',    'DE', 'sepa',           'both',     NULL,          'iban',  'bic',       true, false, true, false, false, false, '^DE\d{20}$',              'DE',          true,  10),
    (NULL,       'DE-SWIFT',  'Germany SWIFT',   'DE', 'swift',          'outbound', NULL,          'iban',  'bic',       true, true,  true, true,  false, false, '^DE\d{20}$',              'DE',          true,  10),
    -- UK
    (NULL,       'GB-LOCAL',  'UK Local',        'GB', 'local_transfer', 'both',     NULL,          'iban',  'sort_code', true, true,  true, false, false, true,  '^GB\d{2}[A-Z]{4}\d{14}$','GB',          true,  10),
    -- India
    (NULL,       'IN-LOCAL',  'India Local',     'IN', 'local_transfer', 'both',     NULL,          'local', 'ifsc',      true, true, false, false, false, true,  '^\d{9,18}$',              NULL,          false, 10),
    (NULL,       'IN-SWIFT',  'India SWIFT',     'IN', 'swift',          'outbound', NULL,          'local', 'bic',       true, true, true,  true,  false, false, '^\d{9,18}$',              NULL,          false, 10),
    -- UAE
    (NULL,       'AE-LOCAL',  'UAE Local',       'AE', 'local_transfer', 'both',     NULL,          'iban',  'bank_code', true, true,  true, false, false, false, '^AE\d{21}$',              'AE',          true,  10),
    -- Australia
    (NULL,       'AU-LOCAL',  'Australia Local',  'AU', 'local_transfer', 'both',     NULL,          'local', 'bsb',       true, true, false, false, false, true,  '^\d{6,10}$',              NULL,          false, 10),
    -- Malaysia
    (NULL,       'MY-LOCAL',  'Malaysia Local',   'MY', 'local_transfer', 'both',     NULL,          'local', 'bank_code', true, true, false, false, true,  true,  '^\d{10,16}$',             NULL,          false, 10),
    -- Singapore
    (NULL,       'SG-LOCAL',  'Singapore Local',  'SG', 'local_transfer', 'both',     NULL,          'local', 'bank_code', true, true, false, false, true,  true,  '^\d{10,14}$',             NULL,          false, 10)
) AS v(tenant_id, code, name, country_code, payment_network, direction, currency_code,
       account_id_type, bank_id_type, is_account_id_required, is_bank_id_required,
       is_bic_allowed, is_bic_required, is_branch_code_required, is_national_bank_code_required,
       account_pattern, iban_country_prefix, is_checksum_validated, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM control.bank_format_rule x WHERE x.code = v.code AND x.tenant_id IS NULL
);


-- ── Non-bank rail format rules (added by payment method engine) ──────────────

INSERT INTO control.bank_format_rule (
    tenant_id, code, name, country_code, payment_network, direction, currency_code,
    account_id_type, bank_id_type,
    is_account_id_required, is_bank_id_required,
    is_bic_allowed, is_bic_required,
    is_branch_code_required, is_national_bank_code_required,
    account_pattern, is_checksum_validated,
    priority, status, created_by
)
SELECT v.tenant_id, v.code, v.name, v.country_code, v.payment_network, v.direction, v.currency_code,
       v.account_id_type, v.bank_id_type,
       v.is_account_id_required, v.is_bank_id_required,
       v.is_bic_allowed, v.is_bic_required,
       v.is_branch_code_required, v.is_national_bank_code_required,
       v.account_pattern, v.is_checksum_validated,
       v.priority, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    (NULL::uuid, 'IN-UPI',    'India UPI',    'IN', 'upi',          'both', NULL::char(3),
     'upi_vpa', 'none', true, false, false, false, false, false,
     '^[a-zA-Z0-9._-]+@[a-zA-Z]+$', false, 10),
    (NULL,       'KE-MPESA',  'Kenya M-Pesa', 'KE', 'mobile_money', 'both', NULL,
     'mobile',  'none', true, false, false, false, false, false,
     '^\+254[0-9]{9}$', false, 10)
) AS v(tenant_id, code, name, country_code, payment_network, direction, currency_code,
       account_id_type, bank_id_type, is_account_id_required, is_bank_id_required,
       is_bic_allowed, is_bic_required, is_branch_code_required, is_national_bank_code_required,
       account_pattern, is_checksum_validated, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM control.bank_format_rule x WHERE x.code = v.code AND x.tenant_id IS NULL
);
