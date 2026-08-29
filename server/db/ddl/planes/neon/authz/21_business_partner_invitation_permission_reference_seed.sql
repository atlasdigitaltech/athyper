-- seed-contract-version: 1
-- seed-pack: neon.business-partner-invitation-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:5
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
