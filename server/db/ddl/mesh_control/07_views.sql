-- ============================================================================
-- mesh_control/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "mesh_control"."v_authorization_v2_operation_publication" WITH (security_invoker=true, security_barrier=true) AS
SELECT operation_row.id AS entity_operation_id,
    operation_row.catalog_owner_id,
    operation_row.account_id,
    operation_row.account_scope_key,
    operation_row.entity_id,
    operation_row.entity_version_id,
    operation_row.operation_code,
    operation_row.permission_id,
    operation_row.status AS operation_status,
    operation_plane.plane_code,
    operation_plane.status AS operation_plane_status,
    entity_row.entity_code,
    entity_row.status AS entity_status,
    permission_row.canonical_code AS permission_code,
    permission_row.status AS permission_status,
    permission_plane.status AS permission_plane_status,
    owner_row.status AS catalog_owner_status,
    mesh_control.authorization_v2_owner_aligned(operation_row.catalog_owner_id, operation_row.account_id) AS owner_account_aligned,
    permission_row.id IS NOT NULL AND permission_row.catalog_owner_id = operation_row.catalog_owner_id AND permission_row.account_scope_key = operation_row.account_scope_key AND permission_row.entity_id = operation_row.entity_id AND permission_row.operation_code = operation_row.operation_code AS exact_permission_aligned,
    COALESCE(operation_row.status = 'published'::text AND operation_plane.status = 'published'::text AND entity_row.status = 'published'::text AND permission_row.status = 'published'::text AND permission_plane.status = 'active'::text AND owner_row.status = 'active'::text AND operation_plane.plane_code = 'mesh'::text AND permission_plane.plane_code = 'mesh'::text AND mesh_control.authorization_v2_owner_aligned(operation_row.catalog_owner_id, operation_row.account_id) AND permission_row.catalog_owner_id = operation_row.catalog_owner_id AND permission_row.account_scope_key = operation_row.account_scope_key AND permission_row.entity_id = operation_row.entity_id AND permission_row.operation_code = operation_row.operation_code AND mesh_control.authorization_v2_is_effective(entity_row.effective_from, entity_row.effective_until, statement_timestamp()) AND mesh_control.authorization_v2_is_effective(operation_row.effective_from, operation_row.effective_until, statement_timestamp()) AND mesh_control.authorization_v2_is_effective(permission_row.effective_from, permission_row.effective_until, statement_timestamp()) AND mesh_control.authorization_v2_is_effective(permission_plane.effective_from, permission_plane.effective_until, statement_timestamp()), false) AS is_publishable
   FROM mesh_control.entity_operation operation_row
     LEFT JOIN mesh_control.entity entity_row ON entity_row.id = operation_row.entity_id AND entity_row.catalog_owner_id = operation_row.catalog_owner_id AND entity_row.account_scope_key = operation_row.account_scope_key
     LEFT JOIN mesh_control.entity_operation_plane operation_plane ON operation_plane.entity_operation_id = operation_row.id
     LEFT JOIN mesh_control.auth_permission permission_row ON permission_row.id = operation_row.permission_id
     LEFT JOIN mesh_control.auth_permission_plane permission_plane ON permission_plane.permission_id = operation_row.permission_id AND permission_plane.plane_code = operation_plane.plane_code
     LEFT JOIN mesh_control.auth_catalog_owner owner_row ON owner_row.id = operation_row.catalog_owner_id
  WHERE pg_has_role(CURRENT_USER, 'athyperadmin'::name, 'member'::text);

COMMENT ON VIEW "mesh_control"."v_authorization_v2_operation_publication" IS 'Admin-only proof that a Mesh operation has an exact active owner, entity, permission, and plane chain.';
