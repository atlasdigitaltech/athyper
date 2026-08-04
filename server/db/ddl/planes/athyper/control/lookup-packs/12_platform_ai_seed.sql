-- seed-contract-version: 1
-- seed-pack: athyper.control.lookup.platform_ai
-- seed-pack-version: 1.0.0
-- seed-dataset: athyper.control.lookup.platform_ai
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:17
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/ai_action_code.sql,server/db/seed/platform/000_lookups/LookupDomain/control/ai_doc_class.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'athyper' THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_ai: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.ai_action_code', 'AI Action Code', 'Action codes for AI runtime decisions (extract, classify, suggest, validate, etc.). is_extensible=false ??? new action codes require matching capability implementation.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control.ai_doc_class', 'AI Document Class', 'Document class codes used to scope ai_action_policy and ai_confidence_threshold rows. is_extensible=false ??? new classes require matching extraction capability support.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('extract_document', 'Extract Document', 'control.ai_action_code', 'Parse a structured document (PDF, image, XLSX) into typed JSON output. Initial consumers: procurement invoices, expense receipts, supplier onboarding docs. Consumer ceiling: assist (cannot be lifted to auto for financial documents).', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('classify', 'Classify', 'control.ai_action_code', 'Pick the best-matching class from a fixed taxonomy given a free-text or structured input. Used by: procurement spend-category resolution, journal account suggestion. Consumer ceiling: auto for non-posting classification, assist for journal accounts.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('suggest', 'Suggest', 'control.ai_action_code', 'Return ranked suggestions with per-suggestion confidence scores. Suggestions never auto-execute ??? the user always selects. Consumer ceiling: auto (suggestions are inherently human-gated).', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('autofill', 'Autofill', 'control.ai_action_code', 'Pre-populate form fields from context (prior records, supplier profile, document history). Consumer ceiling: assist ??? user must confirm pre-filled values before commit.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('extract_entity', 'Extract Entity', 'control.ai_action_code', 'Pull named entities (parties, dates, amounts, references) from free-form text. Used in journal narration parsing, meeting note extraction. Consumer ceiling: assist.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('match_record', 'Match Record', 'control.ai_action_code', 'Fuzzy-match an input against existing records (suppliers, customers, chart of accounts). Non-posting operation; matched record is presented for confirmation. Consumer ceiling: auto (no record modification until user confirms).', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('summarize', 'Summarize', 'control.ai_action_code', 'Condense long-form content (meeting notes, audit trails, policy documents) into a summary. Read-only operation. Consumer ceiling: auto.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('translate', 'Translate', 'control.ai_action_code', 'Translate source content to a target locale, preserving domain terminology. Used for multi-locale invoice processing. Consumer ceiling: auto.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('atlas_tool_read', 'Atlas Tool Read', 'control.ai_action_code', 'Execute a registered read-only Atlas tool after verified-context, feature, permission, plane, schema, and tenant-policy checks. Consumer ceiling: auto; this action code cannot authorize mutation tools.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_invoice', 'Purchase Invoice', 'control.ai_doc_class', 'AP supplier invoice. Maps to document.purchase_invoice. Financial posting document ??? all AI actions capped at assist.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_quotation', 'Purchase Quotation', 'control.ai_doc_class', 'Supplier price quotation for procurement decision-making. Non-posting; extraction used for PR/PO pre-fill.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('purchase_requisition', 'Purchase Requisition', 'control.ai_doc_class', 'Internal procurement request. Maps to document.purchase_requisition. Non-posting; assists spend-category classification.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('expense_receipt', 'Expense Receipt', 'control.ai_doc_class', 'Employee expense receipts (fuel, meals, travel). Financial posting document ??? extraction capped at assist.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('supplier_onboarding_doc', 'Supplier Onboarding Document', 'control.ai_doc_class', 'Documents submitted during supplier onboarding (registration, trade license, etc.). Non-posting; feeds master.supplier record pre-fill.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('journal_narration', 'Journal Narration', 'control.ai_doc_class', 'Free-text journal entry narrations. Used for entity extraction and account suggestion. Journal posting is capped at assist.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('regulatory_filing', 'Regulatory Filing', 'control.ai_doc_class', 'Government-submitted documents (VAT returns, customs declarations). High-risk; all actions capped at assist regardless of policy.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master_data_record', 'Master Data Record', 'control.ai_doc_class', 'Structured master data imports (COA, cost-centre hierarchy, customer list). Used for autofill and match_record actions during bulk import.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.ai_action_code', 'control.ai_doc_class'])) <> 17 THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_ai: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.ai_action_code', 'control.ai_doc_class']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_ai: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.ai_action_code', 'control.ai_doc_class']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_ai: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.ai_action_code', 'control.ai_doc_class']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_ai: semantic assertion failed';
  END IF;
END $assertions$;
