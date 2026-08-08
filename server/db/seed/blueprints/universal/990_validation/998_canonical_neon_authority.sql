-- Legacy master.auth_* bootstrap retired in Wave 5.
-- Canonical permissions are compiled by ddl/planes/neon/authz/12_compiled_permission_reference_seed.sql.
-- This late validation slot verifies the new authority without creating roles,
-- groups, memberships, principals, policies, or other mutable authorization data.
DO $assert$
DECLARE v_permission_count integer;
BEGIN
  IF current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION '[998_canonical_neon_authority] Neon plane required';
  END IF;
  SELECT count(*) INTO v_permission_count FROM authz.permission WHERE status='published';
  IF v_permission_count=0 THEN
    RAISE EXCEPTION '[998_canonical_neon_authority] compiled authz.permission authority is empty';
  END IF;
END $assert$;
