INSERT INTO control.bank_account_validation_rule (
    code, name, country_code, payment_rail_code, direction,
    account_identifier_type, bank_identifier_type,
    is_checksum_validated, created_by
)
VALUES
    ('AE.LOCAL', 'United Arab Emirates local transfer', 'AE', 'local_transfer', 'both', 'iban', 'bank_code', true, '00000000-0000-0000-0000-000000000000'),
    ('AU.LOCAL', 'Australia local transfer', 'AU', 'local_transfer', 'both', 'local', 'bsb', false, '00000000-0000-0000-0000-000000000000'),
    ('DE.SEPA', 'Germany SEPA', 'DE', 'sepa', 'both', 'iban', 'bic', true, '00000000-0000-0000-0000-000000000000'),
    ('DE.SWIFT', 'Germany SWIFT', 'DE', 'swift', 'outbound', 'iban', 'bic', true, '00000000-0000-0000-0000-000000000000'),
    ('GB.LOCAL', 'United Kingdom local transfer', 'GB', 'local_transfer', 'both', 'iban', 'sort_code', true, '00000000-0000-0000-0000-000000000000'),
    ('IN.LOCAL', 'India local transfer', 'IN', 'local_transfer', 'both', 'local', 'ifsc', false, '00000000-0000-0000-0000-000000000000'),
    ('IN.SWIFT', 'India SWIFT', 'IN', 'swift', 'outbound', 'local', 'bic', false, '00000000-0000-0000-0000-000000000000'),
    ('IN.UPI', 'India UPI', 'IN', 'upi', 'both', 'upi_vpa', 'none', false, '00000000-0000-0000-0000-000000000000'),
    ('KE.MPESA', 'Kenya mobile money', 'KE', 'mobile_money', 'both', 'mobile', 'none', false, '00000000-0000-0000-0000-000000000000'),
    ('MY.LOCAL', 'Malaysia local transfer', 'MY', 'local_transfer', 'both', 'local', 'bank_code', false, '00000000-0000-0000-0000-000000000000'),
    ('SG.LOCAL', 'Singapore local transfer', 'SG', 'local_transfer', 'both', 'local', 'bank_code', false, '00000000-0000-0000-0000-000000000000'),
    ('US.ACH', 'United States ACH', 'US', 'ach', 'both', 'local', 'aba', false, '00000000-0000-0000-0000-000000000000'),
    ('US.WIRE', 'United States wire transfer', 'US', 'local_transfer', 'both', 'local', 'aba', false, '00000000-0000-0000-0000-000000000000'),
    ('US.SWIFT', 'United States SWIFT', 'US', 'swift', 'outbound', 'local', 'bic', false, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    country_code = EXCLUDED.country_code,
    payment_rail_code = EXCLUDED.payment_rail_code,
    direction = EXCLUDED.direction,
    account_identifier_type = EXCLUDED.account_identifier_type,
    bank_identifier_type = EXCLUDED.bank_identifier_type,
    is_checksum_validated = EXCLUDED.is_checksum_validated,
    status = 'active';
