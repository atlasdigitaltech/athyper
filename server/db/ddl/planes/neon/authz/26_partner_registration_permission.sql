-- Core registration approval only. The service never uses this for commercial role cases.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT v.id,v.code,'entity_operation',m.id,CASE WHEN v.mfa THEN 'high' ELSE 'medium' END::authz.risk_tier_d,v.mfa,v.sod,false,false,false,'{"commercialApproval":false}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module m CROSS JOIN (VALUES
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1006'::uuid,'neon.business_partner_registration.create',false,false),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1007'::uuid,'neon.business_partner_registration.read',false,false),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1008'::uuid,'neon.business_partner_registration.validate',false,false),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1009'::uuid,'neon.business_partner_registration.submit',true,true),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1010'::uuid,'neon.business_partner_registration.materialize',true,true)
) v(id,code,mfa,sod) WHERE m.code='bp' AND m.status='active' ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
 is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT '7e7406e7-6095-5cbb-872c-55bdcd6c1005'::uuid,'neon.business_partner_registration.decide','entity_operation',id,'high',true,true,
 false,false,false,'{"commercialApproval":false}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module WHERE code='bp' AND status='active' ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code IN ('neon.business_partner_registration.decide','neon.business_partner_registration.create','neon.business_partner_registration.read','neon.business_partner_registration.validate','neon.business_partner_registration.submit','neon.business_partner_registration.materialize') ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM authz.permission WHERE canonical_code='neon.business_partner_registration.decide' AND status='published' AND requires_mfa AND requires_sod AND NOT is_shareable AND NOT is_delegable AND NOT is_overridable)
 THEN RAISE EXCEPTION 'Registration permission contract drift'; END IF;
 IF EXISTS(SELECT 1 FROM authz.permission_scope_kind s JOIN authz.permission p ON p.id=s.permission_id WHERE p.canonical_code='neon.business_partner_registration.decide' AND s.status='active' AND (s.scope_kind<>'tenant' OR s.propagation_mode<>'exact'))
 THEN RAISE EXCEPTION 'Registration approval is exact tenant scope'; END IF;
END $$;
