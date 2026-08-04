-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.catalog_setup_contract
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.catalog_setup_contract
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:15
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/finance/setup_contract.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_setup_contract: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('finance.configuration_lifecycle', 'Finance configuration lifecycle', 'Canonical lifecycle classes used by Finance Setup contracts.', 'control', false, '{"version":1,"canonical":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance.setup_domain_state', 'Finance setup domain state', 'Deterministic domain readiness state; certification is tracked separately.', 'control', false, '{"version":1,"canonical":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance.setup_scope_type', 'Finance setup scope type', 'Canonical ownership scopes for Finance definitions, policies, assignments and evidence.', 'control', false, '{"version":1,"canonical":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('definition', 'Definition', 'finance.configuration_lifecycle', 'Reusable master: draft, active, inactive.', 'lifecycle', 10, true, '{"states":["draft","active","inactive"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('effective_policy', 'Effective Policy', 'finance.configuration_lifecycle', 'Versioned policy: draft, active, inactive, superseded.', 'lifecycle', 20, true, '{"states":["draft","active","inactive","superseded"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('temporal_link', 'Temporal Link', 'finance.configuration_lifecycle', 'Relationship lifecycle is expressed by effective dates and an end command.', 'lifecycle', 30, true, '{"delete":false,"retire":false,"states":["scheduled","effective","ended"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('operational_evidence', 'Operational Evidence', 'finance.configuration_lifecycle', 'Runtime evidence has its own document lifecycle and is never setup CRUD.', 'lifecycle', 40, true, '{"setup_crud":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('not_applicable', 'Not Applicable', 'finance.setup_domain_state', 'Governed applicability decision excludes the domain.', 'readiness', 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('not_started', 'Not Started', 'finance.setup_domain_state', 'Required definitions or assignments do not exist.', 'readiness', 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('in_progress', 'In Progress', 'finance.setup_domain_state', 'Configuration exists but deterministic checks remain incomplete.', 'readiness', 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('blocked', 'Blocked', 'finance.setup_domain_state', 'One or more blocking contract violations exist.', 'readiness', 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ready', 'Ready', 'finance.setup_domain_state', 'All enabled deterministic domain checks pass.', 'readiness', 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('platform', 'Platform', 'finance.setup_scope_type', 'Global ISO and canonical vocabulary.', 'ownership', 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tenant', 'Tenant', 'finance.setup_scope_type', 'Reusable definitions shared by Companies in one Tenant.', 'ownership', 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('legal_entity', 'Legal Entity', 'finance.setup_scope_type', 'Statutory identity and reporting context.', 'ownership', 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('company', 'Company', 'finance.setup_scope_type', 'Company adoption, defaults, policy and assignment.', 'ownership', 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('company_book', 'Company and Book', 'finance.setup_scope_type', 'Book-specific accounting policy and posting-role coverage.', 'ownership', 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('operational', 'Operational', 'finance.setup_scope_type', 'Execution records and governance evidence, not setup CRUD.', 'ownership', 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.configuration_lifecycle', 'finance.setup_domain_state', 'finance.setup_scope_type'])) <> 15 THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_setup_contract: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['finance.configuration_lifecycle', 'finance.setup_domain_state', 'finance.setup_scope_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_setup_contract: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.configuration_lifecycle', 'finance.setup_domain_state', 'finance.setup_scope_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_setup_contract: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.configuration_lifecycle', 'finance.setup_domain_state', 'finance.setup_scope_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_setup_contract: semantic assertion failed';
  END IF;
END $assertions$;
