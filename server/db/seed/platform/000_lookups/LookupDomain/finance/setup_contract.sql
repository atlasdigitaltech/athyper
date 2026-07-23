-- Finance Setup Phase 2 canonical scope, domain-state, and lifecycle vocabulary.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, metadata, status, created_by)
SELECT v.code, v.name, v.description, 'control', false, '{"canonical":true,"version":1}'::jsonb,
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('finance.setup_scope_type', 'Finance setup scope type', 'Canonical ownership scopes for Finance definitions, policies, assignments and evidence.'),
    ('finance.setup_domain_state', 'Finance setup domain state', 'Deterministic domain readiness state; certification is tracked separately.'),
    ('finance.configuration_lifecycle', 'Finance configuration lifecycle', 'Canonical lifecycle classes used by Finance Setup contracts.')
) v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_domain d WHERE d.code = v.code);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true,
       v.metadata, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('platform', 'Platform', 'finance.setup_scope_type', 'Global ISO and canonical vocabulary.', 'ownership', 10, '{}'::jsonb),
    ('tenant', 'Tenant', 'finance.setup_scope_type', 'Reusable definitions shared by Companies in one Tenant.', 'ownership', 20, '{}'::jsonb),
    ('legal_entity', 'Legal Entity', 'finance.setup_scope_type', 'Statutory identity and reporting context.', 'ownership', 30, '{}'::jsonb),
    ('company', 'Company', 'finance.setup_scope_type', 'Company adoption, defaults, policy and assignment.', 'ownership', 40, '{}'::jsonb),
    ('company_book', 'Company and Book', 'finance.setup_scope_type', 'Book-specific accounting policy and posting-role coverage.', 'ownership', 50, '{}'::jsonb),
    ('operational', 'Operational', 'finance.setup_scope_type', 'Execution records and governance evidence, not setup CRUD.', 'ownership', 60, '{}'::jsonb),

    ('not_applicable', 'Not Applicable', 'finance.setup_domain_state', 'Governed applicability decision excludes the domain.', 'readiness', 10, '{}'::jsonb),
    ('not_started', 'Not Started', 'finance.setup_domain_state', 'Required definitions or assignments do not exist.', 'readiness', 20, '{}'::jsonb),
    ('in_progress', 'In Progress', 'finance.setup_domain_state', 'Configuration exists but deterministic checks remain incomplete.', 'readiness', 30, '{}'::jsonb),
    ('blocked', 'Blocked', 'finance.setup_domain_state', 'One or more blocking contract violations exist.', 'readiness', 40, '{}'::jsonb),
    ('ready', 'Ready', 'finance.setup_domain_state', 'All enabled deterministic domain checks pass.', 'readiness', 50, '{}'::jsonb),

    ('definition', 'Definition', 'finance.configuration_lifecycle', 'Reusable master: draft, active, inactive.', 'lifecycle', 10, '{"states":["draft","active","inactive"]}'::jsonb),
    ('effective_policy', 'Effective Policy', 'finance.configuration_lifecycle', 'Versioned policy: draft, active, inactive, superseded.', 'lifecycle', 20, '{"states":["draft","active","inactive","superseded"]}'::jsonb),
    ('temporal_link', 'Temporal Link', 'finance.configuration_lifecycle', 'Relationship lifecycle is expressed by effective dates and an end command.', 'lifecycle', 30, '{"states":["scheduled","effective","ended"],"delete":false,"retire":false}'::jsonb),
    ('operational_evidence', 'Operational Evidence', 'finance.configuration_lifecycle', 'Runtime evidence has its own document lifecycle and is never setup CRUD.', 'lifecycle', 40, '{"setup_crud":false}'::jsonb)
) v(code, name, domain_code, description, category, sort_order, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value existing
     WHERE existing.domain_code = v.domain_code
       AND existing.code = v.code
       AND existing.tenant_id IS NULL
);

