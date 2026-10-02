-- Reviewed canonical superset of 20260929_entity_owner_access.sql: UI-profile additions are unrelated.
-- Only this migration's version columns, policies, triggers, functions and seed
-- invariants are compared. Unrelated source-authority extensions remain intact.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.database_plane',substring(current_database() from 9),true);
LOCK TABLE master.principal, master.principal_profile, master.principal_notification_preference, authz.plane_membership, authz.permission, authz.permission_scope_kind, control.module IN ACCESS EXCLUSIVE MODE;
DO $equivalence$
DECLARE actual text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='common/master/03_platform_tables.sql' AND checksum='eb54f6a7d24489d7d18e42eca6d8a95486948d33be2b804e58813c31a637c292') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/' || substring(current_database() from 9) || '/master/26_entity_owner_access.sql' AND checksum='b6e1e246ff120c4af28853e8047732f66ae05fd29365fc75be66f0200f039764') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='common/authz/20_common_identity_permissions.sql' AND checksum='db9ecfbba306b33caa1a7eb32461cb193a2c3921f47cc6afc87b7543fd539220') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='common/authz/21_entity_default_access.sql' AND checksum='cbe30504afd4919c2d93543f684d3d02a0439d35dfef6c82f1f8a4e9bb648cc3') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT'; END IF;
  SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') INTO actual FROM (
WITH relations AS (
 SELECT c.oid, n.nspname || '.' || c.relname AS name, c.relkind, c.relrowsecurity,
 c.relforcerowsecurity, c.relreplident, c.reloptions, pg_get_userbyid(c.relowner) AS owner,
 (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a) AS acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname || '.' || c.relname = ANY (ARRAY['master.principal','master.principal_profile','master.principal_notification_preference','authz.plane_membership'])
), state AS (
 SELECT jsonb_build_object(
 'relations', (SELECT jsonb_agg(jsonb_build_object(
   'name', r.name, 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'collation',a.attcollation::regcollation::text,'acl',a.attacl::text,
      'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname='record_version' AND r.name IN ('master.principal_profile','master.principal_notification_preference')),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),
      'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE conrelid=r.oid AND pg_get_constraintdef(oid) LIKE '%record_version%' AND r.name IN ('master.principal_profile','master.principal_notification_preference')),
   'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),
      'valid',indisvalid,'ready',indisready) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=r.oid AND false),
   'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN role=0 THEN 'public' ELSE pg_get_userbyid(role) END ORDER BY role::regrole::text) FROM unnest(polroles) role),
      'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname)
      FROM pg_policy WHERE polrelid=r.oid AND polname LIKE 'entity_owner_admin_%'),
   'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid=r.oid AND NOT tgisinternal AND tgname IN ('trg_entity_record_version','trg_entity_default_membership'))
 ) ORDER BY r.name) FROM relations r),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
   'owner',pg_get_userbyid(p.proowner),'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a)) ORDER BY p.oid::regprocedure::text)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname || '.' || p.proname = ANY (ARRAY['shared.fn_entity_owner_admin_access','shared.trg_record_optimistic_version','authz.trg_entity_default_membership']::text[]))
 ) AS value
)
SELECT value FROM state
  ) catalog;
  IF actual IS DISTINCT FROM '197cbfcafbf5d74598345e2a4a60d638fc1ffe402b558d3f9988e6f8f6c1f04d' THEN
    RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_SCHEMA_DRIFT: 20260929_entity_owner_access.sql';
  END IF;
END $equivalence$;
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
    ('cea6db1a-4c78-5a69-8340-b9e065b0da17'::uuid,'common.identity.principal.administer','high')
  ) AS expected(id,code,risk)
  LOOP
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
