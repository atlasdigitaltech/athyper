CREATE INDEX trustiam_organization_party_idx ON trustiam.organization(authority_tenant_id,canonical_party_id,status);
CREATE INDEX trustiam_projection_target_idx ON trustiam.application_projection(target_plane,target_tenant_id,status);
ALTER TABLE trustiam.application_projection ADD CONSTRAINT trustiam_application_projection_no_overlap EXCLUDE USING gist (organization_id WITH =,target_plane WITH =,tstzrange(effective_from,effective_until,'[)') WITH &&) WHERE (status IN ('pending','provisioning','active','suspended'));
