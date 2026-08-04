SELECT
    principal.id::text AS principal_id,
    principal.tenant_id::text AS boundary_id,
    principal.code AS principal_code,
    principal.name AS display_name,
    principal.principal_type,
    CASE WHEN principal.is_locked THEN 'locked' ELSE principal.status END AS status,
    binding.id::text AS binding_id,
    binding.realm_key,
    binding.provider_code,
    binding.subject_id,
    binding.username,
    binding.issuer,
    binding.client_id
FROM master.principal AS principal
JOIN master.principal_identity_binding AS binding
  ON binding.principal_id = principal.id
WHERE principal.status = 'active'
   OR principal.is_locked
