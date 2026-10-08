-- Read inventory for publication-time human eligibility rechecks only.
-- No authoring, approval, IAM mutation, role membership or RLS bypass is granted.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_publication_service' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'RESOURCE_PUBLICATION_ROLE_PREFLIGHT_FAILED';
 END IF;
END $$;
GRANT USAGE ON SCHEMA authz,master,control,runtime_meta,publication TO athyper_publication_service;
GRANT SELECT ON authz.delegation,
authz.delegation_grant,
authz.deny_rule,
authz.entity_operation_binding,
authz.entity_operation_scope_binding,
authz.group_member,
authz.group_role,
authz.override,
authz.permission,
authz.permission_scope_kind,
authz.plane_membership,
authz.principal_group,
authz.record_acl,
authz.role,
authz.role_permission,
authz.scope_target,
control.module,
master.principal,
master.tenant,
runtime_meta.entity_contract,
runtime_meta.entity_descriptor,
runtime_meta.release_activation_head,
master.principal_identity_binding TO athyper_publication_service;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_review(uuid),
 publication.read_authoring_resource_history(uuid,uuid),
 publication.read_authoring_resource_current_source(uuid,uuid) TO athyper_publication_service;
