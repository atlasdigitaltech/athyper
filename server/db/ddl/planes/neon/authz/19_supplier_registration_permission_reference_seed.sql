-- seed-contract-version: 1
-- seed-pack: neon.supplier-registration-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:4
DO $guard$ BEGIN
 IF current_setting('app.database_plane',true)<>'neon' THEN RAISE EXCEPTION 'Supplier registration permissions require app.database_plane=neon'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN RAISE EXCEPTION 'Supplier registration permissions require active fnd module'; END IF;
END $guard$;
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
