REVOKE ALL ON
    authz.current_plane_membership,
    authz.current_group_member,
    authz.current_group_role,
    authz.published_role_permission,
    authz.current_delegation_grant,
    authz.scope_target_catalog,
    event.authorization_invalidation_health,
    snapshot.latest_entity_snapshot,
    snapshot.entity_contract_inventory,
    snapshot.active_flow_template,
    snapshot.blueprint_catalog,
    audit.resolution_pipeline,
    audit.p2p_timeline
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT SELECT ON
      authz.current_plane_membership, authz.current_group_member,
      authz.current_group_role, authz.published_role_permission,
      authz.current_delegation_grant, authz.scope_target_catalog,
      event.authorization_invalidation_health,
      snapshot.latest_entity_snapshot, snapshot.entity_contract_inventory,
      snapshot.active_flow_template, snapshot.blueprint_catalog,
      audit.resolution_pipeline, audit.p2p_timeline
    TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT SELECT ON
      authz.current_plane_membership, authz.current_group_member,
      authz.current_group_role, authz.published_role_permission,
      authz.current_delegation_grant, authz.scope_target_catalog,
      event.authorization_invalidation_health,
      snapshot.latest_entity_snapshot, snapshot.entity_contract_inventory,
      snapshot.active_flow_template, snapshot.blueprint_catalog,
      audit.resolution_pipeline, audit.p2p_timeline
    TO athyperadmin;
  END IF;
END;
$$;
