-- Exact-plane Principal-family schema support; no role grants or publication activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database() NOT IN ('athyper_studio','athyper_neon','athyper_mesh') THEN RAISE EXCEPTION 'Known plane database required'; END IF;
 PERFORM set_config('app.database_plane',substr(current_database(),9),true);
END $$;
-- Preserve non-active semantics: legacy deprecated overrides become inactive.
-- No CASCADE: unknown dependent views must be reviewed instead of silently removed.
DO $$
DECLARE current_type regtype; status_trigger text;
BEGIN
 SELECT atttypid::regtype INTO STRICT current_type FROM pg_attribute
 WHERE attrelid='master.principal_notification_preference'::regclass AND attname='status' AND NOT attisdropped;
 IF current_type='shared.ref_status_d'::regtype THEN
  SELECT pg_get_triggerdef(oid) INTO STRICT status_trigger FROM pg_trigger
   WHERE tgrelid='master.principal_notification_preference'::regclass
     AND tgname='trg_principal_notification_preference_status_changed' AND NOT tgisinternal;
  DROP TRIGGER trg_principal_notification_preference_status_changed ON master.principal_notification_preference;
  ALTER TABLE master.principal_notification_preference DROP COLUMN is_active;
  ALTER TABLE master.principal_notification_preference ALTER COLUMN status TYPE shared.active_inactive_d
    USING (CASE WHEN status::text='deprecated' THEN 'inactive' ELSE status::text END)::shared.active_inactive_d;
  ALTER TABLE master.principal_notification_preference ADD COLUMN is_active boolean GENERATED ALWAYS AS (status='active') STORED;
  EXECUTE status_trigger;
 ELSIF current_type<>'shared.active_inactive_d'::regtype THEN
  RAISE EXCEPTION 'Unexpected notification preference status type: %',current_type;
 END IF;
END $$;
ALTER TABLE master.principal_ui_profile ADD COLUMN IF NOT EXISTS record_version bigint NOT NULL DEFAULT 1 CHECK (record_version>0);
DROP POLICY IF EXISTS entity_owner_admin_read ON master.principal_ui_profile;
CREATE POLICY entity_owner_admin_read ON master.principal_ui_profile FOR SELECT TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_ui_profile',tenant_id,false));
DROP POLICY IF EXISTS entity_owner_admin_insert ON master.principal_ui_profile;
CREATE POLICY entity_owner_admin_insert ON master.principal_ui_profile FOR INSERT TO athyperapp
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_ui_profile',tenant_id,true));
DROP POLICY IF EXISTS entity_owner_admin_update ON master.principal_ui_profile;
CREATE POLICY entity_owner_admin_update ON master.principal_ui_profile FOR UPDATE TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_ui_profile',tenant_id,true))
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_ui_profile',tenant_id,true));
DROP TRIGGER IF EXISTS trg_entity_record_version ON master.principal_ui_profile;
CREATE TRIGGER trg_entity_record_version BEFORE UPDATE ON master.principal_ui_profile
 FOR EACH ROW EXECUTE FUNCTION shared.trg_record_optimistic_version();


-- Exact capability catalog; no role grants, entity write permissions or activation.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
-- Self-edit permissions do not grant cross-owner access; administer is separate.
-- Runtime parent, tenant, plane and field admission remain mandatory.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common identity catalog requires an exact local plane';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('97e9de3d-36e7-5917-bc9b-614bdc681c49'::uuid,'common.identity.principal.read','low'),
    ('52ba2285-9bed-5ad6-a9bb-05e5798f9f06'::uuid,'common.identity.principal_profile.read','low'),
    ('76df2a11-bfef-54cb-8ee0-8a50853d1e8c'::uuid,'common.identity.principal_profile.edit','medium'),
    ('32e58242-82cb-5dee-8aa8-3758b66bb8d6'::uuid,'common.identity.principal_notification_preference.read','low'),
    ('9d6eb3ab-e6f0-5008-ad01-9a146eda365f'::uuid,'common.identity.principal_notification_preference.edit','medium'),
    ('71ba327a-8c75-55da-b5c3-4fa67d7928d0'::uuid,'common.identity.principal_ui_profile.read','low'),
    ('ca46487f-caa4-5a0f-a20b-8fa69b40362b'::uuid,'common.identity.principal_ui_profile.edit','medium'),
    ('cea6db1a-4c78-5a69-8340-b9e065b0da17'::uuid,'common.identity.principal.administer','high')
  ) AS expected(id,code,risk)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,permission.risk::authz.risk_tier_d,
      false,false,false,false,false,
      '{"namespace":"common","capability":"tenant_local_identity","_seed":{"pack":"common.identity-permissions","version":"1.0.0"}}'::jsonb,
      'published','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(canonical_code) DO NOTHING;
    INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    VALUES(permission.id,'tenant','exact','active','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM authz.permission p
      WHERE p.id=permission.id AND p.canonical_code=permission.code AND p.module_id=v_module_id
        AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier::text=permission.risk
        AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
        AND NOT p.is_delegable AND NOT p.is_overridable)
      OR (SELECT count(*) FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id AND s.status='active')<>1
      OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id
        AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active') THEN
      RAISE EXCEPTION 'Common identity catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;

-- Extend only the exact common-capability allowlist; preserve all owner checks.
DO $$ DECLARE body text; old_text text := '''common.identity.principal_notification_preference.read'',''common.identity.principal_notification_preference.edit'''; new_text text := '''common.identity.principal_notification_preference.read'',''common.identity.principal_notification_preference.edit'',''common.identity.principal_ui_profile.read'',''common.identity.principal_ui_profile.edit''';
BEGIN
 SELECT pg_get_functiondef('authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb)'::regprocedure) INTO STRICT body;
 IF position(new_text IN body)>0 THEN RETURN; END IF;
 IF position(old_text IN body)=0 THEN RAISE EXCEPTION 'Identity operation projection shape changed'; END IF;
 EXECUTE replace(body,old_text,new_text);
END $$;
COMMIT;
