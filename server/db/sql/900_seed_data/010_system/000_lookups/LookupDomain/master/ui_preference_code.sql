-- LookupDomain/master/ui_preference_code.sql
-- Lookup values for domain: ui.preference_code
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Grid / Table preferences ───────────────────────────────────────────
    ('grid.page_size',
     'Grid Page Size',
     'ui.preference_code',
     'Default rows per page for grid/list surfaces. '
     'preference_value schema: {"page_size": 25}.',
     10,
     '{"value_schema":{"type":"object","properties":{"page_size":{"type":"integer","minimum":10,"maximum":500}}}}'),

    ('grid.column_order',
     'Grid Column Order',
     'ui.preference_code',
     'Column display order and visibility per surface. '
     'preference_value schema: {"columns": [{"key":"code","visible":true,"width":120}, ...]}.',
     11,
     '{"value_schema":{"type":"object","properties":{"columns":{"type":"array"}}}}'),

    ('grid.frozen_columns',
     'Grid Frozen Columns',
     'ui.preference_code',
     'Number of columns frozen on left in grid views. '
     'preference_value schema: {"frozen_count": 2}.',
     12,
     '{"value_schema":{"type":"object","properties":{"frozen_count":{"type":"integer","minimum":0,"maximum":10}}}}'),

    -- ── Navigation preferences ─────────────────────────────────────────────
    ('nav.sidebar_collapsed',
     'Sidebar Collapsed',
     'ui.preference_code',
     'Whether the navigation sidebar is collapsed. '
     'preference_value schema: {"collapsed": true}.',
     20,
     '{"value_schema":{"type":"object","properties":{"collapsed":{"type":"boolean"}}}}'),

    ('nav.favorite_modules',
     'Favorite Modules',
     'ui.preference_code',
     'Ordered list of favorite module codes for quick access. '
     'preference_value schema: {"modules": ["gl","ap","ar"]}.',
     21,
     '{"value_schema":{"type":"object","properties":{"modules":{"type":"array","items":{"type":"string"}}}}}'),

    -- ── Notification preferences ───────────────────────────────────────────
    ('notify.digest_frequency',
     'Notification Digest Frequency',
     'ui.preference_code',
     'How often to receive notification digests. '
     'preference_value schema: {"frequency": "daily"}.',
     30,
     '{"value_schema":{"type":"object","properties":{"frequency":{"type":"string","enum":["realtime","hourly","daily","weekly"]}}}}'),

    ('notify.muted_categories',
     'Muted Notification Categories',
     'ui.preference_code',
     'Notification categories the user has muted. '
     'preference_value schema: {"muted": ["info","workflow.reminder"]}.',
     31,
     '{"value_schema":{"type":"object","properties":{"muted":{"type":"array","items":{"type":"string"}}}}}'),

    -- ── Document preferences ───────────────────────────────────────────────
    ('doc.default_print_layout',
     'Default Print Layout',
     'ui.preference_code',
     'Preferred print/export layout for documents. '
     'preference_value schema: {"layout": "compact", "orientation": "portrait"}.',
     40,
     '{"value_schema":{"type":"object","properties":{"layout":{"type":"string"},"orientation":{"type":"string"}}}}'),

    -- ── Accessibility ──────────────────────────────────────────────────────
    ('a11y.reduced_motion',
     'Reduced Motion',
     'ui.preference_code',
     'Disable animations and transitions for accessibility. '
     'preference_value schema: {"enabled": true}.',
     50,
     '{"value_schema":{"type":"object","properties":{"enabled":{"type":"boolean"}}}}'),

    ('a11y.high_contrast',
     'High Contrast Mode',
     'ui.preference_code',
     'Enable high-contrast mode for visually impaired users. '
     'preference_value schema: {"enabled": true}.',
     51,
     '{"value_schema":{"type":"object","properties":{"enabled":{"type":"boolean"}}}}')
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
