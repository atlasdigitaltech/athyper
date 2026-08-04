SELECT object_type, canonical_value FROM (
  SELECT 'control.auth_permission'::text object_type,
    to_jsonb(t) - ARRAY['created_at','updated_at'] canonical_value
  FROM control.auth_permission t
  UNION ALL SELECT 'control.auth_permission_scope_policy',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM control.auth_permission_scope_policy t
  UNION ALL SELECT 'control.auth_entitlement_target_policy',
    to_jsonb(t) - ARRAY['created_at']
  FROM control.auth_entitlement_target_policy t
  UNION ALL SELECT 'master.auth_plane_membership',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_plane_membership t
  UNION ALL SELECT 'master.auth_scope_target',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_scope_target t
  UNION ALL SELECT 'master.auth_role',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_role t
  UNION ALL SELECT 'master.auth_role_permission',
    to_jsonb(t) - ARRAY['created_at']
  FROM master.auth_role_permission t
  UNION ALL SELECT 'master.auth_group',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_group t
  UNION ALL SELECT 'master.auth_group_member',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_group_member t
  UNION ALL SELECT 'master.auth_group_role',
    to_jsonb(t) - ARRAY['created_at','updated_at']
  FROM master.auth_group_role t
) seed_owned_rows;
