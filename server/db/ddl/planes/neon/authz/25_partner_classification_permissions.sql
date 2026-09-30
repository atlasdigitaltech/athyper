-- Catalog only: never implicitly grant classification writes or verification to existing actors.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
 is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT definition.id,definition.code,'entity_operation',module.id,definition.risk::authz.risk_tier_d,
 definition.mfa,definition.sod,false,false,false,
 '{"_seed":{"pack":"neon.partner-classification","version":"1.0.0"},"qualificationAuthority":false}'::jsonb,
 'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1001'::uuid,'neon.business_partner_classification.read','medium',false,false),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1002'::uuid,'neon.business_partner_classification.declare','medium',false,false),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1003'::uuid,'neon.business_partner_classification.verify','high',true,true),
 ('7e7406e7-6095-5cbb-872c-55bdcd6c1004'::uuid,'neon.business_partner_classification.archive','high',true,false)
)definition(id,code,risk,mfa,sod)
WHERE module.code='bp' AND module.status='active'
ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'tenant'::authz.scope_kind_d,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code IN (
 'neon.business_partner_classification.read','neon.business_partner_classification.declare',
 'neon.business_partner_classification.verify','neon.business_partner_classification.archive')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE status='published' AND NOT is_shareable AND NOT is_delegable AND NOT is_overridable
  AND ((canonical_code IN('neon.business_partner_classification.read','neon.business_partner_classification.declare') AND NOT requires_mfa AND NOT requires_sod)
   OR(canonical_code='neon.business_partner_classification.verify' AND requires_mfa AND requires_sod)
   OR(canonical_code='neon.business_partner_classification.archive' AND requires_mfa AND NOT requires_sod)))<>4
 THEN RAISE EXCEPTION 'Classification permission contract drift'; END IF;
 IF EXISTS(SELECT 1 FROM authz.permission_scope_kind s JOIN authz.permission p ON p.id=s.permission_id
  WHERE p.canonical_code IN('neon.business_partner_classification.read','neon.business_partner_classification.declare','neon.business_partner_classification.verify','neon.business_partner_classification.archive')
   AND s.status='active' AND(s.scope_kind<>'tenant' OR s.propagation_mode<>'exact'))
 THEN RAISE EXCEPTION 'Classification permissions must remain exact tenant scope'; END IF;
END $$;
