-- Values MUST stay in sync with the DB CHECK constraint statutory_scheme_type_chk:
-- ('pension','social_security','income_tax','healthcare','workers_comp','other').

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('pension',         'Pension / Provident Fund',   'master.statutory_scheme_type', 'Defined-contribution or defined-benefit retirement scheme: EPF, CPF, NPS, auto-enrolment pension, GPSSA',       10),
    ('social_security', 'Social Security',            'master.statutory_scheme_type', 'Broad social security / national insurance contribution: SOCSO, NI Class 1, FICA SS, SHG, professional tax', 20),
    ('income_tax',      'Income Tax Withholding',     'master.statutory_scheme_type', 'Employer obligation to deduct and remit employee income tax: TDS u/s 192, PAYE, US federal withholding',      30),
    ('healthcare',      'Healthcare / Medical Levy',  'master.statutory_scheme_type', 'Medical or health-fund contribution: ESI India, Medicare US, Medisave SG',                                    40),
    ('workers_comp',    'Workers Compensation',       'master.statutory_scheme_type', 'Mandatory employer-funded injury/disability insurance: WICA SG, workers comp US',                             50),
    ('other',           'Other Statutory',            'master.statutory_scheme_type', 'Catch-all for statutory obligations not covered above: gratuity, statutory bonus, EIS, SDL, skills levy',     60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
