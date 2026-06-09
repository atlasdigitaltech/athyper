-- LookupDomain/document/asset_txn_type.sql
-- Lookup values for domain: document.asset_txn_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('capitalize',     'Capitalize',              'document.asset_txn_type', 'Capitalize asset from WIP or direct',       10),
    ('depreciate',     'Depreciate',              'document.asset_txn_type', 'Periodic depreciation charge',              20),
    ('revalue_up',     'Revalue Up',              'document.asset_txn_type', 'Upward revaluation',                        30),
    ('revalue_down',   'Revalue Down',            'document.asset_txn_type', 'Downward revaluation',                      40),
    ('impair',         'Impairment',              'document.asset_txn_type', 'Impairment loss recognition',               50),
    ('impair_reverse', 'Impairment Reversal',     'document.asset_txn_type', 'Reversal of prior impairment',              55),
    ('transfer',       'Transfer',                'document.asset_txn_type', 'Transfer between entities/locations',       60),
    ('retire',         'Retire',                  'document.asset_txn_type', 'Retire from service',                       70),
    ('dispose',        'Dispose',                 'document.asset_txn_type', 'Dispose / sell asset',                      80),
    ('adjust_cost',    'Cost Adjustment',         'document.asset_txn_type', 'Adjust acquisition cost',                   90),
    ('adjust_life',    'Useful Life Adjustment',  'document.asset_txn_type', 'Adjust remaining useful life',             100),
    ('split',          'Asset Split',             'document.asset_txn_type', 'Split asset into multiple assets',         110),
    ('merge',          'Asset Merge',             'document.asset_txn_type', 'Merge multiple assets into one',           120)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
