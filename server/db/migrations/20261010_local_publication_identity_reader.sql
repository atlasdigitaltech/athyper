-- The installed runtime source adapter resolves current standing-authority actors.
-- Return bounded tenant-scoped eligibility only; no principal rows or IAM writes.
GRANT EXECUTE ON FUNCTION publication.local_publication_identity_status(uuid[],uuid,uuid) TO athyper_runtime;
