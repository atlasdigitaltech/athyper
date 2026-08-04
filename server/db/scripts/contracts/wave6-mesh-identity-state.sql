SELECT
    principal.id::text AS principal_id,
    principal.principal_code,
    principal.display_name,
    principal.principal_type,
    principal.status,
    binding.id::text AS binding_id,
    binding.realm_key,
    binding.provider_code,
    binding.subject_id,
    binding.username,
    binding.issuer,
    binding.client_id
FROM mesh.principal AS principal
JOIN mesh.principal_identity_binding AS binding
  ON binding.principal_id = principal.id
WHERE principal.status = 'active'
