-- seed-contract-version: 1
-- seed-pack: neon.business-partner-permission-reference
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Neon business-partner, supplier, customer and workforce authorization contracts","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:60
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
--
-- Consolidated Neon plane authz permission reference. Each section below is an
-- independent overlay keyed by its own canonical codes and _seed.pack metadata;
-- sections were previously separate files 14_..23_ in this directory.

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Neon business-partner permission seed requires app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code = 'fnd' AND status = 'active') THEN
    RAISE EXCEPTION 'Neon business-partner permission seed requires the active fnd module';
  END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_list  (pack: neon.business-partner-list-permission-overlay)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  '04a1f105-978d-5906-b6df-0e7eb5c938bd'::uuid,
  'neon.relationship.business_partner.read',
  'entity_operation',
  module.id,
  'low',
  false,false,false,false,false,
  '{"_seed":{"pack":"neon.business-partner-list-permission-overlay","version":"1.0.0"}}'::jsonb,
  'published',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind (
  permission_id,scope_kind,propagation_mode,status,created_by
)
SELECT
  permission.id,
  'operating_organization',
  'subtree',
  'active',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code='neon.relationship.business_partner.read'
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $assertions$
BEGIN
  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
    WHERE permission.canonical_code='neon.relationship.business_partner.read'
      AND permission.permission_kind='entity_operation'
      AND permission.status='published'
      AND compatibility.scope_kind='operating_organization'
      AND compatibility.propagation_mode='subtree'
      AND compatibility.status='active'
  ) <> 1 THEN
    RAISE EXCEPTION 'Business-partner list permission overlay mismatch';
  END IF;
END
$assertions$;

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_request  (pack: neon.business-partner-request-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- supplier_preference  (pack: neon.supplier-preference-permission)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT 'b07a67cb-8bb7-5417-83a7-217eb7d2e13d'::uuid,
       'neon.supplier.preference.admin','entity_operation',module.id,'high',true,true,
       false,false,false,
       '{"_seed":{"pack":"neon.supplier-preference-permission","version":"1.0.0"}}'::jsonb,
       'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin'
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin' AND status='published') <> 1 THEN
    RAISE EXCEPTION 'Supplier preference permission count mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM authz.permission permission JOIN authz.permission_scope_kind scope ON scope.permission_id=permission.id WHERE permission.canonical_code='neon.supplier.preference.admin' AND scope.scope_kind='operating_organization' AND scope.propagation_mode='subtree' AND scope.status='active') THEN
    RAISE EXCEPTION 'Supplier preference permission scope mismatch';
  END IF;
END $assertions$;

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_profile_projection  (pack: neon.business-partner-profile-projection)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT permission.id, permission.code, 'entity_operation', module.id,
       permission.risk::authz.risk_tier_d, permission.mfa, false, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-profile-projection","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('c8fc15f7-82fc-5d55-9c9a-1fa67680c4c1'::uuid, 'neon.business_partner_profile_projection.receive', 'medium', false),
    ('b9663a43-b8aa-506f-882d-5210e861cfbd'::uuid, 'neon.business_partner_profile_projection.read', 'low', false),
    ('1af763bc-5615-51da-93ba-b339e065af44'::uuid, 'neon.business_partner_profile_projection.replay', 'high', true)
) AS permission(id, code, risk, mfa)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier = EXCLUDED.risk_tier,
    requires_mfa = EXCLUDED.requires_mfa,
    metadata = authz.permission.metadata || EXCLUDED.metadata,
    status = 'published';

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT id, 'tenant', 'exact', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code IN (
    'neon.business_partner_profile_projection.receive',
    'neon.business_partner_profile_projection.read',
    'neon.business_partner_profile_projection.replay'
)
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_profile_match  (pack: neon.business-partner-profile-match)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT permission.id, permission.code, 'entity_operation', module.id,
       permission.risk::authz.risk_tier_d, permission.mfa, false, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-profile-match","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('a8185d65-1eb9-5b58-96be-19fef76634b0'::uuid, 'neon.business_partner_profile_match.create', 'medium', false),
    ('f948f032-5e54-55d6-b0f0-048942353677'::uuid, 'neon.business_partner_profile_match.read', 'low', false),
    ('488c0f90-ca12-5fa3-9e73-e4c65886977e'::uuid, 'neon.business_partner_profile_match.request', 'high', true)
) AS permission(id, code, risk, mfa)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier=EXCLUDED.risk_tier, requires_mfa=EXCLUDED.requires_mfa,
    metadata=authz.permission.metadata || EXCLUDED.metadata, status='published';

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT id, 'operating_organization', 'subtree', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code IN (
    'neon.business_partner_profile_match.create',
    'neon.business_partner_profile_match.read',
    'neon.business_partner_profile_match.request'
)
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status='active';

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_activation  (pack: neon.business-partner-activation)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
    id, canonical_code, permission_kind, module_id, risk_tier,
    requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
    metadata, status, created_by
)
SELECT 'ec73bb07-5bb4-5343-a5b4-8e99e22b54dc'::uuid,
       'neon.relationship.business_partner.activate', 'entity_operation', module.id,
       'high', true, true, false, false, false,
       '{"_seed":{"pack":"neon.business-partner-activation","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
    risk_tier = EXCLUDED.risk_tier,
    requires_mfa = EXCLUDED.requires_mfa,
    requires_sod = EXCLUDED.requires_sod,
    metadata = authz.permission.metadata || EXCLUDED.metadata,
    status = 'published';

