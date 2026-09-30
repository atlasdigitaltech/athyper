-- Atlas admission uses the authenticated session. Underlying operation policies remain authoritative.
-- No roles, grants, login policies, MFA enrollment, or operation permissions are changed.
BEGIN;
DO $$
DECLARE
  target authz.permission%ROWTYPE;
  plane text := substr(current_database(), 9);
  expected_id uuid;
  definition_hash text;
BEGIN
  IF plane NOT IN ('neon','studio','mesh') OR current_database() <> 'athyper_' || plane THEN
    RAISE EXCEPTION 'Known plane database required';
  END IF;
  CASE plane
    WHEN 'neon' THEN expected_id := '87052370-9394-5104-9f1d-b87e72c733ab'; definition_hash := 'ffd9a73c49fdefb90ae23489662b0f7aee3ec5ce081767c457b4359bfd434908';
    WHEN 'studio' THEN expected_id := '62980311-c596-5942-a5cf-69a97b2ac50a'; definition_hash := '5678760fae773db12a4961faa8e2e7102923883236c665fdcf3ed5ecde6e4ce1';
    WHEN 'mesh' THEN expected_id := '350c8f62-aa90-5a2c-89bb-e7dcde74a8d7'; definition_hash := '57e21c567aff072b66e8cedd90d3999246aa3b1e64e779c7199aa2fc7b571cc4';
  END CASE;
  SELECT * INTO target FROM authz.permission WHERE canonical_code=plane || '.ai.agent.use' FOR UPDATE;
  -- Fresh installations receive the policy from the canonical seed pack.
  IF NOT FOUND THEN RETURN; END IF;
  IF target.id <> expected_id OR target.permission_kind <> 'capability'
     OR target.risk_tier <> 'medium' OR target.requires_sod
     OR target.is_shareable OR target.is_delegable OR target.is_overridable THEN
    RAISE EXCEPTION 'Unexpected Atlas permission identity';
  END IF;
  IF target.status='retired' THEN RETURN; END IF;
  IF target.status='published' THEN
    UPDATE authz.permission SET status='suspended', updated_by=target.created_by, updated_at=now() WHERE id=target.id;
  END IF;
  UPDATE authz.permission SET requires_mfa=false,
    metadata=metadata || jsonb_build_object('_seed', coalesce(metadata->'_seed','{}'::jsonb) || jsonb_build_object('definitionSha256',definition_hash)),
    updated_by=target.created_by, updated_at=now() WHERE id=target.id;
  IF target.status='published' THEN
    UPDATE authz.permission SET status='published', updated_by=target.created_by, updated_at=now() WHERE id=target.id;
  END IF;
END $$;
COMMIT;
