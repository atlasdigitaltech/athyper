BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'NEON Business Partner request permissions may only run on athyper_neon';
  END IF;
  PERFORM set_config('app.database_plane','neon',true);
END
$guard$;


DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner request permissions require app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN
    RAISE EXCEPTION 'Business Partner request permissions require the active fnd module';
  END IF;
END
$guard$;

INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT definition.id::uuid,definition.canonical_code,'entity_operation',module.id,
       definition.risk_tier::authz.risk_tier_d,definition.requires_mfa,definition.requires_sod,
       false,false,false,
       '{"_seed":{"pack":"neon.business-partner-request-permissions","version":"1.0.0"}}'::jsonb,
       'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module
CROSS JOIN (VALUES
  ('3135c400-b974-5368-9812-0655a4406ff9','neon.relationship.entity_case.create','medium',false,false),
  ('7cea8375-f405-58cd-95c1-65d4ff771ca1','neon.relationship.entity_case.read','low',false,false),
  ('f14d31b0-22ac-5fe5-bef7-651234a82b0e','neon.relationship.entity_case.update','medium',false,false),
  ('60d005bc-e28a-513a-9960-eda9ecbc069d','neon.relationship.entity_case.validate','medium',false,false),
  ('7a411617-6503-529a-ab78-4bcf389b606e','neon.relationship.entity_case.submit','high',false,true),
  ('9cdb6092-2e88-5a49-a91b-d649f98766e3','neon.relationship.entity_case.decide','high',true,true),
  ('8e2797f1-ae80-5a00-95c1-65555680bc0e','neon.relationship.entity_case.materialize','critical',false,true)
) AS definition(id,canonical_code,risk_tier,requires_mfa,requires_sod)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published'
WHERE (authz.permission.risk_tier,authz.permission.requires_mfa,authz.permission.requires_sod,authz.permission.status)
  IS DISTINCT FROM (EXCLUDED.risk_tier,EXCLUDED.requires_mfa,EXCLUDED.requires_sod,EXCLUDED.status);

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code LIKE 'neon.relationship.entity_case.%'
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active'
WHERE authz.permission_scope_kind.status IS DISTINCT FROM EXCLUDED.status;

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'neon.relationship.entity_case.%' AND status='published') <> 7 THEN
    RAISE EXCEPTION 'Business Partner request permission count mismatch';
  END IF;
  IF (SELECT count(*) FROM authz.permission permission JOIN authz.permission_scope_kind scope ON scope.permission_id=permission.id
      WHERE permission.canonical_code LIKE 'neon.relationship.entity_case.%'
        AND scope.scope_kind='operating_organization' AND scope.propagation_mode='subtree' AND scope.status='active') <> 7 THEN
    RAISE EXCEPTION 'Business Partner request permission scope mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM authz.permission_scope_kind scope LEFT JOIN authz.permission permission ON permission.id=scope.permission_id WHERE permission.id IS NULL) THEN
    RAISE EXCEPTION 'Business Partner request permission scope orphan detected';
  END IF;
  IF EXISTS (SELECT canonical_code FROM authz.permission WHERE canonical_code LIKE 'neon.relationship.entity_case.%' GROUP BY canonical_code HAVING count(*)<>1) THEN
    RAISE EXCEPTION 'Business Partner request permission uniqueness mismatch';
  END IF;
END
$assertions$;

COMMIT;
