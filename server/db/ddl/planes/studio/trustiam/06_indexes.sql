CREATE INDEX trustiam_organization_party_idx ON trustiam.organization(authority_tenant_id,canonical_party_id,status);
CREATE INDEX trustiam_projection_target_idx ON trustiam.application_projection(target_plane,target_tenant_id,status);
ALTER TABLE trustiam.application_projection ADD CONSTRAINT trustiam_application_projection_no_overlap EXCLUDE USING gist (organization_id WITH =,target_plane WITH =,tstzrange(effective_from,effective_until,'[)') WITH &&) WHERE (status IN ('pending','provisioning','active','suspended'));
CREATE INDEX trustiam_identity_provisioning_request_status_idx ON trustiam.identity_provisioning_request(authority_tenant_id,status,created_at);
CREATE INDEX trustiam_identity_provisioning_request_provider_idx ON trustiam.identity_provisioning_request(provider_subject) WHERE provider_subject IS NOT NULL;
CREATE UNIQUE INDEX trustiam_identity_provisioning_attempt_open_uq ON trustiam.identity_provisioning_attempt(authority_tenant_id,request_id) WHERE status IN ('claimed','started');
CREATE INDEX trustiam_identity_provisioning_attempt_lease_idx ON trustiam.identity_provisioning_attempt(lease_expires_at) WHERE status IN ('claimed','started');
