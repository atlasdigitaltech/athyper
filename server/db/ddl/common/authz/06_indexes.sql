CREATE INDEX application_projection_tenant_status_idx ON authz.application_projection(tenant_id,status,effective_from,effective_until);
CREATE UNIQUE INDEX application_projection_effective_org_uq ON authz.application_projection(realm_key,external_organization_id) WHERE status='active' AND effective_until IS NULL;
ALTER TABLE authz.application_projection ADD CONSTRAINT application_projection_no_overlap EXCLUDE USING gist (realm_key WITH =,external_organization_id WITH =,tstzrange(effective_from,effective_until,'[)') WITH &&) WHERE(status IN ('pending','active','suspended'));
CREATE INDEX projection_scope_effective_idx ON authz.projection_scope(tenant_id,projection_id,status,effective_from,effective_until);

CREATE INDEX entity_operation_scope_binding_runtime_ix
    ON authz.entity_operation_scope_binding
       (tenant_id,source_entity_operation_id,decision_mode,scope_kind)
    WHERE status = 'published';
CREATE INDEX entity_operation_scope_binding_permission_ix
    ON authz.entity_operation_scope_binding (permission_id,scope_kind)
    WHERE status = 'published';
CREATE INDEX entity_operation_scope_binding_release_ix
    ON authz.entity_operation_scope_binding (source_release_id,source_compiled_artifact_id);
