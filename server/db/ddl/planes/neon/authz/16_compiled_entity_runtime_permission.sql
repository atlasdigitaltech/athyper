-- seed-contract-version: 1
-- seed-pack: neon.compiled-entity-runtime-business-partner-permission
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Business Partner compiled-entity runtime contract","publisher":"Athyper","source_version":"2.0.0","retrieved_at":"2026-09-20","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:70
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Compiled entity runtime permission seed requires app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code = 'fnd' AND status = 'active') THEN
    RAISE EXCEPTION 'Compiled entity runtime permission seed requires the active fnd module';
  END IF;
END
$guard$;

INSERT INTO authz.permission (
  id, canonical_code, permission_kind, module_id, risk_tier,
  requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
  metadata, status, created_by
)
SELECT definition.id, definition.code, 'entity_operation', module.id,
       definition.risk::authz.risk_tier_d, definition.mfa, definition.sod,
       false, false, false,
       '{"_seed":{"pack":"neon.compiled-entity-runtime-business-partner-permission","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
    ('b21ba1dc-3b4e-58c2-b37c-0ab8cbe9c7aa'::uuid, 'neon.address.read', 'low', false, false),
    ('06a46af9-8b52-5cf1-9cf5-3ce74af7e260'::uuid, 'neon.address_link.read', 'low', false, false),
    ('6f536107-9059-5ada-9263-aa979bbf23b6'::uuid, 'neon.business_partner_banking.read', 'medium', false, false),
    ('d408aab3-2dab-54d4-9a0f-9eb602b14f8a'::uuid, 'neon.business_partner_governance_relation.read', 'medium', false, false),
    ('da03b74e-759a-586f-9e71-caadfd76187a'::uuid, 'neon.business_partner_identifier.read', 'medium', false, false),
    ('1f67b6ce-c43e-5075-8d0c-45d605d714d5'::uuid, 'neon.business_partner_industry_classification.read', 'low', false, false),
    ('28d9154f-7662-5242-8c13-71a31c5a75e9'::uuid, 'neon.business_partner_operating_organization_assignment.read', 'low', false, false),
    ('5e1e2d06-4888-5e90-94e3-87ccd22563f7'::uuid, 'neon.business_partner_qualification.read', 'medium', false, false),
    ('e9e77a59-dec2-5591-ae76-dc06bbcce46d'::uuid, 'neon.business_partner_request.approve', 'high', true, true),
    ('8ab392eb-a4e8-5593-a148-51115165ec9f'::uuid, 'neon.business_partner_request.create_draft', 'medium', false, false),
    ('9e529a3b-3e8d-58b6-acad-adf21ee1f609'::uuid, 'neon.business_partner_request.materialize', 'high', true, true),
    ('23faeb87-b6c4-5159-8a15-1f00a39a1f9e'::uuid, 'neon.business_partner_request.read', 'medium', false, false),
    ('3d1152a3-65ea-5484-967f-f6bcdf886515'::uuid, 'neon.business_partner_request.reject', 'high', true, true),
    ('41c6c425-c491-5fef-8e44-8cc037668ae4'::uuid, 'neon.business_partner_request.return', 'medium', false, false),
    ('5ee61945-6963-5687-a7e5-daffd076be31'::uuid, 'neon.business_partner_request.save_draft', 'medium', false, false),
    ('18069c52-fa35-5c11-aca8-47e6a6184f6e'::uuid, 'neon.business_partner_request.submit', 'medium', false, false),
    ('2b4668c1-d88a-5763-9b94-7e04e46b022c'::uuid, 'neon.business_partner_tax_registration.read', 'medium', false, false),
    ('8665d634-f61c-5f0b-aa5c-f00a5d232eca'::uuid, 'neon.certification.read', 'medium', false, false),
    ('51df1e74-6931-5a09-87ae-714c8b47f7af'::uuid, 'neon.collaboration.attachment.archive', 'medium', false, false),
    ('feae10b7-0552-5841-a2cb-fba6ca7fd910'::uuid, 'neon.collaboration.attachment.create', 'medium', false, false),
    ('b1b6475a-7654-5471-9c9e-3d3f7e85feb1'::uuid, 'neon.collaboration.attachment.download', 'medium', false, false),
    ('b50b7f66-5072-5165-9e96-903aadf6b4e0'::uuid, 'neon.collaboration.attachment.finalize', 'medium', false, false),
    ('8aed98d2-1387-5b5a-9870-5ad86d8743f0'::uuid, 'neon.collaboration.attachment.read', 'low', false, false),
    ('750aaee0-b5e7-52c1-8e61-36c1b3a08ab2'::uuid, 'neon.collaboration.comment.archive_own', 'low', false, false),
    ('757409e4-49dc-53df-afc3-8f0cdfddf980'::uuid, 'neon.collaboration.comment.create', 'low', false, false),
    ('8ffcc98d-48dc-522c-8f5c-dc1c0a6289d2'::uuid, 'neon.collaboration.comment.read', 'low', false, false),
    ('346d69e2-de49-5f84-83a0-0677ffe1b70b'::uuid, 'neon.collaboration.comment.update_own', 'low', false, false),
    ('81ec7a7e-ee6b-59f7-a8ff-afbcf02ff322'::uuid, 'neon.contact_person.read', 'low', false, false),
    ('fd5ac720-0ce6-5d9a-ac47-eb6629bd764b'::uuid, 'neon.customer.read', 'low', false, false),
    ('2c7c8a95-bbee-5283-88d8-22aab18d3762'::uuid, 'neon.customer_company_profile.read', 'medium', false, false),
    ('3e79c873-3b9d-51af-8f81-d70ebc41e602'::uuid, 'neon.relationship.business_partner.mesh_publish', 'high', true, false),
    ('a5d93334-fee3-5ca3-bfe8-0731cd95612f'::uuid, 'neon.relationship.business_partner.print', 'low', false, false),
    ('98e8ae0e-0d32-59ff-a0cb-bc736d11fe6b'::uuid, 'neon.supplier.read', 'low', false, false),
    ('38c9b65e-585e-510e-93ef-82834184d735'::uuid, 'neon.supplier_company_profile.read', 'medium', false, false),
    ('bc7be3c4-9fcf-5e69-81e1-8f0b4117a383'::uuid, 'neon.workforce.read', 'medium', false, false)
) AS definition(id, code, risk, mfa, sod)
WHERE module.code = 'fnd' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier = EXCLUDED.risk_tier,
  requires_mfa = EXCLUDED.requires_mfa,
  requires_sod = EXCLUDED.requires_sod,
  metadata = authz.permission.metadata || EXCLUDED.metadata,
  status = 'published'
