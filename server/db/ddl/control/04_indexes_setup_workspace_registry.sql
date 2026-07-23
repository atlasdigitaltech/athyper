CREATE INDEX IF NOT EXISTS setup_domain_workspace_order_idx
    ON control.setup_domain (setup_workspace_id, sort_order)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS setup_domain_owner_module_idx
    ON control.setup_domain (owner_module_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS setup_domain_contributors_gin_idx
    ON control.setup_domain USING gin (contributing_module_codes);

CREATE INDEX IF NOT EXISTS setup_domain_scopes_gin_idx
    ON control.setup_domain USING gin (supported_scope_types);
