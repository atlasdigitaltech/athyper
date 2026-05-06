-- LookupDomain/master/party_governance_control_lookups.sql
-- Lookup domains for BP 360 governance controlled fields.
-- Used by: master.party_governance_relation member/control/compliance fields.
-- Idempotent: WHERE NOT EXISTS guards.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT v.code, v.name, v.description, 'master', false, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('master.party_governance_member_type',       'Party Governance Member Type',       'Type of governance member: individual, organization, trust, public float, or external party.'),
    ('master.party_governance_directness',        'Party Governance Directness',        'Whether ownership or control is direct, indirect, both, or unknown.'),
    ('master.party_governance_control_nature',    'Party Governance Control Nature',    'How the governance member controls or influences the party.'),
    ('master.party_governance_kyc_status',        'Party Governance KYC Status',        'KYC screening status for governance members.'),
    ('master.party_governance_sanctions_status',  'Party Governance Sanctions Status',  'Sanctions screening status for governance members.'),
    ('master.party_governance_pep_status',        'Party Governance PEP Status',        'Politically exposed person screening status for governance members.'),
    ('master.party_governance_evidence_status',   'Party Governance Evidence Status',   'Evidence collection and verification status for governance members.')
) AS v(code, name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain d WHERE d.code = v.code
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('individual',     'Individual',     'master.party_governance_member_type',      'Natural person.',                                           10),
    ('organization',   'Organization',   'master.party_governance_member_type',      'Legal organization or institution.',                         20),
    ('company',        'Company',        'master.party_governance_member_type',      'Corporate shareholder, controller, or office holder.',        30),
    ('trust',          'Trust',          'master.party_governance_member_type',      'Trust or fiduciary arrangement.',                             40),
    ('public_float',   'Public Float',   'master.party_governance_member_type',      'Public market ownership with no named holder.',               50),
    ('external',       'External',       'master.party_governance_member_type',      'External party not modeled as a business partner.',           60),

    ('direct',         'Direct',         'master.party_governance_directness',       'Direct ownership or control.',                                10),
    ('indirect',       'Indirect',       'master.party_governance_directness',       'Indirect ownership or control through intermediaries.',       20),
    ('both',           'Both',           'master.party_governance_directness',       'Both direct and indirect ownership or control.',              30),
    ('unknown',        'Unknown',        'master.party_governance_directness',       'Directness has not been determined.',                         40),

    ('equity',         'Equity',         'master.party_governance_control_nature',   'Control through equity ownership.',                           10),
    ('voting',         'Voting',         'master.party_governance_control_nature',   'Control through voting rights.',                              20),
    ('appointment',    'Appointment',    'master.party_governance_control_nature',   'Control through appointment or removal rights.',              30),
    ('poa',            'Power of Attorney','master.party_governance_control_nature', 'Control through power of attorney or mandate.',               40),
    ('contractual',    'Contractual',    'master.party_governance_control_nature',   'Control through contractual rights.',                         50),
    ('other',          'Other',          'master.party_governance_control_nature',   'Other control mechanism.',                                    60),

    ('not_started',    'Not Started',    'master.party_governance_kyc_status',       'KYC has not started.',                                        10),
    ('in_progress',    'In Progress',    'master.party_governance_kyc_status',       'KYC review is in progress.',                                  20),
    ('verified',       'Verified',       'master.party_governance_kyc_status',       'KYC review is verified.',                                     30),
    ('passed',         'Passed',         'master.party_governance_kyc_status',       'KYC screening passed.',                                       40),
    ('failed',         'Failed',         'master.party_governance_kyc_status',       'KYC screening failed.',                                       50),
    ('expired',        'Expired',        'master.party_governance_kyc_status',       'KYC evidence or screening has expired.',                      60),

    ('not_checked',    'Not Checked',    'master.party_governance_sanctions_status', 'Sanctions screening has not been performed.',                 10),
    ('clear',          'Clear',          'master.party_governance_sanctions_status', 'No sanctions issue found.',                                   20),
    ('flagged',        'Flagged',        'master.party_governance_sanctions_status', 'Potential sanctions issue requires review.',                  30),
    ('blocked',        'Blocked',        'master.party_governance_sanctions_status', 'Confirmed sanctions issue blocks use.',                       40),

    ('unknown',        'Unknown',        'master.party_governance_pep_status',       'PEP status has not been determined.',                         10),
    ('no_pep',         'No PEP',         'master.party_governance_pep_status',       'No politically exposed person issue found.',                  20),
    ('pep',            'PEP',            'master.party_governance_pep_status',       'Politically exposed person found.',                           30),
    ('not_applicable', 'Not Applicable', 'master.party_governance_pep_status',       'PEP screening is not applicable.',                            40),

    ('missing',        'Missing',        'master.party_governance_evidence_status',  'Required evidence has not been received.',                    10),
    ('received',       'Received',       'master.party_governance_evidence_status',  'Evidence has been received but not verified.',                20),
    ('verified',       'Verified',       'master.party_governance_evidence_status',  'Evidence has been verified.',                                 30),
    ('expired',        'Expired',        'master.party_governance_evidence_status',  'Evidence has expired.',                                       40),
    ('waived',         'Waived',         'master.party_governance_evidence_status',  'Evidence requirement has been formally waived.',              50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code
      AND x.code = v.code
      AND x.tenant_id IS NULL
);
