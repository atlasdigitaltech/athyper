-- Workspace-level setup registry.
--
-- Deliberately limited to two tables:
--   setup_workspace owns workspace identity, supported scopes, and capabilities.
--   setup_domain owns domain identity, module participation, and nested sections.
--
-- Setup metadata is platform-global and declarative. Actual tenant configuration,
-- readiness results, conflicts, and certification evidence remain in their
-- existing business tables.

CREATE TABLE IF NOT EXISTS control.setup_workspace (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    workspace_id        uuid        NOT NULL,
    code                text        NOT NULL,
    route_slug          text        NOT NULL,
    label               text        NOT NULL,
    description         text,
    schema_version      text        NOT NULL DEFAULT '1.0',
    scope_policies      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    capabilities        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    config              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'ACTIVE',
    is_active           boolean     GENERATED ALWAYS AS (status = 'ACTIVE') STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT setup_workspace_pkey PRIMARY KEY (id),
    CONSTRAINT setup_workspace_code_uq UNIQUE (code),
    CONSTRAINT setup_workspace_workspace_uq UNIQUE (workspace_id),
    CONSTRAINT setup_workspace_code_chk CHECK (code ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT setup_workspace_route_chk CHECK (route_slug ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT setup_workspace_scope_policies_chk CHECK (jsonb_typeof(scope_policies) = 'array'),
    CONSTRAINT setup_workspace_capabilities_chk CHECK (jsonb_typeof(capabilities) = 'object'),
    CONSTRAINT setup_workspace_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT setup_workspace_status_chk CHECK (
        status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')
    )
);

CREATE TABLE IF NOT EXISTS control.setup_domain (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    setup_workspace_id          uuid        NOT NULL,
    owner_module_id             uuid        NOT NULL,
    code                        text        NOT NULL,
    route_segment               text        NOT NULL,
    label                       text        NOT NULL,
    description                 text,
    icon_key                    text,
    sort_order                  smallint    NOT NULL DEFAULT 0,
    contributing_module_codes   jsonb       NOT NULL DEFAULT '[]'::jsonb,
    required_module_codes       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    required_permissions        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    supported_scope_types       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    sections                    jsonb       NOT NULL DEFAULT '[]'::jsonb,
    config                      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'ACTIVE',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'ACTIVE') STORED,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT setup_domain_pkey PRIMARY KEY (id),
    CONSTRAINT setup_domain_code_uq UNIQUE (setup_workspace_id, code),
    CONSTRAINT setup_domain_route_uq UNIQUE (setup_workspace_id, route_segment),
    CONSTRAINT setup_domain_code_chk CHECK (code ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT setup_domain_route_chk CHECK (route_segment ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT setup_domain_icon_chk CHECK (
        icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'
    ),
    CONSTRAINT setup_domain_contributors_chk CHECK (
        jsonb_typeof(contributing_module_codes) = 'array'
    ),
    CONSTRAINT setup_domain_required_modules_chk CHECK (
        jsonb_typeof(required_module_codes) = 'array'
    ),
    CONSTRAINT setup_domain_permissions_chk CHECK (
        jsonb_typeof(required_permissions) = 'array'
    ),
    CONSTRAINT setup_domain_scopes_chk CHECK (
        jsonb_typeof(supported_scope_types) = 'array'
    ),
    CONSTRAINT setup_domain_sections_chk CHECK (jsonb_typeof(sections) = 'array'),
    CONSTRAINT setup_domain_config_chk CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT setup_domain_status_chk CHECK (
        status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')
    )
);

COMMENT ON TABLE control.setup_workspace IS
    'ARCHETYPE=A;SCOPE=N. Workspace-level setup surface registry. JSONB scope policies and capabilities are validated by the SetupWorkspaceContract application schema.';
COMMENT ON COLUMN control.setup_workspace.scope_policies IS
    'Ordered SetupScopePolicyContract array. Friendly route segments resolve to canonical internal scope types such as company_code.';
COMMENT ON TABLE control.setup_domain IS
    'ARCHETYPE=A;SCOPE=N. Setup domain registry. The owning module is relational; contributors, requirements, scopes, and nested sections are contract-validated JSONB.';
COMMENT ON COLUMN control.setup_domain.sections IS
    'Ordered SetupSectionContract array. Sections have no independent lifecycle and therefore remain embedded in their domain.';
