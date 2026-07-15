-- Immutable platform-global governance profiles per entity class.
-- '*' wildcard row provides default field_flag_rules at lowest precedence.

INSERT INTO control.entity_class_profile (
    class_key, label, description,
    valid_governance_levels, default_governance_level,
    valid_mutability, default_mutability, default_security_tier,
    expected_system_columns,
    field_flag_rules, security_tiers, compliance_profile
)
VALUES
    ('REFERENCE', 'Reference', 'Shared reference data: currencies, countries, UoM, codes.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled'], 'locked', 'config',
     ARRAY['id','tenant_id','created_at','created_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('MASTER', 'Master', 'Master data: organizations, tenants, users, core business entities.',
     ARRAY['full','standard','lite'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"sampled","by_category":{}}}'::jsonb),

    ('CONTROL', 'Control', 'Access control, permissions, metadata/lookup registry, policy rules.',
     ARRAY['full','standard'], 'full',
     ARRAY['locked','controlled'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":true},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"required","by_category":{}}}'::jsonb),

    ('DOCUMENT', 'Document', 'Transactional documents: invoices, credit notes, payments, journal entries.',
     ARRAY['full','standard'], 'full',
     ARRAY['locked','controlled'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"sampled","by_category":{}}}'::jsonb),

    ('DOCUMENT_RELATION', 'Document Relation', 'Junction and line tables relating transactional documents.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled'], 'controlled', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('LEDGER', 'Ledger', 'General ledger: chart of accounts, fiscal periods, and financial postings.',
     ARRAY['full'], 'full',
     ARRAY['locked'], 'locked', 'tenant_critical',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":true,"is_audit_on_read":true},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":true,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"required","by_category":{}}}'::jsonb),

    ('LOG', 'Log', 'Audit trails, change logs, and activity history.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked'], 'locked', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('AGGREGATE', 'Aggregate', 'Pre-computed aggregates, balances, KPIs, and materialized summaries.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked'], 'locked', 'operational',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('DIMENSION', 'Dimension', 'Configurable analytical dimensions: cost centres, profit centres, projects.',
     ARRAY['full','standard'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by','updated_at','updated_by','status'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('RELATION', 'Relation', 'Junction tables and many-to-many relationships between master/control entities.',
     ARRAY['full','standard','lite'], 'lite',
     ARRAY['locked','controlled'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"lite","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb),

    ('*', 'Wildcard', 'Default field flag rules applied to all entity classes (lowest priority).',
     ARRAY['full','standard','lite'], 'standard',
     ARRAY['locked','controlled','extensible'], 'controlled', 'config',
     ARRAY['id','tenant_id','created_at','created_by'],
     '[]'::jsonb,
     '{"platform_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"tenant_critical":{"min_governance":"full","is_created_by_required":true,"is_updated_by_required":true,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"operational":{"min_governance":"standard","is_created_by_required":true,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false},"config":{"min_governance":"lite","is_created_by_required":false,"is_updated_by_required":false,"is_change_reason_required":false,"is_change_approval_required":false,"is_audit_on_read":false}}'::jsonb,
     '{"linting_rules":[],"required_field_patterns":[],"audit_rules":{"default_disposition":"disabled","by_category":{}}}'::jsonb)

ON CONFLICT (class_key) DO NOTHING;

