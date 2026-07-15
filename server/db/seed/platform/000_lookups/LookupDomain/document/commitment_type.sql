INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_order',       'Purchase Order',       'document.commitment_type', 'One-time procurement commitment.',                              10),
    ('contract',             'Contract',             'document.commitment_type', 'Master agreement or purchase contract.',                        20),
    ('lease',                'Lease',                'document.commitment_type', 'Operating or finance lease commitment.',                        30),
    ('subscription',         'Subscription',         'document.commitment_type', 'Recurring subscription commitment (SaaS, memberships).',        40),
    ('standing_order',       'Standing Order',       'document.commitment_type', 'Blanket standing order for repeat consumables.',                 50),
    ('framework_agreement',  'Framework Agreement',  'document.commitment_type', 'Framework agreement with call-off releases.',                    60),
    ('grant_award',          'Grant Award',          'document.commitment_type', 'Grant or award commitment (public sector).',                     70),
    ('internal_order',       'Internal Order',       'document.commitment_type', 'Intra-company or intra-group commitment.',                       80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