WHERE (authz.permission.risk_tier, authz.permission.requires_mfa,
       authz.permission.requires_sod, authz.permission.status)
  IS DISTINCT FROM (EXCLUDED.risk_tier, EXCLUDED.requires_mfa,
                    EXCLUDED.requires_sod, EXCLUDED.status);

INSERT INTO authz.permission_scope_kind (permission_id, scope_kind, propagation_mode, status, created_by)
SELECT permission.id, 'operating_organization', 'subtree', 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission AS permission
WHERE permission.canonical_code IN (
  SELECT definition.code FROM (VALUES
    ('neon.address.read'), ('neon.address_link.read'), ('neon.business_partner_banking.read'),
    ('neon.business_partner_governance_relation.read'),
    ('neon.business_partner_identifier.read'), ('neon.business_partner_industry_classification.read'),
    ('neon.business_partner_operating_organization_assignment.read'), ('neon.business_partner_qualification.read'),
    ('neon.business_partner_request.approve'), ('neon.business_partner_request.create_draft'),
    ('neon.business_partner_request.materialize'), ('neon.business_partner_request.read'),
    ('neon.business_partner_request.reject'), ('neon.business_partner_request.return'),
    ('neon.business_partner_request.save_draft'), ('neon.business_partner_request.submit'),
    ('neon.business_partner_tax_registration.read'), ('neon.certification.read'),
    ('neon.collaboration.attachment.archive'), ('neon.collaboration.attachment.create'),
    ('neon.collaboration.attachment.download'), ('neon.collaboration.attachment.finalize'),
    ('neon.collaboration.attachment.read'), ('neon.collaboration.comment.archive_own'),
    ('neon.collaboration.comment.create'), ('neon.collaboration.comment.read'),
    ('neon.collaboration.comment.update_own'), ('neon.contact_person.read'), ('neon.customer.read'),
    ('neon.customer_company_profile.read'), ('neon.relationship.business_partner.mesh_publish'),
    ('neon.relationship.business_partner.print'), ('neon.supplier.read'),
    ('neon.supplier_company_profile.read')
  ) AS definition(code)
)
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active'
WHERE authz.permission_scope_kind.status IS DISTINCT FROM EXCLUDED.status;

DELETE FROM authz.permission_scope_kind AS scope
USING authz.permission AS permission
WHERE scope.permission_id=permission.id
  AND permission.canonical_code='neon.workforce.read'
  AND scope.scope_kind='operating_organization';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'company_code','exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code='neon.workforce.read'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission
      WHERE canonical_code IN (SELECT code FROM (VALUES
        ('neon.address.read'), ('neon.address_link.read'), ('neon.business_partner_banking.read'),
        ('neon.business_partner_governance_relation.read'),
        ('neon.business_partner_identifier.read'), ('neon.business_partner_industry_classification.read'),
        ('neon.business_partner_operating_organization_assignment.read'), ('neon.business_partner_qualification.read'),
        ('neon.business_partner_request.approve'), ('neon.business_partner_request.create_draft'),
        ('neon.business_partner_request.materialize'), ('neon.business_partner_request.read'),
        ('neon.business_partner_request.reject'), ('neon.business_partner_request.return'),
        ('neon.business_partner_request.save_draft'), ('neon.business_partner_request.submit'),
        ('neon.business_partner_tax_registration.read'), ('neon.certification.read'),
        ('neon.collaboration.attachment.archive'), ('neon.collaboration.attachment.create'),
        ('neon.collaboration.attachment.download'), ('neon.collaboration.attachment.finalize'),
        ('neon.collaboration.attachment.read'), ('neon.collaboration.comment.archive_own'),
        ('neon.collaboration.comment.create'), ('neon.collaboration.comment.read'),
        ('neon.collaboration.comment.update_own'), ('neon.contact_person.read'), ('neon.customer.read'),
        ('neon.customer_company_profile.read'), ('neon.relationship.business_partner.mesh_publish'),
        ('neon.relationship.business_partner.print'), ('neon.supplier.read'),
        ('neon.supplier_company_profile.read'), ('neon.workforce.read')
      ) AS definition(code)) AND status='published') <> 35 THEN
    RAISE EXCEPTION 'Compiled entity runtime Business Partner permission count mismatch';
  END IF;
END
$assertions$;
