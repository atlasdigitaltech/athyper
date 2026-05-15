-- LookupDomain/master/ui_view_scope.sql
-- Lookup values for domain: ui.view_scope
-- Ownership scope for master.saved_view.scope.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('personal', 'Personal', 'ui.view_scope', 'Owner-only. Visible and writable only by the creating principal.', 10),
    ('shared',   'Shared',   'ui.view_scope', 'Visible to all principals in the tenant. Writable only by the creator.', 20),
    ('system',   'System',   'ui.view_scope', 'Platform-seeded. Visible to all. Read-only for tenant principals.', 30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
