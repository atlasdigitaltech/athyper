-- Tenant defaults are independent of personal defaults and cannot cross a collection.
CREATE TABLE IF NOT EXISTS master.saved_view_default (
 id uuid NOT NULL DEFAULT shared.uuidv7() UNIQUE,
 tenant_id uuid NOT NULL, entity_code text NOT NULL, surface_code text NOT NULL,
 view_id text NOT NULL CHECK(view_id='system' OR view_id ~ '^standard\.[a-z][a-z0-9_.-]{0,126}$' OR view_id ~ '^[0-9a-f-]{36}$'),
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,entity_code,surface_code)
);
ALTER TABLE master.saved_view_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.saved_view_default FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_view_default_tenant ON master.saved_view_default;
CREATE POLICY saved_view_default_tenant ON master.saved_view_default USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id() AND updated_by=master.current_principal_id_soft());
-- The transaction-local flag is issued only after the service authorizes shared management.
DROP POLICY IF EXISTS saved_view_shared_manager ON master.saved_view;
CREATE POLICY saved_view_shared_manager ON master.saved_view FOR UPDATE
USING(tenant_id=shared.current_tenant_id_soft() AND scope='shared' AND current_setting('app.saved_view_shared_write',true)='true')
WITH CHECK(tenant_id=shared.current_tenant_id() AND scope IN ('shared','personal') AND current_setting('app.saved_view_shared_write',true)='true');
-- Saved views and principal preferences already use the platform audit capture.
-- Attach the same capture to the new default record; avoid a parallel audit store.
DO $$ BEGIN IF to_regprocedure('audit.trg_capture_row_change()') IS NOT NULL THEN
 DROP TRIGGER IF EXISTS saved_view_default_audit ON master.saved_view_default;
 CREATE TRIGGER saved_view_default_audit AFTER INSERT OR UPDATE ON master.saved_view_default FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change();
END IF; END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
   REVOKE SELECT, INSERT, UPDATE ON master.saved_view_default FROM athyper_runtime;
 END IF;
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 GRANT SELECT,INSERT,UPDATE ON master.saved_view_default TO athyperapp;
END IF; END $$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT shared.uuidv7(),plane||'.ui.saved_view.'||operation,'entity_operation',m.id,'medium',false,false,false,false,false,jsonb_build_object('feature','entity_saved_views','operation',operation),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module m CROSS JOIN (VALUES('neon'),('mesh'),('studio')) p(plane) CROSS JOIN (VALUES('create_shared'),('manage_shared'),('set_shared_default')) o(operation)
WHERE m.code='fnd' AND m.status='active' ON CONFLICT(canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code IN (SELECT plane||'.ui.saved_view.'||operation FROM (VALUES('neon'),('mesh'),('studio')) p(plane) CROSS JOIN (VALUES('create_shared'),('manage_shared'),('set_shared_default')) o(operation))
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
