-- Used by: master.legal_entity.legal_form, master.supplier.legal_form, master.customer.legal_form.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.legal_form',
       'Legal Form',
       'Legal incorporation form for any organisation (Sdn Bhd, PLC, Partnership, etc.). '
       'Applies to legal entities, suppliers, customers, and any party-class record.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.legal_form'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('private_limited',     'Private Limited Company',       'master.legal_form', 'Sdn Bhd / Pte Ltd / Ltd / LLC',                          10),
    ('public_listed',       'Public Listed Company',         'master.legal_form', 'Berhad / PLC / Corp listed on a stock exchange',          20),
    ('partnership',         'Partnership',                   'master.legal_form', 'General or limited partnership',                          30),
    ('llp',                 'Limited Liability Partnership', 'master.legal_form', 'LLP structure',                                           40),
    ('sole_proprietor',     'Sole Proprietor',               'master.legal_form', 'Single-owner business',                                   50),
    ('cooperative',         'Cooperative',                   'master.legal_form', 'Member-owned cooperative or society',                     60),
    ('government',          'Government / Statutory Body',   'master.legal_form', 'Government-owned entity or statutory authority',          70),
    ('ngo',                 'NGO / Non-Profit',              'master.legal_form', 'Non-governmental or charitable organisation',             80),
    ('branch',              'Branch Office',                 'master.legal_form', 'Branch or representative office of a foreign entity',     90),
    ('other',               'Other',                         'master.legal_form', 'Other legal form not listed above',                      100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
