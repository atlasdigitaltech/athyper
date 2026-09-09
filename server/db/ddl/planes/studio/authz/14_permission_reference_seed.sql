-- seed-contract-version: 1
-- seed-pack: studio.publication-authority-permission-reference
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Studio publication and business-partner-definition authority route contracts","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-03","license":"internal"}
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper-permission-code
-- seed-expected-row-count: exact:8
-- seed-assertions: expected-count,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: semantic
--
-- Consolidated Studio plane authz permission reference. Each section below is an
-- independent overlay keyed by its own canonical codes and _seed.pack metadata;
-- sections were previously separate files 14_ and 15_ in this directory.

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'Studio permission seed requires app.database_plane=studio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module module WHERE module.code='pub' AND module.status='active') THEN
    RAISE EXCEPTION 'Studio permission seed requires the active pub module';
  END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- publication  (pack: studio.publication-permission-overlay)
-- ─────────────────────────────────────────────────────────────────────────────
WITH desired(canonical_code,permission_kind,risk_tier,requires_mfa,requires_sod) AS (
  VALUES
    ('publication.release.view','capability','low',false,false),
    ('publication.deployment.view','capability','low',false,false),
    ('publication.release.publish','system_action','critical',true,true),
    ('publication.deployment.retry','system_action','high',false,false),
    ('publication.release.rollback','system_action','critical',true,true)
), publication_module AS (
  SELECT module.id
  FROM control.module module
  WHERE module.code='pub' AND module.status='active'
)
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  md5('athyper:permission:' || desired.canonical_code)::uuid,
  desired.canonical_code,
  desired.permission_kind::authz.permission_kind_d,
  publication_module.id,
  desired.risk_tier::authz.risk_tier_d,
  desired.requires_mfa,
  desired.requires_sod,
  false,
  false,
  false,
  jsonb_build_object('_seed',jsonb_build_object(
    'pack','studio.publication-permission-overlay',
    'version','1.0.0'
  )),
  'published',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM desired
CROSS JOIN publication_module
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind (
  permission_id,scope_kind,propagation_mode,status,created_by
)
SELECT
  permission.id,
  'tenant'::authz.scope_kind_d,
  'exact'::authz.propagation_mode_d,
  'active',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code IN (
  'publication.release.view',
  'publication.deployment.view',
  'publication.release.publish',
  'publication.deployment.retry',
  'publication.release.rollback'
)
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $assertions$
BEGIN
  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN control.module module ON module.id=permission.module_id
    WHERE module.code='pub'
      AND permission.status='published'
      AND (permission.canonical_code,permission.permission_kind,permission.risk_tier,permission.requires_mfa,permission.requires_sod)
          IN (
            ('publication.release.view','capability','low',false,false),
            ('publication.deployment.view','capability','low',false,false),
            ('publication.release.publish','system_action','critical',true,true),
            ('publication.deployment.retry','system_action','high',false,false),
            ('publication.release.rollback','system_action','critical',true,true)
          )
  ) <> 5 THEN
    RAISE EXCEPTION 'Publication permission overlay definition mismatch';
  END IF;

  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
    WHERE permission.canonical_code IN (
      'publication.release.view',
      'publication.deployment.view',
      'publication.release.publish',
      'publication.deployment.retry',
      'publication.release.rollback'
    )
      AND compatibility.scope_kind='tenant'
      AND compatibility.propagation_mode='exact'
      AND compatibility.status='active'
  ) <> 5 THEN
    RAISE EXCEPTION 'Publication permission overlay scope compatibility mismatch';
  END IF;
END
$assertions$;

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_definition  (pack: studio.business-partner-definition-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
WITH desired(canonical_code,permission_kind,risk_tier,requires_mfa,requires_sod) AS (VALUES
 ('studio.business_partner_definition.read','capability','low',false,false),
 ('studio.business_partner_definition.author','system_action','medium',false,false),
 ('studio.business_partner_definition.publish','system_action','critical',true,true)
), publication_module AS (SELECT id FROM control.module WHERE code='pub' AND status='active')
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT md5('athyper:permission:'||canonical_code)::uuid,canonical_code,permission_kind::authz.permission_kind_d,publication_module.id,risk_tier::authz.risk_tier_d,requires_mfa,requires_sod,false,false,false,
 jsonb_build_object('_seed',jsonb_build_object('pack','studio.business-partner-definition-permissions','version','1.0.0')),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM desired CROSS JOIN publication_module ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code LIKE 'studio.business_partner_definition.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'studio.business_partner_definition.%' AND status='published')<>3 THEN RAISE EXCEPTION 'Business Partner definition permission count mismatch'; END IF;
 IF (SELECT count(*) FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code LIKE 'studio.business_partner_definition.%' AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active')<>3 THEN RAISE EXCEPTION 'Business Partner definition permission scope mismatch'; END IF;
END $assertions$;

-- Governed global directory: permissions are cataloged, never implicitly granted.
WITH desired(canonical_code,permission_kind,risk_tier,requires_mfa,requires_sod) AS (VALUES
 ('studio.bank_directory.read','capability','low',false,false),
 ('studio.bank_directory.author','system_action','medium',false,false),
 ('studio.bank_directory.publish','system_action','critical',true,true)
), publication_module AS (SELECT id FROM control.module WHERE code='pub' AND status='active')
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT md5('athyper:permission:'||canonical_code)::uuid,canonical_code,permission_kind::authz.permission_kind_d,publication_module.id,risk_tier::authz.risk_tier_d,requires_mfa,requires_sod,false,false,false,
 jsonb_build_object('_seed',jsonb_build_object('pack','studio.bank-directory-permissions','version','1.0.0')),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM desired CROSS JOIN publication_module ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code LIKE 'studio.bank_directory.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'studio.bank_directory.%' AND status='published')<>3 THEN RAISE EXCEPTION 'Bank directory permission count mismatch'; END IF;
 IF (SELECT count(*) FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code LIKE 'studio.bank_directory.%' AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active')<>3 THEN RAISE EXCEPTION 'Bank directory permission scope mismatch'; END IF;
END $assertions$;
