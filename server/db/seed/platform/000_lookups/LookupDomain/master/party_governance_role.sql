-- LookupDomain/master/party_governance_role.sql
-- Lookup domain + values for: master.party_governance_role
-- Used by: master.party_governance_relation.relation_type
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.party_governance_role',
       'Party Governance Role',
       'Governance roles within a company structure: shareholders, UBOs, directors, signatories, etc.',
       'master', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.party_governance_role'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('shareholder',         'Shareholder',               'master.party_governance_role', 'Entity or person holding shares in the company',                       10),
    ('ubo',                 'Ultimate Beneficial Owner', 'master.party_governance_role', 'Natural person who ultimately owns or controls the entity (UBO/KYC)',   20),
    ('director',            'Director',                  'master.party_governance_role', 'Appointed company director (executive or non-executive)',               30),
    ('board_member',        'Board Member',              'master.party_governance_role', 'Member of the board of directors or advisory board',                   40),
    ('signatory',           'Signatory',                 'master.party_governance_role', 'Authorised signatory for contracts and banking',                       50),
    ('officer',             'Officer',                   'master.party_governance_role', 'C-level or executive officer with operational authority',              55),
    ('authorized_representative','Authorized Representative','master.party_governance_role','Person authorized to represent or bind the party',                   58),
    ('company_secretary',   'Company Secretary',         'master.party_governance_role', 'Statutory company secretary',                                          60),
    ('auditor',             'Auditor',                   'master.party_governance_role', 'External or internal auditor',                                         70),
    ('advisor',             'Advisor',                   'master.party_governance_role', 'Governance, legal, regulatory, or industry advisor',                  75),
    ('nominee_director',    'Nominee Director',          'master.party_governance_role', 'Nominee director acting on behalf of another party',                   80),
    ('proxy',               'Proxy',                     'master.party_governance_role', 'Authorised proxy for shareholder or governance matters',               90),
    ('other',               'Other',                     'master.party_governance_role', 'Governance role not otherwise listed',                                100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
