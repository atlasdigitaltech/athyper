-- seed-contract-version: 1
-- seed-pack: athyper.control.lookup.platform_metadata
-- seed-pack-version: 1.0.0
-- seed-dataset: athyper.control.lookup.platform_metadata
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:134
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/entity_class.sql,server/db/seed/platform/000_lookups/LookupDomain/control/field_cardinality.sql,server/db/seed/platform/000_lookups/LookupDomain/control/field_compute_mode.sql,server/db/seed/platform/000_lookups/LookupDomain/control/field_data_type.sql,server/db/seed/platform/000_lookups/LookupDomain/control/field_ui_type.sql,server/db/seed/platform/000_lookups/LookupDomain/control/formula_expression_language.sql,server/db/seed/platform/000_lookups/LookupDomain/control/formula_kind.sql,server/db/seed/platform/000_lookups/LookupDomain/control/mutability.sql,server/db/seed/platform/000_lookups/LookupDomain/control/overlay_change_kind.sql,server/db/seed/platform/000_lookups/LookupDomain/control/relation_kind.sql,server/db/seed/platform/000_lookups/LookupDomain/log/field_classification.sql,server/db/seed/platform/000_lookups/LookupDomain/master/entity_document_link_link_kind.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_identity_binding_sync_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_verification_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_relationship_verified_method.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_metadata: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.formula_expression_language', 'Formula Expression Language', 'Evaluation engine / language used to execute a formula (jsonlogic, cel, javascript, python, sql_expr). is_extensible=false — new languages require a server-side evaluator before they can be used.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control.formula_kind', 'Formula Kind', 'Functional classification of a formula rule (payroll, accrual, tax, benefit, leave, pricing). is_extensible=false — new kinds require matching engine support.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity.entity_class', 'Entity Class', 'Structural classification driving governance profiles.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_field.cardinality', 'Field Cardinality', 'How many values a field holds.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_field.compute_mode', 'Field Compute Mode', 'When/where a computed field value is derived (database trigger, server function, client formula, projection).', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_field.data_type', 'Field Data Type', 'PostgreSQL-mappable data type for entity fields.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_field.ui_type', 'Field UI Type', 'Renderer hint for an entity field — controls which input/display component is used in forms and lists.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity.mutability', 'Entity Mutability', 'How much a tenant can customise the entity.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_relation.kind', 'Relation Kind', 'FK/join relationship direction.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.field_classification', 'Field Data Classification', 'Sensitivity classification for field_access_log.field_classification. Drives retention policy and compliance report scope. is_extensible=true — tenants can add domain-specific classifications.', 'log', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.entity_document_link.link_kind', 'Entity Document Link Kind', 'Attachment link kind for entity document links (primary, related, supporting, compliance, audit). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_identity_binding.sync_status', 'Principal Identity Sync Status', 'IdP synchronization health for principal identity bindings (pending, synced, drift, error, disabled). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_relationship_type', 'Principal Relationship Type', 'Correlation types between principals, such as same-human, duplicate candidate, merge, transfer, or support shadow.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_relationship_verification_status', 'Principal Relationship Verification Status', 'Verification state for a principal relationship correlation.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_relationship_verified_method', 'Principal Relationship Verification Method', 'Method used to verify a principal relationship correlation.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('overlay_change.kind', 'Overlay Change Kind', 'Type of change operation within an overlay.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('jsonlogic', 'JSONLogic', 'control.formula_expression_language', 'JSON-based rule engine (jsonlogic.com); safe, sandboxed, serialisable', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cel', 'CEL', 'control.formula_expression_language', 'Common Expression Language — Google; used in OPA / gRPC policy evaluation', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('javascript', 'JavaScript (VM)', 'control.formula_expression_language', 'Sandboxed JS evaluated in an isolated Node.js VM context', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('python', 'Python (Sandbox)', 'control.formula_expression_language', 'Restricted Python evaluated via RestrictedPython or Pyodide WASM sandbox', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sql_expr', 'SQL Expression', 'control.formula_expression_language', 'PostgreSQL expression evaluated server-side using a named function', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payroll', 'Payroll', 'control.formula_kind', 'Salary component calculation: earnings, deductions, statutory contributions', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accrual', 'Accrual', 'control.formula_kind', 'Month-end or period-end provision accrual (gratuity, leave encashment)', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax', 'Tax', 'control.formula_kind', 'Income tax or withholding tax computation using rate slabs / tables', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('benefit', 'Benefit', 'control.formula_kind', 'Employee benefit valuation (medical insurance premium, perquisite valuation)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('leave', 'Leave', 'control.formula_kind', 'Leave balance accrual, encashment, or carry-forward computation', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pricing', 'Pricing', 'control.formula_kind', 'Commercial pricing or margin formula unrelated to payroll or HR', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reference', 'Reference', 'entity.entity_class', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master', 'Master', 'entity.entity_class', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('control', 'Control', 'entity.entity_class', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document', 'Document', 'entity.entity_class', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document_relation', 'Document Relation', 'entity.entity_class', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ledger', 'Ledger', 'entity.entity_class', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log', 'Log', 'entity.entity_class', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('aggregate', 'Aggregate', 'entity.entity_class', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('dimension', 'Dimension', 'entity.entity_class', NULL, NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('relation', 'Relation', 'entity.entity_class', NULL, NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('one', 'One', 'entity_field.cardinality', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('many', 'Many', 'entity_field.cardinality', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('zero_or_one', 'Zero or One', 'entity_field.cardinality', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('database', 'Database', 'entity_field.compute_mode', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('server', 'Server', 'entity_field.compute_mode', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('client', 'Client', 'entity_field.compute_mode', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('projection', 'Projection', 'entity_field.compute_mode', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service', 'Service', 'entity_field.compute_mode', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('generated', 'DB Generated Column', 'entity_field.compute_mode', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('trigger', 'DB Trigger', 'entity_field.compute_mode', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pricing_components', 'Pricing Components', 'entity_field.compute_mode', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('flow', 'Workflow-Managed', 'entity_field.compute_mode', NULL, NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('string', 'String', 'entity_field.data_type', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('text', 'Text', 'entity_field.data_type', NULL, NULL, 11, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('integer', 'Integer', 'entity_field.data_type', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bigint', 'Bigint', 'entity_field.data_type', NULL, NULL, 21, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('decimal', 'Decimal', 'entity_field.data_type', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('numeric', 'Numeric', 'entity_field.data_type', NULL, NULL, 31, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('boolean', 'Boolean', 'entity_field.data_type', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('uuid', 'UUID', 'entity_field.data_type', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('date', 'Date', 'entity_field.data_type', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('datetime', 'Datetime', 'entity_field.data_type', NULL, NULL, 61, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('timestamptz', 'Timestamptz', 'entity_field.data_type', NULL, NULL, 62, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('json', 'JSON', 'entity_field.data_type', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('jsonb', 'JSONB', 'entity_field.data_type', NULL, NULL, 71, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('enum', 'Enum', 'entity_field.data_type', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('lifecycle_state', 'Lifecycle State', 'entity_field.data_type', NULL, NULL, 85, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reference', 'Reference', 'entity_field.data_type', NULL, NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('money', 'Money', 'entity_field.data_type', NULL, NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tsvector', 'TSVector', 'entity_field.data_type', NULL, NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('text_array', 'Text Array', 'entity_field.data_type', NULL, NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('uuid_array', 'UUID Array', 'entity_field.data_type', NULL, NULL, 121, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('int_array', 'Int Array', 'entity_field.data_type', NULL, NULL, 122, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('jsonb_array', 'JSONB Array', 'entity_field.data_type', NULL, NULL, 123, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('text', 'Text', 'entity_field.ui_type', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('textarea', 'Textarea', 'entity_field.ui_type', NULL, NULL, 11, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('email', 'Email', 'entity_field.ui_type', NULL, NULL, 12, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('phone', 'Phone', 'entity_field.ui_type', NULL, NULL, 13, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('url', 'URL', 'entity_field.ui_type', NULL, NULL, 14, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('number', 'Number', 'entity_field.ui_type', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('currency', 'Currency / Money', 'entity_field.ui_type', NULL, NULL, 21, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('percent', 'Percent', 'entity_field.ui_type', NULL, NULL, 22, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('select', 'Select (enum)', 'entity_field.ui_type', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('radio', 'Radio Group', 'entity_field.ui_type', NULL, NULL, 31, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('checkbox', 'Checkbox', 'entity_field.ui_type', NULL, NULL, 32, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tags', 'Tags / Multi-select', 'entity_field.ui_type', NULL, NULL, 33, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('date', 'Date', 'entity_field.ui_type', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('datetime', 'Date & Time', 'entity_field.ui_type', NULL, NULL, 41, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reference', 'Reference (UUID)', 'entity_field.ui_type', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity_chooser', 'Entity Chooser', 'entity_field.ui_type', NULL, NULL, 51, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('lookup_chooser', 'Lookup Chooser', 'entity_field.ui_type', NULL, NULL, 52, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('country', 'Country Picker', 'entity_field.ui_type', NULL, NULL, 53, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('currency_code', 'Currency Picker', 'entity_field.ui_type', NULL, NULL, 54, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('json', 'JSON Editor', 'entity_field.ui_type', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('json_editor', 'JSON Editor (alt)', 'entity_field.ui_type', NULL, NULL, 61, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('code', 'Code Editor', 'entity_field.ui_type', NULL, NULL, 62, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rich_text', 'Rich Text', 'entity_field.ui_type', NULL, NULL, 63, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('status', 'Status Badge', 'entity_field.ui_type', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('image', 'Image', 'entity_field.ui_type', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('file', 'File Upload', 'entity_field.ui_type', NULL, NULL, 81, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('color', 'Color Picker', 'entity_field.ui_type', NULL, NULL, 82, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('hidden', 'Hidden', 'entity_field.ui_type', NULL, NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('computed', 'Computed Display', 'entity_field.ui_type', NULL, NULL, 91, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('locked', 'Locked', 'entity.mutability', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('controlled', 'Controlled', 'entity.mutability', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('extensible', 'Extensible', 'entity.mutability', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('belongs_to', 'Belongs To', 'entity_relation.kind', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('has_many', 'Has Many', 'entity_relation.kind', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('m2m', 'Many to Many', 'entity_relation.kind', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pii', 'Personally Identifiable Information', 'log.field_classification', 'Fields that directly identify a person (name, email, NIC, passport). Retention: 7 years. GDPR Article 4(1) scope.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sensitive', 'Sensitive', 'log.field_classification', 'Fields requiring heightened access control but not strictly PII (salary, performance rating, medical notes). Retention: 2 years.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('confidential', 'Confidential', 'log.field_classification', 'Business-confidential data (pricing, contracts, M&A data). Retention: 2 years.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('regulated', 'Regulated', 'log.field_classification', 'Fields subject to specific regulatory retention or access requirements (GDPR special categories, PDPA sensitive data). Retention: 7 years.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('financial', 'Financial', 'log.field_classification', 'Financial data requiring SOX-level access logging (GL balances, payment details). Retention: 7 years.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('primary', 'Primary', 'master.entity_document_link.link_kind', 'Primary attachment.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('related', 'Related', 'master.entity_document_link.link_kind', 'Related attachment.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('supporting', 'Supporting', 'master.entity_document_link.link_kind', 'Supporting attachment.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('compliance', 'Compliance', 'master.entity_document_link.link_kind', 'Compliance attachment.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('audit', 'Audit', 'master.entity_document_link.link_kind', 'Audit attachment.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pending', 'Pending', 'master.principal_identity_binding.sync_status', 'Sync pending.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('synced', 'Synced', 'master.principal_identity_binding.sync_status', 'Sync completed.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('drift', 'Drift', 'master.principal_identity_binding.sync_status', 'Provider drift detected.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('error', 'Error', 'master.principal_identity_binding.sync_status', 'Sync error.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('disabled', 'Disabled', 'master.principal_identity_binding.sync_status', 'Provider identity disabled.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('same_human', 'Same Human', 'master.principal_relationship_type', 'Verified correlation that two principals represent the same human in different planes or tenants.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('duplicate_candidate', 'Duplicate Candidate', 'master.principal_relationship_type', 'Potential duplicate principal requiring review.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('duplicate_confirmed', 'Duplicate Confirmed', 'master.principal_relationship_type', 'Duplicate principal has been confirmed but not necessarily merged.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('merged_into', 'Merged Into', 'master.principal_relationship_type', 'Source principal has been merged into the target principal.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('transfer_requested', 'Transfer Requested', 'master.principal_relationship_type', 'Principal ownership/access transfer has been requested.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('transfer_completed', 'Transfer Completed', 'master.principal_relationship_type', 'Principal ownership/access transfer has been completed.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('support_shadow_for', 'Support Shadow For', 'master.principal_relationship_type', 'Tenant-local support shadow principal mapped to the product-owner principal it represents.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('email_alias', 'Email Alias', 'master.principal_relationship_type', 'Principals are correlated by verified email alias relationship.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('unverified', 'Unverified', 'master.principal_relationship_verification_status', 'Correlation exists but has not been verified.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pending', 'Pending', 'master.principal_relationship_verification_status', 'Correlation verification is in progress.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('verified', 'Verified', 'master.principal_relationship_verification_status', 'Correlation has been verified.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rejected', 'Rejected', 'master.principal_relationship_verification_status', 'Correlation was reviewed and rejected.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('superseded', 'Superseded', 'master.principal_relationship_verification_status', 'Correlation was replaced by a newer relationship.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('email_match', 'Email Match', 'master.principal_relationship_verified_method', 'Verified using normalized email match and policy-approved context.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('email_otp', 'Email OTP', 'master.principal_relationship_verified_method', 'Verified by one-time passcode sent to the email owner.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('idp_claim', 'IdP Claim', 'master.principal_relationship_verified_method', 'Verified through identity provider claim or federation metadata.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('admin_review', 'Admin Review', 'master.principal_relationship_verified_method', 'Verified by authorized administrator review.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user_claim', 'User Claim', 'master.principal_relationship_verified_method', 'Verified through user-initiated claim/consent flow.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('support_grant', 'Support Grant', 'master.principal_relationship_verified_method', 'Verified through a tenant-approved support access grant.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('migration', 'Migration', 'master.principal_relationship_verified_method', 'Verified by controlled data migration or backfill.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('add_field', 'Add Field', 'overlay_change.kind', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('remove_field', 'Remove Field', 'overlay_change.kind', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('modify_field', 'Modify Field', 'overlay_change.kind', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tweak_policy', 'Tweak Policy', 'overlay_change.kind', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('override_validation', 'Override Validation', 'overlay_change.kind', NULL, NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('override_ui', 'Override UI', 'overlay_change.kind', NULL, NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('add_index', 'Add Index', 'overlay_change.kind', NULL, NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('remove_index', 'Remove Index', 'overlay_change.kind', NULL, NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tweak_relation', 'Tweak Relation', 'overlay_change.kind', NULL, NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.formula_expression_language', 'control.formula_kind', 'entity.entity_class', 'entity_field.cardinality', 'entity_field.compute_mode', 'entity_field.data_type', 'entity_field.ui_type', 'entity.mutability', 'entity_relation.kind', 'log.field_classification', 'master.entity_document_link.link_kind', 'master.principal_identity_binding.sync_status', 'master.principal_relationship_type', 'master.principal_relationship_verification_status', 'master.principal_relationship_verified_method', 'overlay_change.kind'])) <> 134 THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_metadata: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.formula_expression_language', 'control.formula_kind', 'entity.entity_class', 'entity_field.cardinality', 'entity_field.compute_mode', 'entity_field.data_type', 'entity_field.ui_type', 'entity.mutability', 'entity_relation.kind', 'log.field_classification', 'master.entity_document_link.link_kind', 'master.principal_identity_binding.sync_status', 'master.principal_relationship_type', 'master.principal_relationship_verification_status', 'master.principal_relationship_verified_method', 'overlay_change.kind']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_metadata: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.formula_expression_language', 'control.formula_kind', 'entity.entity_class', 'entity_field.cardinality', 'entity_field.compute_mode', 'entity_field.data_type', 'entity_field.ui_type', 'entity.mutability', 'entity_relation.kind', 'log.field_classification', 'master.entity_document_link.link_kind', 'master.principal_identity_binding.sync_status', 'master.principal_relationship_type', 'master.principal_relationship_verification_status', 'master.principal_relationship_verified_method', 'overlay_change.kind']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_metadata: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.formula_expression_language', 'control.formula_kind', 'entity.entity_class', 'entity_field.cardinality', 'entity_field.compute_mode', 'entity_field.data_type', 'entity_field.ui_type', 'entity.mutability', 'entity_relation.kind', 'log.field_classification', 'master.entity_document_link.link_kind', 'master.principal_identity_binding.sync_status', 'master.principal_relationship_type', 'master.principal_relationship_verification_status', 'master.principal_relationship_verified_method', 'overlay_change.kind']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_metadata: semantic assertion failed';
  END IF;
END $assertions$;
