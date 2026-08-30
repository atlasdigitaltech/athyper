-- seed-contract-version: 1
-- seed-pack: neon.business-partner-360-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Business Partner 360 Phase 1 contract lock","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-30","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:17
-- seed-demo-data: false

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner 360 permissions require app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN
    RAISE EXCEPTION 'Business Partner 360 permissions require the active fnd module';
  END IF;
END
$guard$;

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
