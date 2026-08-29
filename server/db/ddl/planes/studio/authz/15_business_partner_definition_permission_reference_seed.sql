-- seed-contract-version: 1
-- seed-pack: studio.business-partner-definition-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"WP12 signed definition route contract","publisher":"Athyper","source_version":"1","retrieved_at":"2026-08-28","license":"internal"}
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper-permission-code
-- seed-expected-row-count: 3
-- seed-assertions: expected-count,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: semantic
DO $$ BEGIN IF current_setting('app.database_plane',true)<>'studio' THEN RAISE EXCEPTION 'Business Partner definition permissions require STUDIO'; END IF; END $$;
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
DO $$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'studio.business_partner_definition.%' AND status='published')<>3 THEN RAISE EXCEPTION 'Business Partner definition permission count mismatch'; END IF;
 IF (SELECT count(*) FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code LIKE 'studio.business_partner_definition.%' AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active')<>3 THEN RAISE EXCEPTION 'Business Partner definition permission scope mismatch'; END IF;
END $$;
