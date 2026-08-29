BEGIN;

DO $plane_guard$
BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner permission catalog completion requires NEON';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM control.module WHERE code = 'fnd' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Business Partner permission catalog completion requires active fnd module';
  END IF;
END
$plane_guard$;

INSERT INTO authz.permission (
  id, canonical_code, permission_kind, module_id, risk_tier,
  requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
  metadata, status, created_by
)
SELECT definition.id, definition.code, 'entity_operation', module.id,
       definition.risk::authz.risk_tier_d, definition.mfa, definition.sod,
       false, false, false,
       '{"_seed":{"pack":"neon.business-partner-permission-catalog-completion","version":"1.0.0"}}'::jsonb,
       'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
  ('a8185d65-1eb9-5b58-96be-19fef76634b0'::uuid, 'neon.business_partner_profile_match.create',  'medium', false, false),
  ('f948f032-5e54-55d6-b0f0-048942353677'::uuid, 'neon.business_partner_profile_match.read',    'low',    false, false),
  ('488c0f90-ca12-5fa3-9e73-e4c65886977e'::uuid, 'neon.business_partner_profile_match.request', 'high',   true,  false),
  ('ec73bb07-5bb4-5343-a5b4-8e99e22b54dc'::uuid, 'neon.relationship.business_partner.activate',  'high',   true,  true)
) AS definition(id, code, risk, mfa, sod)
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
WHERE canonical_code LIKE 'neon.business_partner_profile_match.%'
   OR canonical_code = 'neon.relationship.business_partner.activate'
ON CONFLICT (permission_id, scope_kind, propagation_mode)
DO UPDATE SET status = 'active';

DO $assertions$
BEGIN
  IF (
    SELECT count(*) FROM authz.permission
    WHERE canonical_code LIKE 'neon.business_partner_profile_match.%'
      AND status = 'published'
  ) <> 3 THEN
    RAISE EXCEPTION 'Business Partner profile-match permission count mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM authz.permission
    WHERE canonical_code = 'neon.relationship.business_partner.activate'
      AND status = 'published' AND requires_mfa AND requires_sod
  ) THEN
    RAISE EXCEPTION 'Business Partner activation permission contract is incomplete';
  END IF;
END
$assertions$;

COMMIT;
