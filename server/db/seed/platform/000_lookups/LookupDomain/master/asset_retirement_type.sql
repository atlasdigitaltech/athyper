INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('sold',            'Sold',             'master.asset_retirement_type', 'Asset sold to third party',        10),
    ('scrapped',        'Scrapped',         'master.asset_retirement_type', 'Asset scrapped / written off',     20),
    ('donated',         'Donated',          'master.asset_retirement_type', 'Asset donated',                    30),
    ('exchanged',       'Exchanged',        'master.asset_retirement_type', 'Asset exchanged / traded in',      40),
    ('abandoned',       'Abandoned',        'master.asset_retirement_type', 'Asset abandoned',                  50),
    ('stolen',          'Stolen',           'master.asset_retirement_type', 'Asset stolen / lost',              60),
    ('insurance_claim', 'Insurance Claim',  'master.asset_retirement_type', 'Insurance claim processed',        70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
