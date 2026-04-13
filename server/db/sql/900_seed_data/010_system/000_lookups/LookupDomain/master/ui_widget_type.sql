-- LookupDomain/master/ui_widget_type.sql
-- Lookup values for domain: ui.widget_type
-- Widget type codes for master.dashboard_widget.widget_type_code.
-- Tenant-extensible: tenants may register custom widget types.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('chart',         'Chart',         'ui.widget_type', 'Recharts / D3 chart. Sub-type (bar, line, pie, etc.) configured via config_json.',          10),
    ('kpi_card',      'KPI Card',      'ui.widget_type', 'Single-metric KPI tile with optional trend indicator and comparison period.',               20),
    ('table',         'Table',         'ui.widget_type', 'Tabular data grid with sorting, filtering, and pagination.',                                30),
    ('list',          'List',          'ui.widget_type', 'Ordered or unordered list of items.',                                                       40),
    ('calendar',      'Calendar',      'ui.widget_type', 'Date-scoped event or task calendar.',                                                       50),
    ('activity_feed', 'Activity Feed', 'ui.widget_type', 'Reverse-chronological activity/notification feed.',                                         60),
    ('custom',        'Custom',        'ui.widget_type', 'Tenant-defined widget component. Front-end routes by widget_code convention.',               70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
