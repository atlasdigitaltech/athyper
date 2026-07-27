-- Finance Setup is a FIN workspace capability composed from FND, ACC, PAY,
-- and TREASURY. Public routes remain workspace-oriented; module ownership is
-- explicit for entitlement and permission evaluation.

INSERT INTO control.setup_workspace (
    workspace_id,
    code,
    route_slug,
    label,
    description,
    schema_version,
    scope_policies,
    capabilities,
    config,
    status,
    created_by
)
SELECT
    w.id,
    'finance-setup',
    'finance',
    'Finance Settings',
    'Finance settings and master-data directory.',
    '1.0',
    '[
      {"type":"tenant","routeSegment":"tenant","selectionMode":"explicit","required":false},
      {"type":"legal_entity","routeSegment":"legal-entity","selectionMode":"explicit","required":false},
      {"type":"company_code","routeSegment":"company","selectionMode":"automatic_single","required":true},
      {"type":"company_book","routeSegment":"company-book","selectionMode":"fixed","required":false}
    ]'::jsonb,
    '{
      "readiness":true,
      "certification":true,
      "issues":true,
      "activity":true,
      "search":false,
      "export":false
    }'::jsonb,
    '{
      "basePath":"/finance/setup",
      "entryPath":"/setup/finance",
      "entityDirectory":{
        "manifest":"FINANCE_ENTITY_DIRECTORY",
        "scopes":["tenant","company_code"],
        "schemas":["master","control","shared_reference"],
        "excludeKinds":["document","transaction","log","runtime_metadata","security"]
      },
      "overview":{
        "title":"Setup overview",
        "layout":"cards",
        "showDomainProgress":true,
        "showAttention":true,
        "showRecentActivity":false
      }
    }'::jsonb,
    'ACTIVE',
    '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.workspace w
WHERE w.code = 'FIN'
ON CONFLICT (code) DO UPDATE SET
    workspace_id = excluded.workspace_id,
    route_slug = excluded.route_slug,
    label = excluded.label,
    description = excluded.description,
    schema_version = excluded.schema_version,
    scope_policies = excluded.scope_policies,
    capabilities = excluded.capabilities,
    config = excluded.config,
    status = excluded.status,
    updated_at = now(),
    updated_by = excluded.created_by;

INSERT INTO control.setup_domain (
    setup_workspace_id,
    owner_module_id,
    code,
    route_segment,
    label,
    description,
    icon_key,
    sort_order,
    contributing_module_codes,
    required_module_codes,
    required_permissions,
    supported_scope_types,
    sections,
    config,
    status,
    created_by
)
SELECT
    sw.id,
    owner_module.id,
    v.code,
    v.route_segment,
    v.label,
    v.description,
    v.icon_key,
    v.sort_order,
    v.contributing_module_codes,
    v.required_module_codes,
    v.required_permissions,
    v.supported_scope_types,
    v.sections,
    v.config,
    'ACTIVE',
    '00000000-0000-0000-0000-000000000000'::uuid
FROM control.setup_workspace sw
JOIN (
    VALUES
    (
      'foundation',
      'foundation',
      'Foundation',
      'Organization, accounts, books and fiscal calendar.',
      'building',
      10::smallint,
      'ACC',
      '["FND"]'::jsonb,
      '["ACC"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["company_code"]'::jsonb,
      '[
        {"code":"organization","routeSegment":"organization","label":"Organization & Currency","order":10},
        {"code":"accounts","routeSegment":"accounts","label":"Chart of Accounts & GL Accounts","order":20},
        {"code":"books","routeSegment":"books","label":"Books & Ledgers","order":30},
        {"code":"calendar","routeSegment":"calendar","label":"Fiscal Calendar & Periods","order":40}
      ]'::jsonb,
      '{}'::jsonb
    ),
    (
      'currency-fx',
      'currency-fx',
      'Currency & FX',
      'Policies, rates, imports and revaluation.',
      'coins',
      20::smallint,
      'TREASURY',
      '["ACC"]'::jsonb,
      '["TREASURY"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["tenant","company_code","company_book"]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    ),
    (
      'tax',
      'tax',
      'Tax',
      'Registrations, determination and posting coverage.',
      'receipt-text',
      30::smallint,
      'ACC',
      '[]'::jsonb,
      '["ACC"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["tenant","company_code"]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    ),
    (
      'payments',
      'payments',
      'Payments',
      'Payment policy, routing and settlement.',
      'circle-dollar',
      40::smallint,
      'PAY',
      '["ACC"]'::jsonb,
      '["PAY"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["tenant","company_code"]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    ),
    (
      'banking',
      'banking',
      'Banking',
      'House banks, interfaces and reconciliation.',
      'landmark',
      50::smallint,
      'TREASURY',
      '["PAY"]'::jsonb,
      '["TREASURY"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["company_code"]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    ),
    (
      'certification',
      'certification',
      'Certification',
      'Readiness checks and rollout decision.',
      'shield-check',
      60::smallint,
      'ACC',
      '["PAY","TREASURY"]'::jsonb,
      '["ACC"]'::jsonb,
      '["finance.setup.view"]'::jsonb,
      '["company_code"]'::jsonb,
      '[]'::jsonb,
      '{"anchor":"certification-readiness"}'::jsonb
    )
) AS v(
    code,
    route_segment,
    label,
    description,
    icon_key,
    sort_order,
    owner_module_code,
    contributing_module_codes,
    required_module_codes,
    required_permissions,
    supported_scope_types,
    sections,
    config
) ON true
JOIN shared.module owner_module ON owner_module.code = v.owner_module_code
WHERE sw.code = 'finance-setup'
ON CONFLICT (setup_workspace_id, code) DO UPDATE SET
    owner_module_id = excluded.owner_module_id,
    route_segment = excluded.route_segment,
    label = excluded.label,
    description = excluded.description,
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order,
    contributing_module_codes = excluded.contributing_module_codes,
    required_module_codes = excluded.required_module_codes,
    required_permissions = excluded.required_permissions,
    supported_scope_types = excluded.supported_scope_types,
    sections = excluded.sections,
    config = excluded.config,
    status = excluded.status,
    updated_at = now(),
    updated_by = excluded.created_by;

DO $$
DECLARE
    domain_count integer;
    foundation_section_count integer;
BEGIN
    SELECT count(*) INTO domain_count
    FROM control.setup_domain d
    JOIN control.setup_workspace sw ON sw.id = d.setup_workspace_id
    WHERE sw.code = 'finance-setup' AND d.is_active;

    SELECT jsonb_array_length(d.sections) INTO foundation_section_count
    FROM control.setup_domain d
    JOIN control.setup_workspace sw ON sw.id = d.setup_workspace_id
    WHERE sw.code = 'finance-setup' AND d.code = 'foundation';

    IF domain_count <> 6 OR foundation_section_count <> 4 THEN
        RAISE EXCEPTION
            '[111_setup_workspace_registry] Expected 6 Finance domains and 4 Foundation sections, got % / %',
            domain_count,
            foundation_section_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM control.setup_domain d
        WHERE NOT EXISTS (
            SELECT 1
            FROM shared.module m
            WHERE m.id = d.owner_module_id
        )
    ) THEN
        RAISE EXCEPTION
            '[111_setup_workspace_registry] A setup domain references an unknown owner module.';
    END IF;
END $$;
