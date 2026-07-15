INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('revalue_up',           'Revaluation Surplus',  'master.asset_reserve_type', 'Upward revaluation surplus',          10),
    ('revalue_down',         'Revaluation Deficit',  'master.asset_reserve_type', 'Downward revaluation deficit',        20),
    ('impairment',           'Impairment Loss',      'master.asset_reserve_type', 'Impairment loss recognized',          30),
    ('impairment_reversal',  'Impairment Reversal',  'master.asset_reserve_type', 'Reversal of prior impairment',        40),
    ('transfer_to_retained', 'Transfer to Retained', 'master.asset_reserve_type', 'Transfer surplus to retained earnings', 50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
