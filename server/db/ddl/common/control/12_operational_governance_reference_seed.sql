INSERT INTO control.connector_type (
    id, code, name, category_code, description, auth_types, capabilities, created_by
)
VALUES
    ('01990000-0000-7000-8000-000000000001', 'http', 'HTTP API', 'api',
     'Generic HTTP or REST integration adapter.', ARRAY['none','basic','bearer','oauth2'],
     ARRAY['request','webhook'], '00000000-0000-0000-0000-000000000000'),
    ('01990000-0000-7000-8000-000000000002', 'sftp', 'SFTP', 'file_transfer',
     'Secure file transfer integration adapter.', ARRAY['ssh_key','password'],
     ARRAY['upload','download'], '00000000-0000-0000-0000-000000000000'),
    ('01990000-0000-7000-8000-000000000003', 'email', 'Email', 'messaging',
     'Email transport integration adapter.', ARRAY['basic','oauth2','api_key'],
     ARRAY['send'], '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    category_code = EXCLUDED.category_code,
    description = EXCLUDED.description,
    auth_types = EXCLUDED.auth_types,
    capabilities = EXCLUDED.capabilities;

INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible, metadata, status, created_by
)
VALUES (
    'governance.cycle_domain',
    'Governance Cycle Domain',
    'Cross-plane business domain governed by a cycle blueprint.',
    'governance',
    true,
    '{"configurability":"tenant_extensible"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, v.code, v.name, 'governance.cycle_domain',
       v.description, v.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('finance_close', 'Finance Close', 'Accounting and financial close governance.', 10::smallint),
    ('governance_review', 'Governance Review', 'Policy, compliance, and certification review.', 20::smallint),
    ('data_retention', 'Data Retention', 'Retention, archival, and defensible disposition.', 30::smallint),
    ('integration_sync', 'Integration Sync', 'Cross-system synchronization and reconciliation.', 40::smallint),
    ('backup_governance', 'Backup Governance', 'Backup evidence, validation, and recovery review.', 50::smallint)
) v(code, name, description, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    status = 'active';
