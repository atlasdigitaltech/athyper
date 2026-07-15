INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('tangible',               'Tangible',                'master.asset_nature', 'IAS 16 property, plant & equipment',       10),
    ('intangible',             'Intangible',              'master.asset_nature', 'IAS 38 intangible assets',                 20),
    ('land',                   'Land',                    'master.asset_nature', 'Non-depreciable land (IAS 16)',             30),
    ('cwip',                   'Capital Work in Progress','master.asset_nature', 'Assets under construction — not yet capitalised', 40),
    ('rou',                    'Right-of-Use',            'master.asset_nature', 'IFRS 16 right-of-use leased assets',       50),
    ('leasehold_improvement',  'Leasehold Improvement',   'master.asset_nature', 'Tenant improvements on leased property',   60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
