CREATE VIEW master.principal_directory
WITH (security_barrier = true)
AS
SELECT
    p.id,
    p.tenant_id,
    p.code,
    p.name,
    p.principal_type,
    p.status,
    p.is_active,
    profile.given_name,
    profile.family_name,
    profile.preferred_name,
    profile.display_name,
    profile.avatar_url
FROM master.principal AS p
LEFT JOIN master.principal_profile AS profile
  ON profile.tenant_id = p.tenant_id
 AND profile.principal_id = p.id
WHERE p.tenant_id = shared.current_tenant_id_soft();

COMMENT ON VIEW master.principal_directory IS
  'Safe tenant directory projection. Excludes IAM subjects, auth_epoch, external references, provider attributes, and unrestricted metadata.';
