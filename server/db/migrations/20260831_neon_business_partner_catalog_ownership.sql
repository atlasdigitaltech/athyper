BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner catalog ownership migration requires the NEON plane';
  END IF;
END $$;

-- The route slug is presentation metadata. Stable authorization and entitlement
-- joins continue to use the immutable catalog codes mdg.bp.
INSERT INTO master.workspace (
  id, code, name, description, icon_key, sort_order,
  is_shared_infrastructure, metadata, status, created_by
)
VALUES (
  md5('neon:workspace:mdg')::uuid, 'mdg', 'Master Data Governance',
  'Governed business partner, product, organization, location, and finance master data',
  'database', 10, false,
  '{"routeSlug":"mdg","visibility":"primary","_seed":{"pack":"athyper.platform-catalog","version":"1"}}'::jsonb,
  'active', '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  metadata = master.workspace.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

INSERT INTO master.module (
  id, code, name, description, icon_key, workspace_id,
  config, metadata, status, created_by
)
SELECT
  md5('neon:module:bp')::uuid, 'bp', 'Business Partner',
  'Governed organization and person partners, onboarding requests, qualifications, and relationships',
  'user', workspace.id,
  '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb,
  '{"routeSlug":"business-partner","_seed":{"pack":"athyper.platform-catalog","version":"1"}}'::jsonb,
  'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM master.workspace AS workspace
WHERE workspace.code = 'mdg'
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  workspace_id = excluded.workspace_id,
  config = excluded.config,
  metadata = master.module.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

INSERT INTO control.workspace (
  id, code, name, description, icon_key, sort_order,
  is_shared_infrastructure, metadata, status, created_by
)
SELECT id, code, name, description, icon_key, sort_order,
       is_shared_infrastructure, metadata, status, created_by
FROM master.workspace
WHERE code = 'mdg'
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  metadata = control.workspace.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

INSERT INTO control.module (
  id, code, name, description, icon_key, config, metadata, status, created_by
)
SELECT id, code, name, description, icon_key, config, metadata, status, created_by
FROM master.module
WHERE code = 'bp'
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  config = excluded.config,
  metadata = control.module.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

INSERT INTO control.workspace_module (
  workspace_id, module_id, is_primary, sort_order, metadata, status, created_by
)
SELECT workspace.id, module.id, true, 10,
       '{"_seed":{"pack":"athyper.platform-catalog","version":"1"}}'::jsonb,
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.workspace AS workspace
CROSS JOIN control.module AS module
WHERE workspace.code = 'mdg' AND module.code = 'bp'
ON CONFLICT (workspace_id, module_id) DO UPDATE SET
  is_primary = true,
  sort_order = excluded.sort_order,
  metadata = control.workspace_module.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

INSERT INTO control.subscription_plan_module (
  id, subscription_plan_id, module_id, entitlement_mode, metadata, status, created_by
)
SELECT md5('neon:plan-module:' || plan.code || ':bp')::uuid,
       plan.id, module.id, 'included',
       '{"_seed":{"pack":"athyper.platform-catalog","version":"1"}}'::jsonb,
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.subscription_plan AS plan
CROSS JOIN control.module AS module
WHERE plan.code = 'erp_enterprise' AND plan.status = 'active' AND module.code = 'bp'
ON CONFLICT (subscription_plan_id, module_id) DO UPDATE SET
  entitlement_mode = excluded.entitlement_mode,
  metadata = control.subscription_plan_module.metadata || excluded.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = excluded.created_by;

CREATE TEMP TABLE bp_permission_catalog_rebind ON COMMIT DROP AS
SELECT permission.id, permission.status
FROM authz.permission AS permission
WHERE (
       permission.canonical_code LIKE 'neon.relationship.business_partner%'
    OR permission.canonical_code LIKE 'neon.business_partner%'
    OR permission.canonical_code LIKE 'neon.supplier.preference.%'
    OR permission.canonical_code LIKE 'neon.supplier_registration.%'
    OR permission.canonical_code LIKE 'neon.customer_registration.%'
    OR permission.canonical_code LIKE 'neon.customer.credit.%'
    OR permission.canonical_code LIKE 'neon.customer.lifecycle.%'
    OR permission.canonical_code LIKE 'neon.workforce.invitation.%'
)
AND permission.module_id IS DISTINCT FROM (SELECT id FROM control.module WHERE code = 'bp');

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bp_permission_catalog_rebind WHERE status = 'retired'
  ) THEN
    RAISE EXCEPTION 'Retired Business Partner permissions cannot be rebound to mdg.bp';
  END IF;
END
$preflight$;

-- Published permission definitions must pass through the governed suspended
-- state before module ownership can change. Preserve and restore the original
-- publication state in the same transaction.
UPDATE authz.permission AS permission
SET status = 'suspended'
FROM bp_permission_catalog_rebind AS target
WHERE permission.id = target.id
  AND target.status = 'published';

UPDATE authz.permission AS permission
SET module_id = (SELECT id FROM control.module WHERE code = 'bp'),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'::uuid
FROM bp_permission_catalog_rebind AS target
WHERE permission.id = target.id;

UPDATE authz.permission AS permission
SET status = 'published'
FROM bp_permission_catalog_rebind AS target
WHERE permission.id = target.id
  AND target.status = 'published';

DO $assertions$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM control.workspace_module association
    JOIN control.workspace workspace ON workspace.id = association.workspace_id
    JOIN control.module module ON module.id = association.module_id
    WHERE workspace.code = 'mdg' AND module.code = 'bp'
      AND association.status = 'active' AND association.is_primary
  ) THEN
    RAISE EXCEPTION 'mdg.bp catalog ownership was not established';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM authz.permission permission
    JOIN control.module module ON module.id = permission.module_id
    WHERE permission.canonical_code LIKE 'neon.relationship.business_partner%'
      AND module.code <> 'bp'
  ) THEN
    RAISE EXCEPTION 'Business Partner permissions remain outside mdg.bp';
  END IF;
END $assertions$;

COMMIT;
