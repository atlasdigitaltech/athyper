-- LookupDomain/master/ui_breakpoint.sql
-- Lookup values for domain: ui.breakpoint
-- Responsive breakpoint codes for master.dashboard_widget.breakpoint_code.
-- Not tenant-extensible: platform-governed layout system.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('xs', 'Extra Small', 'ui.breakpoint', '<576px — phone portrait.',           10),
    ('sm', 'Small',       'ui.breakpoint', '576–767px — phone landscape.',       20),
    ('md', 'Medium',      'ui.breakpoint', '768–991px — tablet portrait.',       30),
    ('lg', 'Large',       'ui.breakpoint', '992–1199px — tablet landscape.',     40),
    ('xl', 'Extra Large', 'ui.breakpoint', '≥1200px — desktop.',                50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
