-- Registers master-schema relations that were not covered by the hand-authored
-- entity seeds.  The rows are guarded by information_schema checks so this seed
-- can run safely across environments where optional master modules differ.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000000';
    v_rows integer := 0;
    v_version_rows integer := 0;
BEGIN
    WITH coverage (
        module_code,
        table_name,
        entity_short,
        entity_class,
        backing_type,
        governance_level,
        security_tier,
        mutability,
        label_singular,
        label_plural,
        icon_key,
        color_token,
        is_readonly,
        natural_key_fields,
        feature_flags,
        display_config
    ) AS (
        VALUES
            -- Tenant and numbering controls
            ('FND', 'tenant_parameter_definition', 'TPDEF', 'CONTROL', 'table', 'full', 'config', 'controlled',
                'Tenant Parameter Definition', 'Tenant Parameter Definitions', 'settings', 'cyan', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('FND', 'tenant_parameter_value', 'TPVAL', 'CONTROL', 'table', 'full', 'config', 'controlled',
                'Tenant Parameter Value', 'Tenant Parameter Values', 'sliders-horizontal', 'cyan', false,
                ARRAY['parameter_code']::text[], '{}'::jsonb, '{}'::jsonb),
            -- Business partner, network, and legal-entity relationships
            ('ACC', 'network_provider', 'NETPRV', 'REFERENCE', 'table', 'light', 'operational', 'controlled',
                'Network Provider', 'Network Providers', 'network', 'indigo', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'business_partner_network_capability', 'BPNCAP', 'RELATION', 'table', 'light', 'operational', 'controlled',
                'Business Partner Network Capability', 'Business Partner Network Capabilities', 'radio-tower', 'indigo', false,
                ARRAY['business_partner_id', 'network_provider_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'business_partner_relation', 'BPREL', 'RELATION', 'table', 'full', 'operational', 'controlled',
                'Business Partner Relation', 'Business Partner Relations', 'git-branch', 'blue', false,
                ARRAY['source_business_partner_id', 'target_business_partner_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'intercompany_trading_pair', 'ICTP', 'MASTER', 'table', 'full', 'operational', 'controlled',
                'Intercompany Trading Pair', 'Intercompany Trading Pairs', 'repeat-2', 'blue', false,
                ARRAY['seller_legal_entity_id', 'buyer_legal_entity_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'legal_entity_business_partner_link', 'LEBPL', 'RELATION', 'table', 'full', 'operational', 'controlled',
                'Legal Entity Business Partner Link', 'Legal Entity Business Partner Links', 'link-2', 'blue', false,
                ARRAY['legal_entity_id', 'business_partner_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('IAM', 'legal_entity_identity_binding', 'LEIDB', 'CONTROL', 'table', 'full', 'tenant_critical', 'locked',
                'Legal Entity Identity Binding', 'Legal Entity Identity Bindings', 'fingerprint', 'red', false,
                ARRAY['legal_entity_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_contact_role', 'PCR', 'RELATION', 'table', 'light', 'operational', 'controlled',
                'Party Contact Role', 'Party Contact Roles', 'contact', 'teal', false,
                ARRAY['party_id', 'contact_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'certification_type', 'CERTT', 'REFERENCE', 'table', 'light', 'config', 'controlled',
                'Certification Type', 'Certification Types', 'badge-check', 'green', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),

            -- Party risk model and scoring metadata
            ('ACC', 'risk_dimension', 'RSKDIM', 'REFERENCE', 'table', 'light', 'tenant_critical', 'controlled',
                'Risk Dimension', 'Risk Dimensions', 'gauge', 'amber', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'risk_source', 'RSKSRC', 'REFERENCE', 'table', 'light', 'tenant_critical', 'controlled',
                'Risk Source', 'Risk Sources', 'radar', 'amber', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'risk_driver_registry', 'RSKDRVREG', 'REFERENCE', 'table', 'light', 'tenant_critical', 'controlled',
                'Risk Driver Registry', 'Risk Driver Registry', 'list-checks', 'amber', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'risk_model', 'RSKMOD', 'CONTROL', 'table', 'full', 'tenant_critical', 'controlled',
                'Risk Model', 'Risk Models', 'shield-alert', 'amber', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'risk_model_dimension', 'RSKMODDIM', 'RELATION', 'table', 'full', 'tenant_critical', 'controlled',
                'Risk Model Dimension', 'Risk Model Dimensions', 'git-merge', 'amber', false,
                ARRAY['risk_model_id', 'risk_dimension_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'tenant_risk_source_config', 'TRSKSRC', 'CONTROL', 'table', 'full', 'tenant_critical', 'controlled',
                'Tenant Risk Source Config', 'Tenant Risk Source Configs', 'shield-check', 'amber', false,
                ARRAY['risk_source_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_assessment', 'PRSKASM', 'MASTER', 'table', 'full', 'tenant_critical', 'controlled',
                'Party Risk Assessment', 'Party Risk Assessments', 'clipboard-check', 'amber', false,
                ARRAY['party_id', 'risk_model_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_dimension_score', 'PRSKDIM', 'MASTER', 'table', 'full', 'tenant_critical', 'controlled',
                'Party Risk Dimension Score', 'Party Risk Dimension Scores', 'activity', 'amber', false,
                ARRAY['assessment_id', 'risk_dimension_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_driver', 'PRSKDRV', 'MASTER', 'table', 'full', 'tenant_critical', 'controlled',
                'Party Risk Driver', 'Party Risk Drivers', 'triangle-alert', 'amber', false,
                ARRAY['assessment_id', 'risk_driver_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_evidence', 'PRSKEVD', 'DOCUMENT_RELATION', 'table', 'full', 'tenant_critical', 'controlled',
                'Party Risk Evidence', 'Party Risk Evidence', 'paperclip', 'amber', false,
                ARRAY['assessment_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_mitigation', 'PRSKMIT', 'MASTER', 'table', 'full', 'tenant_critical', 'controlled',
                'Party Risk Mitigation', 'Party Risk Mitigations', 'shield', 'amber', false,
                ARRAY['assessment_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('ACC', 'party_risk_review_event', 'PRSKREV', 'LOG', 'table', 'audit_only', 'tenant_critical', 'locked',
                'Party Risk Review Event', 'Party Risk Review Events', 'history', 'amber', true,
                ARRAY['assessment_id']::text[], '{}'::jsonb, '{}'::jsonb),

            -- User workspace state and attachments
            ('CMS', 'attachment_folder', 'ATTFOL', 'MASTER', 'table', 'light', 'operational', 'controlled',
                'Attachment Folder', 'Attachment Folders', 'folder', 'slate', false,
                ARRAY['name']::text[], '{}'::jsonb, '{}'::jsonb),
            ('FND', 'filter_preset', 'FLTPRE', 'CONTROL', 'table', 'light', 'config', 'controlled',
                'Filter Preset', 'Filter Presets', 'filter', 'slate', false,
                ARRAY['entity_code', 'name']::text[], '{}'::jsonb, '{}'::jsonb),
            ('FND', 'record_bookmark', 'RECBMK', 'CONTROL', 'table', 'audit_only', 'config', 'controlled',
                'Record Bookmark', 'Record Bookmarks', 'bookmark', 'slate', false,
                ARRAY['entity_code', 'record_id']::text[], '{}'::jsonb, '{}'::jsonb),
            ('IAM', 'trusted_device', 'TRDEV', 'CONTROL', 'table', 'full', 'tenant_critical', 'locked',
                'Trusted Device', 'Trusted Devices', 'smartphone', 'red', false,
                ARRAY['principal_id', 'device_fingerprint']::text[], '{}'::jsonb, '{}'::jsonb),

            -- Optional physical table present in Prisma in some branches.
            ('ACC', 'accounting_profile', 'ACCPROF', 'MASTER', 'table', 'full', 'operational', 'controlled',
                'Accounting Profile', 'Accounting Profiles', 'landmark', 'blue', false,
                ARRAY['code']::text[], '{}'::jsonb, '{}'::jsonb),

            -- Master read models / projection views.  These stay read-only but
            -- are still described so UI search, picker, and reporting surfaces
            -- can reason about them consistently.
            ('ACC', 'v_bank_account_resolved', 'VBANKR', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Resolved Bank Account', 'Resolved Bank Accounts', 'landmark', 'slate', true,
                ARRAY['bank_account_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('ACC', 'v_bank_account_link_resolved', 'VBANKLR', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Resolved Bank Account Link', 'Resolved Bank Account Links', 'link', 'slate', true,
                ARRAY['bank_account_link_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('ACC', 'v_business_partner_governance_summary', 'VBPGOV', 'AGGREGATE', 'view', 'audit_only', 'tenant_critical', 'locked',
                'Business Partner Governance Summary', 'Business Partner Governance Summaries', 'clipboard-list', 'slate', true,
                ARRAY['business_partner_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('CRM', 'v_contact_summary', 'VCTSUM', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Contact Summary', 'Contact Summaries', 'contact', 'slate', true,
                ARRAY['contact_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('IAM', 'v_effective_principal_ui', 'VEFFPR', 'AGGREGATE', 'view', 'audit_only', 'tenant_critical', 'locked',
                'Effective Principal UI', 'Effective Principal UI', 'user-check', 'slate', true,
                ARRAY['principal_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('HR', 'v_employee', 'VEMP', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Employee View', 'Employee Views', 'users', 'slate', true,
                ARRAY['employee_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('ACC', 'v_entity_commodity', 'VCOMMD', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Entity Commodity View', 'Entity Commodity Views', 'boxes', 'slate', true,
                ARRAY['commodity_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('FND', 'v_resolved_address', 'VADDR', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Resolved Address', 'Resolved Addresses', 'map-pin', 'slate', true,
                ARRAY['address_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('ACC', 'v_supplier_bank_account', 'VSUPBANK', 'AGGREGATE', 'view', 'audit_only', 'operational', 'locked',
                'Supplier Bank Account View', 'Supplier Bank Account Views', 'landmark', 'slate', true,
                ARRAY['supplier_id', 'bank_account_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb),
            ('ACC', 'v_tenant_risk_source_config', 'VTRSKSRC', 'AGGREGATE', 'view', 'audit_only', 'tenant_critical', 'locked',
                'Tenant Risk Source Config View', 'Tenant Risk Source Config Views', 'shield-check', 'slate', true,
                ARRAY['risk_source_id']::text[], '{}'::jsonb, '{"readOnly": true}'::jsonb)
    ),
    resolved AS (
        SELECT
            c.*,
            COALESCE(m.id::text, fnd.id::text, c.module_code) AS module_id
        FROM coverage c
        LEFT JOIN shared.module m
          ON m.code = c.module_code
        LEFT JOIN shared.module fnd
          ON fnd.code = 'FND'
        WHERE EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'master'
              AND t.table_name = c.table_name
            UNION ALL
            SELECT 1
            FROM information_schema.views v
            WHERE v.table_schema = 'master'
              AND v.table_name = c.table_name
        )
    )
    INSERT INTO control.entity (
        tenant_id,
        module_id,
        name,
        entity_short,
        entity_code,
        entity_class,
        ownership_model,
        kind,
        backing_type,
        governance_level,
        security_tier,
        mutability,
        table_schema,
        table_name,
        label_singular,
        label_plural,
        icon_key,
        color_token,
        feature_flags,
        display_config,
        identity_config,
        status,
        created_by,
        updated_by
    )
    SELECT
        NULL::uuid,
        r.module_id,
        r.table_name,
        r.entity_short,
        r.table_name,
        r.entity_class,
        'system',
        'ent',
        r.backing_type,
        r.governance_level,
        r.security_tier,
        r.mutability,
        'master',
        r.table_name,
        r.label_singular,
        r.label_plural,
        r.icon_key,
        r.color_token,
        jsonb_build_object(
            'metadata_coverage_source', 'master_schema_coverage',
            'is_readonly', r.is_readonly,
            'is_exportable', true,
            'is_importable', false
        ) || r.feature_flags,
        jsonb_build_object(
            'list_renderer', 'table',
            'detail_renderer', CASE WHEN r.is_readonly THEN 'readOnly' ELSE 'standard' END
        ) || r.display_config,
        jsonb_build_object('natural_key_fields', to_jsonb(r.natural_key_fields::text[])),
        'ACTIVE',
        v_system_user,
        v_system_user
    FROM resolved r
    ON CONFLICT (table_schema, table_name) DO UPDATE
    SET
        module_id = EXCLUDED.module_id,
        entity_short = EXCLUDED.entity_short,
        entity_class = EXCLUDED.entity_class,
        backing_type = EXCLUDED.backing_type,
        governance_level = EXCLUDED.governance_level,
        security_tier = EXCLUDED.security_tier,
        mutability = EXCLUDED.mutability,
        label_singular = EXCLUDED.label_singular,
        label_plural = EXCLUDED.label_plural,
        icon_key = EXCLUDED.icon_key,
        color_token = EXCLUDED.color_token,
        feature_flags = control.entity.feature_flags || EXCLUDED.feature_flags,
        display_config = control.entity.display_config || EXCLUDED.display_config,
        identity_config = COALESCE(control.entity.identity_config, '{}'::jsonb) || EXCLUDED.identity_config,
        updated_at = now(),
        updated_by = v_system_user
    WHERE control.entity.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage entity seed upserted % relation(s)', v_rows;

    -- The bulk 025_entity_versions.sql seed creates version 1 during a clean
    -- alphabetical run. This explicit upsert keeps incremental/checksum-based
    -- runs safe when the coverage entity file is applied after 025 already ran.
    INSERT INTO control.entity_version (
        entity_id,
        tenant_id,
        version_no,
        status,
        label,
        change_type,
        effective_from,
        created_by,
        updated_by
    )
    SELECT
        e.id,
        e.tenant_id,
        1,
        'EFFECTIVE',
        'Initial master schema coverage version',
        'structural',
        now(),
        v_system_user,
        v_system_user
    FROM control.entity e
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
    ON CONFLICT (entity_id, version_no) DO UPDATE
    SET
        status = 'EFFECTIVE',
        label = COALESCE(control.entity_version.label, EXCLUDED.label),
        change_type = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
        effective_from = COALESCE(control.entity_version.effective_from, now()),
        updated_at = now(),
        updated_by = v_system_user
    WHERE control.entity_version.status <> 'EFFECTIVE'
       OR control.entity_version.effective_from IS NULL;

    GET DIAGNOSTICS v_version_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage entity seed upserted % version row(s)', v_version_rows;

    UPDATE control.entity
       SET status = 'ARCHIVED',
           feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                           || jsonb_build_object('decommissioned_reason', 'legacy_numbering_replaced_by_entity_numbering_config'),
           updated_at = now(),
           updated_by = v_system_user
     WHERE table_schema = 'master'
       AND table_name = 'numbering_series'
       AND tenant_id IS NULL;
END $$;
