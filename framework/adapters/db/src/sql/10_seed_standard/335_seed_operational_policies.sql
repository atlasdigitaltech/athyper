/* ============================================================================
   Athyper v2.1 — Seed: Operational Policies
   Seeds default data retention, event tiering, PII classification + privacy
   metadata, and tenant resource quotas.

   Dependencies:
     core.data_retention_policy  (074_data_retention_policy.sql)
     evt.data_tiering_policy     (151_event_tiering.sql)
     core.tenant_resource_quota  (075_tenant_resource_quota.sql)
     meta.field_security_policy  (040_meta.sql + 074 ALTER)
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_entity_id uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- 1. DATA RETENTION POLICIES (per schema/table)
        --    Precedence: entity > table > schema (see core.resolve_retention_policy)
        -- ====================================================================

        -- Event store: 36 months before archival (must >= tiering warm_months * 30)
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'table', 'evt', 'event', 1095,
             'ARCHIVE', 'INTERNAL', 100, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- Audit logs: 24 months (GDPR minimum for financial records)
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'table', 'audit', 'audit_log', 730,
             'ARCHIVE', 'GDPR', 90, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- Permission decision logs: 12 months
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'table', 'audit', 'permission_decision_log', 365,
             'ARCHIVE', 'SOC2', 90, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- Workflow audit: 36 months (financial compliance)
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'table', 'audit', 'workflow_event_log', 1095,
             'ARCHIVE', 'SOC2', 80, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- Notification delivery logs: 6 months
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'table', 'notify', 'delivery_log', 180,
             'DELETE', 'INTERNAL', 200, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- Collaboration schema: 12 months (aligned with comment_retention_policy)
        INSERT INTO core.data_retention_policy
            (tenant_id, policy_scope, target_schema, target_table, retention_days,
             action_on_expiry, compliance_framework, priority, version, created_by)
        VALUES
            (v_tenant, 'schema', 'collab', null, 365,
             'ARCHIVE', 'GDPR', 200, 1, 'system')
        ON CONFLICT DO NOTHING;

        -- ====================================================================
        -- 2. EVENT STORE TIERING POLICY (default: 3/12 months)
        --    Relationship: retention_days (1095) >= warm_months * 30 (360) ✓
        -- ====================================================================

        -- Default tiering: all event partitions (table-wide, no partition_domain)
        INSERT INTO evt.data_tiering_policy
            (tenant_id, source_schema, source_table, partition_domain,
             hot_months, warm_months,
             warm_strategy, cold_strategy,
             version, created_by)
        VALUES
            (v_tenant, 'evt', 'event', null,
             3, 12,
             'COMPRESS', 'ARCHIVE_NDJSON',
             1, 'system')
        ON CONFLICT DO NOTHING;

        -- ====================================================================
        -- 3. PII CLASSIFICATION + PRIVACY METADATA
        --    Updates existing field_security_policy rows with:
        --    - pii_classification (DIRECT_ID, CONTACT, SENSITIVE, FINANCIAL)
        --    - privacy_metadata (lawful_basis, consent, retention override, etc.)
        -- ====================================================================

        -- Employee fields: DIRECT_ID (GDPR Art 6(1)(b) — contract performance)
        UPDATE meta.field_security_policy
        SET pii_classification = 'DIRECT_ID',
            privacy_metadata = jsonb_build_object(
                'lawful_basis', 'contract',
                'consent_required', false,
                'retention_override_days', 2555,
                'anonymization_strategy', 'hash',
                'cross_border_restricted', true,
                'data_subject_type', 'employee'
            ),
            updated_at = now(), updated_by = 'system'
        WHERE tenant_id = v_tenant
          AND pii_classification IS NULL
          AND field_path IN ('tax_id', 'national_id', 'passport_number', 'social_security_number')
          AND EXISTS (
              SELECT 1 FROM meta.entity e
              WHERE e.id = meta.field_security_policy.entity_id
                AND e.name = 'Employee'
          );

        -- Employee fields: CONTACT (GDPR Art 6(1)(b) — contract performance)
        UPDATE meta.field_security_policy
        SET pii_classification = 'CONTACT',
            privacy_metadata = jsonb_build_object(
                'lawful_basis', 'contract',
                'consent_required', false,
                'anonymization_strategy', 'redact',
                'cross_border_restricted', false,
                'data_subject_type', 'employee'
            ),
            updated_at = now(), updated_by = 'system'
        WHERE tenant_id = v_tenant
          AND pii_classification IS NULL
          AND field_path IN ('personal_email', 'personal_phone', 'emergency_contact')
          AND EXISTS (
              SELECT 1 FROM meta.entity e
              WHERE e.id = meta.field_security_policy.entity_id
                AND e.name = 'Employee'
          );

        -- Employee fields: SENSITIVE (GDPR Art 6(1)(b) + Art 9 special category)
        UPDATE meta.field_security_policy
        SET pii_classification = 'SENSITIVE',
            privacy_metadata = jsonb_build_object(
                'lawful_basis', 'contract',
                'consent_required', false,
                'anonymization_strategy', 'suppress',
                'cross_border_restricted', true,
                'data_subject_type', 'employee'
            ),
            updated_at = now(), updated_by = 'system'
        WHERE tenant_id = v_tenant
          AND pii_classification IS NULL
          AND field_path IN ('termination_date', 'salary', 'compensation')
          AND EXISTS (
              SELECT 1 FROM meta.entity e
              WHERE e.id = meta.field_security_policy.entity_id
                AND e.name = 'Employee'
          );

        -- Financial fields: FINANCIAL (GDPR Art 6(1)(f) — legitimate interest)
        UPDATE meta.field_security_policy
        SET pii_classification = 'FINANCIAL',
            privacy_metadata = jsonb_build_object(
                'lawful_basis', 'legitimate_interest',
                'consent_required', false,
                'retention_override_days', 2555,
                'anonymization_strategy', 'redact',
                'cross_border_restricted', true,
                'data_subject_type', 'supplier'
            ),
            updated_at = now(), updated_by = 'system'
        WHERE tenant_id = v_tenant
          AND pii_classification IS NULL
          AND field_path IN ('total_limit', 'reserved_amount', 'committed_amount', 'consumed_amount',
                             'bank_account', 'routing_number', 'swift_code')
          AND EXISTS (
              SELECT 1 FROM meta.entity e
              WHERE e.id = meta.field_security_policy.entity_id
                AND e.table_schema = 'fin'
          );

        -- ====================================================================
        -- 4. TENANT RESOURCE QUOTAS (based on subscription tier)
        --    Enforced via core.check_quota() at runtime.
        --    Usage tracked via core.record_quota_usage() + quota_usage_snapshot.
        -- ====================================================================

        INSERT INTO core.tenant_resource_quota
            (tenant_id, quota_key, quota_name, category,
             limit_value, limit_unit, warning_pct,
             enforcement, overage_action, applies_to_tiers, created_by)
        VALUES
            -- API rate limit: 1000 requests per minute
            (v_tenant, 'api_rate_limit', 'API Rate Limit', 'API',
             1000, 'RPM', 80,
             'HARD', 'THROTTLE', ARRAY['base'], 'system'),
            -- Active users: 50 per tenant
            (v_tenant, 'max_active_users', 'Maximum Active Users', 'USERS',
             50, 'COUNT', 90,
             'HARD', 'BLOCK', ARRAY['base'], 'system'),
            -- Storage: 10 GB
            (v_tenant, 'storage_limit', 'Storage Limit', 'STORAGE',
             10, 'GB', 80,
             'SOFT', 'WARN', ARRAY['base'], 'system'),
            -- Event throughput: 5000 events per hour
            (v_tenant, 'event_throughput', 'Event Throughput', 'EVENTS',
             5000, 'RPH', 80,
             'SOFT', 'THROTTLE', ARRAY['base'], 'system'),
            -- Background jobs: 5 concurrent
            (v_tenant, 'concurrent_jobs', 'Concurrent Background Jobs', 'COMPUTE',
             5, 'CONCURRENT', 80,
             'HARD', 'BLOCK', ARRAY['base'], 'system'),
            -- Integrations: 10 connections
            (v_tenant, 'integration_connections', 'Integration Connections', 'INTEGRATIONS',
             10, 'COUNT', 90,
             'HARD', 'BLOCK', ARRAY['base'], 'system'),
            -- Exports: 50 per day
            (v_tenant, 'export_daily_limit', 'Daily Export Limit', 'EXPORT',
             50, 'RPD', 80,
             'SOFT', 'WARN', ARRAY['base'], 'system')
        ON CONFLICT DO NOTHING;

    END LOOP;
END $$;
