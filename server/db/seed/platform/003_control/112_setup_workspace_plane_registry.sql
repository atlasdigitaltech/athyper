-- Plane setup directories. Registry rows are the navigation authority; route
-- handlers still enforce their own operation permissions.
WITH definitions(code, route_slug, label, description, workspace_code, plane, base_path) AS (
  VALUES
    ('admin-setup', 'admin', 'Platform setup', 'Tenant, security and platform operations.', 'CORE', 'admin', '/setup'),
    ('supply-chain-setup', 'supply-chain', 'Supply Chain setup', 'Purchasing and supply-chain configuration.', 'SCM', 'neon', '/setup/supply-chain'),
    ('mesh-setup', 'network', 'Network setup', 'Network account and exchange delivery configuration.', 'PTR', 'mesh', '/setup/network')
)
INSERT INTO control.setup_workspace (
  workspace_id, code, route_slug, label, description, schema_version,
  scope_policies, capabilities, config, status, created_by
)
SELECT w.id, d.code, d.route_slug, d.label, d.description, '1.0',
  CASE d.plane
    WHEN 'admin' THEN '[{"type":"tenant","routeSegment":"tenant","selectionMode":"explicit","required":true}]'::jsonb
    WHEN 'mesh' THEN '[{"type":"tenant","routeSegment":"network-account","selectionMode":"explicit","required":true}]'::jsonb
    ELSE '[{"type":"tenant","routeSegment":"tenant","selectionMode":"explicit","required":true},{"type":"company_code","routeSegment":"company","selectionMode":"explicit","required":false}]'::jsonb
  END,
  '{"readiness":true,"certification":false,"issues":true,"activity":true,"search":true,"export":false}'::jsonb,
  jsonb_build_object(
    'plane', d.plane,
    'basePath', d.base_path,
    'entryPath', '/setup/' || d.route_slug,
    'overview', jsonb_build_object('title', d.label, 'layout', 'cards', 'showDomainProgress', true, 'showAttention', true, 'showRecentActivity', true, 'certificationEnabled', false)
  ),
  'ACTIVE', '00000000-0000-0000-0000-000000000000'::uuid
FROM definitions d JOIN shared.workspace w ON w.code = d.workspace_code
ON CONFLICT (code) DO UPDATE SET
  label = excluded.label, description = excluded.description, scope_policies = excluded.scope_policies,
  capabilities = excluded.capabilities, config = excluded.config, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by;

WITH domain_def(workspace_code, code, route_segment, label, description, module_code, sort_order, permissions, scopes) AS (
  VALUES
    ('admin-setup','tenants','tenants','Tenants','Tenant lifecycle and subscription setup.','FND',10,'["admin.tenant.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','iam','iam','Identity and access','Roles, groups, grants and identity providers.','IAM',20,'["iam.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','metadata','metadata','Metadata','Entity contracts, fields, lifecycles and publication.','META',30,'["metadata.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','integrations','integrations','Integrations','API, webhook and provider configuration.','INT',40,'["integration.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','jobs','jobs','Jobs','Schedulers, queues and automation configuration.','JOB',50,'["jobs.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','audit','audit','Audit','Audit policy and retention configuration.','AUD',60,'["audit.read"]'::jsonb,'["tenant"]'::jsonb),
    ('admin-setup','security','security','Security','Security policy and required controls.','IAM',70,'["security.read"]'::jsonb,'["tenant"]'::jsonb),
    ('supply-chain-setup','purchasing','purchasing','Purchasing','Purchasing organizations, policies and document controls.','BUY',10,'["purchasing.setup.view"]'::jsonb,'["tenant","company_code"]'::jsonb),
    ('supply-chain-setup','supply-chain','supply-chain','Supply chain','Supplier, sourcing and inventory setup.','SRM',20,'["supply_chain.setup.view"]'::jsonb,'["tenant","company_code"]'::jsonb),
    ('mesh-setup','network-account','network-account','Network account','Buyer or supplier account identity and onboarding.','FND',10,'["mesh.account.setup"]'::jsonb,'["tenant"]'::jsonb),
    ('mesh-setup','connections','connections','Connections','Buyer-supplier connection capabilities and policy.','PCON',20,'["mesh.connection.setup"]'::jsonb,'["tenant"]'::jsonb),
    ('mesh-setup','delivery','delivery','Delivery endpoints','Delivery endpoint, retry and acknowledgement configuration.','INT',30,'["mesh.delivery.setup"]'::jsonb,'["tenant"]'::jsonb),
    ('mesh-setup','document-exchange','document-exchange','Document exchange','Document families, validation and partner-safe projections.','DOC',40,'["mesh.exchange.setup"]'::jsonb,'["tenant"]'::jsonb)
)
INSERT INTO control.setup_domain (
  setup_workspace_id, owner_module_id, code, route_segment, label, description, icon_key,
  sort_order, contributing_module_codes, required_module_codes, required_permissions,
  supported_scope_types, sections, config, status, created_by
)
SELECT sw.id, m.id, d.code, d.route_segment, d.label, d.description, 'settings', d.sort_order,
  jsonb_build_array(d.module_code), jsonb_build_array(d.module_code), d.permissions, d.scopes,
  '[]'::jsonb, '{}'::jsonb, 'ACTIVE', '00000000-0000-0000-0000-000000000000'::uuid
FROM domain_def d
JOIN control.setup_workspace sw ON sw.code = d.workspace_code
JOIN shared.module m ON m.code = d.module_code
ON CONFLICT (setup_workspace_id, code) DO UPDATE SET
  owner_module_id = excluded.owner_module_id, route_segment = excluded.route_segment,
  label = excluded.label, description = excluded.description, sort_order = excluded.sort_order,
  contributing_module_codes = excluded.contributing_module_codes,
  required_module_codes = excluded.required_module_codes,
  required_permissions = excluded.required_permissions, supported_scope_types = excluded.supported_scope_types,
  status = excluded.status, updated_at = now(), updated_by = excluded.created_by;

UPDATE control.setup_workspace
SET config = config || '{"plane":"neon"}'::jsonb
WHERE code = 'finance-setup';
