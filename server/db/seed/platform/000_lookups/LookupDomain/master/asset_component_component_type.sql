-- Values model the IAS 16 componentization role of an asset component.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('major_component',       'Major Component',       'master.asset_component.component_type', 'Material component tracked separately for depreciation.', 10),
    ('replacement_component', 'Replacement Component', 'master.asset_component.component_type', 'Replacement component linked to a parent asset.',         20),
    ('inspection_component',  'Inspection Component',  'master.asset_component.component_type', 'Inspection or overhaul component capitalized separately.', 30),
    ('other',                 'Other',                 'master.asset_component.component_type', 'Other asset component type.',                              90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
