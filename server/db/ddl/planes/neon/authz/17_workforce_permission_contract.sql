-- seed-contract-version: 1
-- seed-pack: neon.workforce-permission-contract
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Athyper Workforce service contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-22","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: stable-explicit
-- seed-expected-row-count: exact:14
-- seed-assertions: expected-count,uniqueness,semantic
-- seed-demo-data: false

-- Employee lifecycle permissions used by the governed Workforce service.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT definition.id,definition.code,'entity_operation',module.id,definition.risk::authz.risk_tier_d,definition.mfa,definition.sod,false,false,false,'{"_seed":{"pack":"neon.workforce","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('7b84b98f-6814-4ee6-a65c-4959ca51de01'::uuid,'neon.workforce.review','medium',false,false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de02'::uuid,'neon.workforce.onboarding.execute','high',false,false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de03'::uuid,'neon.workforce.offboarding.execute','critical',true,true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de04'::uuid,'neon.workforce.pii.read','high',true,false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de05'::uuid,'neon.workforce.iam.retry','critical',true,true),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de06'::uuid,'neon.workforce.integration.import','high',false,false),
 ('7b84b98f-6814-4ee6-a65c-4959ca51de07'::uuid,'neon.workforce.health.read','critical',true,false)
) definition(id,code,risk,mfa,sod)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

DELETE FROM authz.permission_scope_kind scope USING authz.permission permission
WHERE scope.permission_id=permission.id
  AND permission.canonical_code IN('neon.workforce.review','neon.workforce.onboarding.execute','neon.workforce.offboarding.execute','neon.workforce.pii.read','neon.workforce.iam.retry','neon.workforce.integration.import','neon.workforce.health.read')
  AND NOT ((permission.canonical_code IN('neon.workforce.integration.import','neon.workforce.pii.read','neon.workforce.health.read') AND scope.scope_kind='tenant' AND scope.propagation_mode='exact') OR (permission.canonical_code='neon.workforce.onboarding.execute' AND scope.scope_kind='company_code' AND scope.propagation_mode='exact') OR (permission.canonical_code IN('neon.workforce.review','neon.workforce.offboarding.execute','neon.workforce.iam.retry') AND scope.scope_kind='legal_entity' AND scope.propagation_mode='exact'));

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,CASE WHEN canonical_code IN('neon.workforce.integration.import','neon.workforce.pii.read','neon.workforce.health.read') THEN 'tenant'::authz.scope_kind_d WHEN canonical_code='neon.workforce.onboarding.execute' THEN 'company_code'::authz.scope_kind_d ELSE 'legal_entity'::authz.scope_kind_d END,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code IN('neon.workforce.review','neon.workforce.onboarding.execute','neon.workforce.offboarding.execute','neon.workforce.pii.read','neon.workforce.iam.retry','neon.workforce.integration.import','neon.workforce.health.read')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code IN('neon.workforce.review','neon.workforce.onboarding.execute','neon.workforce.offboarding.execute','neon.workforce.pii.read','neon.workforce.iam.retry','neon.workforce.integration.import','neon.workforce.health.read') AND status='published')<>7 THEN RAISE EXCEPTION 'Workforce permission catalog mismatch'; END IF;
END $assertions$;
