-- Used by: tax_jurisdiction.jurisdiction_type.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('country',      'Country',      'master.tax_jurisdiction_type', 'Sovereign nation-level jurisdiction',                 10),
    ('state',        'State',        'master.tax_jurisdiction_type', 'State or federal state level',                        20),
    ('province',     'Province',     'master.tax_jurisdiction_type', 'Province or territory level',                         30),
    ('county',       'County',       'master.tax_jurisdiction_type', 'County or district sub-state level',                  40),
    ('city',         'City',         'master.tax_jurisdiction_type', 'Municipal / city-level jurisdiction',                 50),
    ('district',     'District',     'master.tax_jurisdiction_type', 'Special tax district (e.g. school, transit)',         60),
    ('union',        'Union',        'master.tax_jurisdiction_type', 'Supranational tax union (e.g. EU VAT, GCC VAT area)', 70),
    ('special_zone', 'Special Zone', 'master.tax_jurisdiction_type', 'Special economic zone / FTZ / SEZ',                   80),
    ('treaty',       'Treaty',       'master.tax_jurisdiction_type', 'Treaty-defined jurisdiction (DTAA / WHT treaty)',     90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
