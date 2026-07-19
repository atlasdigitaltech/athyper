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

-- Full class-level cache defaults. Entity-specific overrides are authored only
-- in display_config.list_cache; the compiler never infers policy from a name.
UPDATE control.entity_class_profile
   SET cache_policy = CASE class_key
       WHEN 'REFERENCE' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":300,"retain_for_seconds":1800,"prefetch":"viewport","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'MASTER' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":120,"retain_for_seconds":900,"prefetch":"intent","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'CONTROL' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":60,"retain_for_seconds":600,"prefetch":"none","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'DOCUMENT' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":20,"retain_for_seconds":300,"prefetch":"intent","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"session","eager_prefetch_allowed":false}'::jsonb
       WHEN 'DOCUMENT_RELATION' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":15,"retain_for_seconds":300,"prefetch":"none","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'LEDGER' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":15,"retain_for_seconds":180,"prefetch":"none","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'LOG' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":5,"retain_for_seconds":60,"prefetch":"none","restore_scroll":false,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'AGGREGATE' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":30,"retain_for_seconds":300,"prefetch":"none","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'DIMENSION' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":120,"retain_for_seconds":900,"prefetch":"intent","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN 'RELATION' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":60,"retain_for_seconds":600,"prefetch":"none","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       WHEN '*' THEN '{"mode":"stale_while_revalidate","fresh_for_seconds":20,"retain_for_seconds":300,"prefetch":"intent","restore_scroll":true,"invalidate_on_mutation":true,"max_queries_per_entity":5,"max_rows_per_query":200,"storage":"memory","eager_prefetch_allowed":false}'::jsonb
       ELSE cache_policy
   END
 WHERE class_key = ANY (ARRAY[
       'REFERENCE','MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION',
       'LEDGER','LOG','AGGREGATE','DIMENSION','RELATION','*'
   ]);