INSERT INTO authz.permission_scope_kind (
    permission_id, scope_kind, propagation_mode, status, created_by
)
SELECT id, 'operating_organization', 'subtree', 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code = 'neon.relationship.business_partner.activate'
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- supplier_registration  (pack: neon.supplier-registration-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.supplier-registration-permissions","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('8d38c2da-7098-50a5-855c-e5b28e202bed','neon.supplier_registration.invitation.create','high',false,true),
 ('50b1da92-5a50-5fe3-a8ac-0127d4cbf954','neon.supplier_registration.invitation.read','medium',false,false),
 ('1dc53e70-442e-57c9-a02c-1b2fae055fd1','neon.supplier_registration.invitation.cancel','high',true,true),
 ('21034501-b850-52b8-adcb-f56e6c7230b0','neon.supplier_registration.external.respond','medium',false,false)
) value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('neon.supplier_registration.invitation.create','neon.supplier_registration.invitation.read','neon.supplier_registration.invitation.cancel')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.supplier_registration.external.respond'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
DO $assert$ BEGIN
 IF(SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'neon.supplier_registration.%' AND status='published')<>4 THEN RAISE EXCEPTION 'Supplier registration permission count mismatch'; END IF;
END $assert$;

-- ─────────────────────────────────────────────────────────────────────────────
-- customer_onboarding  (pack: neon.customer-onboarding-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.customer-onboarding-permissions","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('30a20e34-e57e-5d8a-86d4-b31fc6943101','neon.customer.credit.create','high',false,true),
 ('c25dc54d-ce79-5d2e-812c-889a810401d4','neon.customer.credit.decide','critical',true,true),
 ('a59ceba9-57f8-5654-8c08-f9998dc30d27','neon.customer.credit.read','medium',false,false),
 ('455a5fee-c27f-5d4e-848a-96f515646087','neon.customer.designation.create','high',false,true),
 ('8d0beb10-3d4d-5e9d-a8d4-da65b36d4358','neon.customer.designation.decide','critical',true,true),
 ('1ad343fe-fcfe-5b27-819f-812eaba20ba9','neon.customer.designation.read','medium',false,false),
 ('c39e35d0-659a-5a90-a6a7-c39dbf84b730','neon.customer.lifecycle.activate','critical',true,true),
 ('87075ec5-2c1c-540a-b209-ed1fb0a18c53','neon.customer.lifecycle.suspend','critical',true,true),
 ('e05ed0ea-5b99-5877-ad9a-b23f49bfec3a','neon.customer.lifecycle.reactivate','critical',true,true),
 ('cbbdaef1-8a21-4ed7-a622-957fd6788e29','neon.customer.lifecycle.deactivate','critical',true,true),
 ('f37228fa-2e7d-45ee-bc92-81abb949e46f','neon.customer.lifecycle.archive','critical',true,true)
 ,('d123781f-9f78-5260-a333-5db597b7135b','neon.customer_registration.invitation.create','high',false,true)
 ,('56c3aba8-13e5-5dc2-acfc-f9028830bdc1','neon.customer_registration.invitation.read','medium',false,false)
 ,('ed3dc9f6-151f-53f7-aee2-91b67a477219','neon.customer_registration.invitation.cancel','high',true,true)
 ,('98be6524-80bd-5918-8656-465ff80ca7f6','neon.customer_registration.external.respond','medium',false,false)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer.credit.%' OR canonical_code LIKE 'neon.customer.designation.%' OR canonical_code LIKE 'neon.customer.lifecycle.%'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer_registration.invitation.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.customer_registration.external.respond' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
DO $assert$ BEGIN IF(SELECT count(*) FROM authz.permission WHERE ((canonical_code LIKE 'neon.customer.credit.%' OR canonical_code LIKE 'neon.customer.designation.%' OR canonical_code LIKE 'neon.customer.lifecycle.%') OR canonical_code LIKE 'neon.customer_registration.%') AND status='published')<>15 THEN RAISE EXCEPTION 'Customer onboarding permission count mismatch'; END IF; END $assert$;

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_invitation  (pack: neon.business-partner-invitation-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.business-partner-invitation-permissions","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('48052774-e56a-51e8-9bb8-e19fbb253d8c','neon.workforce.invitation.create','high',false,true),
 ('d1d773bc-caae-5077-96a4-ed2c863e01d0','neon.workforce.invitation.read','medium',false,false),
 ('82d630fd-50a0-54ac-a4da-497570851a56','neon.workforce.invitation.cancel','high',true,true),
 ('28a0dcad-e7cf-58fd-94e9-850934587083','neon.workforce.invitation.external.respond','medium',false,false),
 ('b4fd922f-dd3f-59de-bdbd-743431699cb9','neon.business_partner_invitation.recovery.request','critical',true,true)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.workforce.invitation.%' AND canonical_code<>'neon.workforce.invitation.external.respond' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('neon.workforce.invitation.external.respond','neon.business_partner_invitation.recovery.request') ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

-- ─────────────────────────────────────────────────────────────────────────────
-- business_partner_360  (pack: neon.business-partner-360-permissions)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,
  value.mfa,value.sod,false,false,false,
  '{"_seed":{"pack":"neon.business-partner-360-permissions","version":"1.0.0"}}'::jsonb,
  'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module
CROSS JOIN (VALUES
  ('9c8b720c-1b8b-5099-90ed-21dcdb1636c1','neon.relationship.business_partner_identity.read','low',false,false),
  ('5ea10c61-2c69-529c-9427-729aa161472e','neon.relationship.business_partner_contact.read','low',false,false),
  ('a266c702-0dbc-56ed-91b4-e3105a265b24','neon.relationship.business_partner_address.read','low',false,false),
  ('f138c881-9748-52f4-a836-596913b9f1de','neon.relationship.business_partner_identifier.read_masked','medium',false,false),
  ('e240234c-755a-503b-b3b4-991109ccc7e1','neon.relationship.business_partner_tax.read_masked','medium',false,false),
  ('815dfed2-3b83-5ddb-a219-b06ece8e03ed','neon.relationship.business_partner_tax.reveal','high',true,false),
  ('86bf91e7-dac1-56ee-a07c-4171f7d81545','neon.relationship.business_partner_bank.read_masked','medium',false,false),
  ('e776180b-06f3-5b7b-8210-2d455eca6de6','neon.relationship.business_partner_bank.reveal','high',true,false),
  ('52e76b02-d2f1-53ff-a04b-f7bbb586cec3','neon.relationship.business_partner_qualification.read','medium',false,false),
  ('c0d8a00f-4f20-53b7-9478-b8e83748ff1c','neon.relationship.business_partner_certificate.read','medium',false,false),
  ('34cca4e2-4d41-5ea6-b3ba-cd055a21e4a1','neon.relationship.business_partner_credit.read','medium',false,false),
  ('012c7296-cd18-5d46-99f5-ad1bf080e2a7','neon.relationship.business_partner_person.read','medium',false,false),
  ('2d750c0f-eb7b-5516-bf35-72fc496835d2','neon.relationship.business_partner_person_sensitive.read','high',true,false),
  ('d6382cc9-7f33-5ab4-8329-182843a0ec48','neon.relationship.business_partner_workforce.read','medium',false,false),
  ('a130132e-8dc4-5341-9906-4e009078a79b','neon.relationship.business_partner_activity.read','low',false,false),
  ('97926e41-0da8-5ca2-89f0-2269c0ff188f','neon.relationship.business_partner_network.read','low',false,false),
  ('cc01536c-d18c-504f-8d9a-0a1779ef219d','neon.relationship.business_partner_amend.create','medium',false,false)
) value(id,code,risk,mfa,sod)
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,
  requires_mfa=EXCLUDED.requires_mfa,
  requires_sod=EXCLUDED.requires_sod,
  metadata=authz.permission.metadata||EXCLUDED.metadata,
  status='published';

INSERT INTO authz.permission_scope_kind (permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.metadata @> '{"_seed":{"pack":"neon.business-partner-360-permissions"}}'::jsonb
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

INSERT INTO authz.permission_scope_kind (permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code IN (
  'neon.relationship.business_partner_person.read',
  'neon.relationship.business_partner_person_sensitive.read',
  'neon.relationship.business_partner_workforce.read'
)
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF (
    SELECT count(*) FROM authz.permission
    WHERE metadata @> '{"_seed":{"pack":"neon.business-partner-360-permissions"}}'::jsonb
      AND status='published'
  ) <> 17 THEN
    RAISE EXCEPTION 'Business Partner 360 permission count mismatch';
  END IF;
  IF EXISTS (
    SELECT canonical_code FROM authz.permission
    WHERE metadata @> '{"_seed":{"pack":"neon.business-partner-360-permissions"}}'::jsonb
      AND array_length(string_to_array(canonical_code,'.'),1) <> 4
  ) THEN
    RAISE EXCEPTION 'Business Partner 360 permission code violates the four-part catalog contract';
  END IF;
END
$assertions$;

-- ─────────────────────────────────────────────────────────────────────────────
-- workforce_request  (pack: neon.workforce-requests)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- Canonical catalog ownership. The consolidated permission sections above seed
-- against Foundation for dependency-safe bootstrap, then move Business Partner
-- permissions through the governed suspended state to the mdg.bp product module.
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM control.module
    WHERE code = 'bp' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Business Partner permission ownership requires the active mdg.bp module';
  END IF;
  IF EXISTS (
    SELECT 1 FROM authz.permission
    WHERE status = 'retired' AND (
         canonical_code LIKE 'neon.relationship.business_partner%'
      OR canonical_code LIKE 'neon.business_partner%'
      OR canonical_code LIKE 'neon.supplier.preference.%'
      OR canonical_code LIKE 'neon.supplier_registration.%'
      OR canonical_code LIKE 'neon.customer_registration.%'
      OR canonical_code LIKE 'neon.customer.credit.%'
      OR canonical_code LIKE 'neon.customer.lifecycle.%'
      OR canonical_code LIKE 'neon.workforce.invitation.%'
    )
  ) THEN
    RAISE EXCEPTION 'Retired Business Partner permissions cannot be rebound to mdg.bp';
  END IF;
END
$preflight$;

DO $rebind$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT permission.id, permission.status
    FROM authz.permission permission
    WHERE permission.module_id IS DISTINCT FROM (SELECT id FROM control.module WHERE code = 'bp')
      AND (
           permission.canonical_code LIKE 'neon.relationship.business_partner%'
        OR permission.canonical_code LIKE 'neon.business_partner%'
        OR permission.canonical_code LIKE 'neon.supplier.preference.%'
        OR permission.canonical_code LIKE 'neon.supplier_registration.%'
        OR permission.canonical_code LIKE 'neon.customer_registration.%'
        OR permission.canonical_code LIKE 'neon.customer.credit.%'
        OR permission.canonical_code LIKE 'neon.customer.lifecycle.%'
        OR permission.canonical_code LIKE 'neon.workforce.invitation.%'
      )
  LOOP
    IF target.status = 'published' THEN
      UPDATE authz.permission SET status = 'suspended' WHERE id = target.id;
    END IF;
    UPDATE authz.permission
    SET module_id = (SELECT id FROM control.module WHERE code = 'bp'),
        updated_at = now(),
        updated_by = '00000000-0000-0000-0000-000000000000'::uuid
    WHERE id = target.id;
    IF target.status = 'published' THEN
      UPDATE authz.permission SET status = 'published' WHERE id = target.id;
    END IF;
  END LOOP;
END
$rebind$;

DO $assertions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM authz.permission permission
    JOIN control.module module ON module.id = permission.module_id
    WHERE permission.canonical_code LIKE 'neon.relationship.business_partner%'
      AND module.code <> 'bp'
  ) THEN
    RAISE EXCEPTION 'Business Partner permissions remain outside mdg.bp';
  END IF;
END
$assertions$;
