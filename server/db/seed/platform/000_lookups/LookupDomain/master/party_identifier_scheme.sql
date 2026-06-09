-- LookupDomain/master/party_identifier_scheme.sql
-- Lookup domain + values for: master.party_identifier_scheme
-- Used by: master.party_identifier.scheme
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.party_identifier_scheme',
       'Party Identifier Scheme',
       'External identifier schemes for parties: DUNS, LEI, GLN, Ariba ANID, PEPPOL, national registration numbers.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.party_identifier_scheme'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('duns',            'DUNS Number',               'master.party_identifier_scheme', 'Dun & Bradstreet Data Universal Numbering System (9-digit)',         10),
    ('lei',             'LEI',                        'master.party_identifier_scheme', 'Legal Entity Identifier (GLEIF 20-char alphanumeric)',               20),
    ('gln',             'GLN',                        'master.party_identifier_scheme', 'GS1 Global Location Number (13-digit)',                              30),
    ('ariba_anid',      'Ariba Network ID (ANID)',    'master.party_identifier_scheme', 'SAP Ariba Network supplier identifier (AN + digits)',                40),
    ('ariba_bno',       'Ariba BNO',                  'master.party_identifier_scheme', 'SAP Business Network BNO-prefixed identifier',                      50),
    ('peppol_id',       'PEPPOL Participant ID',      'master.party_identifier_scheme', 'PEPPOL e-procurement participant ID (scheme:value)',                 60),
    ('uen',             'UEN (Singapore)',             'master.party_identifier_scheme', 'Singapore Unique Entity Number',                                    70),
    ('ssm_no',          'SSM No (Malaysia)',           'master.party_identifier_scheme', 'Malaysia SSM company registration number',                          80),
    ('crn',             'Company Reg. No.',            'master.party_identifier_scheme', 'Generic company registration number (country-specific)',             90),
    ('vat_reg',         'VAT Registration No.',        'master.party_identifier_scheme', 'National VAT registration number',                                 100),
    ('eori',            'EORI Number',                 'master.party_identifier_scheme', 'EU Economic Operator Registration and Identification number',       110),
    ('tin',             'Tax Identification No.',      'master.party_identifier_scheme', 'Generic Tax Identification Number (country-specific)',              120),
    ('customs_code',    'Customs Code',                'master.party_identifier_scheme', 'Customs authority issued trader identification',                    130),
    ('custom',          'Custom Identifier',           'master.party_identifier_scheme', 'Tenant-defined identifier scheme',                                  999)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
