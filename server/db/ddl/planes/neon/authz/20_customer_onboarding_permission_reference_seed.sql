-- seed-contract-version: 1
-- seed-pack: neon.customer-onboarding-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:10
DO $guard$ BEGIN
 IF current_setting('app.database_plane',true)<>'neon' THEN RAISE EXCEPTION 'Customer onboarding permissions require app.database_plane=neon'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN RAISE EXCEPTION 'Customer onboarding permissions require active fnd module'; END IF;
END $guard$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.customer-onboarding-permissions","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('30a20e34-e57e-5d8a-86d4-b31fc6943101','neon.customer.credit.create','high',false,true),
 ('c25dc54d-ce79-5d2e-812c-889a810401d4','neon.customer.credit.decide','critical',true,true),
 ('a59ceba9-57f8-5654-8c08-f9998dc30d27','neon.customer.credit.read','medium',false,false),
 ('c39e35d0-659a-5a90-a6a7-c39dbf84b730','neon.customer.lifecycle.activate','critical',true,true),
 ('87075ec5-2c1c-540a-b209-ed1fb0a18c53','neon.customer.lifecycle.suspend','critical',true,true),
 ('e05ed0ea-5b99-5877-ad9a-b23f49bfec3a','neon.customer.lifecycle.reactivate','critical',true,true)
 ,('d123781f-9f78-5260-a333-5db597b7135b','neon.customer_registration.invitation.create','high',false,true)
 ,('56c3aba8-13e5-5dc2-acfc-f9028830bdc1','neon.customer_registration.invitation.read','medium',false,false)
 ,('ed3dc9f6-151f-53f7-aee2-91b67a477219','neon.customer_registration.invitation.cancel','high',true,true)
 ,('98be6524-80bd-5918-8656-465ff80ca7f6','neon.customer_registration.external.respond','medium',false,false)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer.credit.%' OR canonical_code LIKE 'neon.customer.lifecycle.%'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer_registration.invitation.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.customer_registration.external.respond' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
DO $assert$ BEGIN IF(SELECT count(*) FROM authz.permission WHERE ((canonical_code LIKE 'neon.customer.credit.%' OR canonical_code LIKE 'neon.customer.lifecycle.%') OR canonical_code LIKE 'neon.customer_registration.%') AND status='published')<>10 THEN RAISE EXCEPTION 'Customer onboarding permission count mismatch'; END IF; END $assert$;
