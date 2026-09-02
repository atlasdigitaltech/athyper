-- seed-contract-version: 1
-- seed-pack: neon.workforce-request-permissions
-- seed-pack-version: 2.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"S2 People/Workforce authority boundary","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-02","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:6
-- seed-demo-data: false

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Workforce request permissions require app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN
    RAISE EXCEPTION 'Workforce request permissions require the active fnd module';
  END IF;
END
$guard$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.workforce-requests","version":"2.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('df98bb67-29dc-4e56-b919-64d2c6c7e8b4','neon.workforce.request.create','high',false,false),
 ('9eb487f9-5113-4b2a-934c-3c497ac0910c','neon.workforce.request.read','medium',false,false),
 ('3f245660-4c10-4e6b-a4f1-91fb9f367b01','neon.workforce.request.validate','high',false,false),
 ('3f245660-4c10-4e6b-a4f1-91fb9f367b02','neon.workforce.request.submit','high',false,true),
 ('3f245660-4c10-4e6b-a4f1-91fb9f367b03','neon.workforce.request.decide','critical',true,true),
 ('3f245660-4c10-4e6b-a4f1-91fb9f367b04','neon.workforce.request.apply','critical',true,true)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code IN('neon.workforce.request.create','neon.workforce.request.read','neon.workforce.request.validate','neon.workforce.request.submit','neon.workforce.request.decide','neon.workforce.request.apply')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
