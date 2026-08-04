SELECT object_type, canonical_value
FROM (
    SELECT 'mesh_control.auth_plane'::text AS object_type,
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at'] AS canonical_value
    FROM mesh_control.auth_plane AS row_value
    UNION ALL
    SELECT 'mesh_control.auth_permission',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh_control.auth_permission AS row_value
    UNION ALL
    SELECT 'mesh_control.auth_permission_plane',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh_control.auth_permission_plane AS row_value
    UNION ALL
    SELECT 'mesh_control.auth_permission_scope_policy',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh_control.auth_permission_scope_policy AS row_value
    UNION ALL
    SELECT 'mesh.auth_permission_set',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_permission_set AS row_value
    UNION ALL
    SELECT 'mesh.auth_permission_set_rule',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_permission_set_rule AS row_value
    UNION ALL
    SELECT 'mesh.auth_role',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_role AS row_value
    UNION ALL
    SELECT 'mesh.auth_role_permission_set',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_role_permission_set AS row_value
    UNION ALL
    SELECT 'mesh.auth_role_permission',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_role_permission AS row_value
    UNION ALL
    SELECT 'mesh.auth_group_v2',
           to_jsonb(row_value) - ARRAY['created_at', 'updated_at']
    FROM mesh.auth_group_v2 AS row_value
) AS seed_owned_rows
