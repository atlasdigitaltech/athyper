CREATE SCHEMA trustiam;

COMMENT ON SCHEMA trustiam IS
  'Athyper-only desired-state authority for identity organizations, approved identity providers, and application projections. Keycloak is an external TrustIAM authentication adapter; its database is never modified by application DDL.';
