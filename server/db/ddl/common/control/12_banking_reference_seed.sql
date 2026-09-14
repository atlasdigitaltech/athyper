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

-- Country account capture profiles. Bank-specific local account lengths are intentionally unrestricted.
INSERT INTO control.bank_account_validation_rule
(code,name,country_code,payment_rail_code,account_identifier_type,bank_identifier_type,account_pattern,iban_country_prefix,is_checksum_validated,is_bank_identifier_required,priority,validation_schema,metadata,created_by)
VALUES
('MY.CAPTURE','Malaysia account capture','MY','account_capture','local','none',NULL,NULL,false,false,10,'{"capture": {"accountType": "local_account", "typeWidget": "hidden", "accountPattern": "", "routingWidget": "hidden", "routingLabel": "Local routing code", "routingPattern": "", "routingRequired": false}}'::jsonb,'{"source": "https://paynet.my/personal-solutions/interbank-giro.html", "checkedOn": "2026-09-14", "scope": "Account capture; payment-rail eligibility is evaluated separately."}'::jsonb,'00000000-0000-0000-0000-000000000000'),
('IN.CAPTURE','India account capture','IN','account_capture','local','ifsc',NULL,NULL,false,false,10,'{"capture": {"accountType": "local_account", "typeWidget": "hidden", "accountPattern": "", "routingWidget": "text", "routingLabel": "IFSC", "routingPattern": "^[A-Z]{4}0[A-Z0-9]{6}$", "routingRequired": true}}'::jsonb,'{"source": "https://systemhealth.rbi.org.in/Scripts/FAQView.aspx_Id%3D60%281%29.html", "checkedOn": "2026-09-14", "scope": "Account capture; payment-rail eligibility is evaluated separately."}'::jsonb,'00000000-0000-0000-0000-000000000000'),
('SA.CAPTURE','Saudi Arabia account capture','SA','account_capture','iban','none','^SA[0-9]{4}[A-Z0-9]{18}$','SA',true,false,10,'{"capture": {"accountType": "iban", "typeWidget": "hidden", "accountPattern": "^SA[0-9]{4}[A-Z0-9]{18}$", "routingWidget": "hidden", "routingLabel": "Local routing code", "routingPattern": "", "routingRequired": false}}'::jsonb,'{"source": "https://www.swift.com/sites/default/files/files/SWIFT_IBAN_Registry.pdf", "checkedOn": "2026-09-14", "scope": "Account capture; payment-rail eligibility is evaluated separately."}'::jsonb,'00000000-0000-0000-0000-000000000000'),
('EG.CAPTURE','Egypt account capture','EG','account_capture','iban','none','^EG[0-9]{27}$','EG',true,false,10,'{"capture": {"accountType": "iban", "typeWidget": "hidden", "accountPattern": "^EG[0-9]{27}$", "routingWidget": "hidden", "routingLabel": "Local routing code", "routingPattern": "", "routingRequired": false}}'::jsonb,'{"source": "https://www.swift.com/sites/default/files/files/SWIFT_IBAN_Registry.pdf", "checkedOn": "2026-09-14", "scope": "Account capture; payment-rail eligibility is evaluated separately."}'::jsonb,'00000000-0000-0000-0000-000000000000'),
('QA.CAPTURE','Qatar account capture','QA','account_capture','iban','none','^QA[0-9]{2}[A-Z]{4}[A-Z0-9]{21}$','QA',true,false,10,'{"capture": {"accountType": "iban", "typeWidget": "hidden", "accountPattern": "^QA[0-9]{2}[A-Z]{4}[A-Z0-9]{21}$", "routingWidget": "hidden", "routingLabel": "Local routing code", "routingPattern": "", "routingRequired": false}}'::jsonb,'{"source": "https://www.swift.com/sites/default/files/files/SWIFT_IBAN_Registry.pdf", "checkedOn": "2026-09-14", "scope": "Account capture; payment-rail eligibility is evaluated separately."}'::jsonb,'00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;
