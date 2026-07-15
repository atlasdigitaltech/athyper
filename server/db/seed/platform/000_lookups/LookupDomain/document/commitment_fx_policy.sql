INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('spot_on_event',         'Spot on Event',         'document.commitment_fx_policy', 'Rate captured at each fulfilment / invoice event using the spot rate at that time.',                              10),
    ('fixed_at_commitment',   'Fixed at Commitment',   'document.commitment_fx_policy', 'Rate frozen at the commitment header and applied to every downstream event.',                                    20),
    ('manual_contract_rate',  'Manual Contract Rate',  'document.commitment_fx_policy', 'Contractually agreed rate maintained manually on the commitment; may be superseded by amendment.',              30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
