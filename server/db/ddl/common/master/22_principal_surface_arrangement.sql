-- Personal layouts are revision-bound data, not principal_ui_preference overrides.
CREATE TABLE master.principal_surface_arrangement (
  tenant_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  plane_code text NOT NULL,
  surface_key text NOT NULL CHECK (surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  base_revision integer NOT NULL CHECK (base_revision > 0),
  arrangement jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  PRIMARY KEY (tenant_id, principal_id, plane_code, surface_key),
  CHECK ((plane_code IN ('studio','neon','mesh')
    AND plane_code = current_setting('app.database_plane',true)
    AND current_database() = 'athyper_' || plane_code) IS TRUE),
  CHECK ((jsonb_typeof(arrangement) = 'object'
    AND arrangement->>'schema' = 'athyper-experience-arrangement/1'
    AND arrangement->>'surfaceId' = surface_key
    AND arrangement->'baseRevision' = to_jsonb(base_revision)
    AND octet_length(arrangement::text) <= 262144) IS TRUE),
  CHECK (created_by = principal_id),
  CHECK ((updated_at IS NULL AND updated_by IS NULL)
    OR (updated_at IS NOT NULL AND updated_by IS NOT NULL AND updated_by = principal_id))
);
ALTER TABLE master.principal_surface_arrangement ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_surface_arrangement FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_surface_arrangement_self ON master.principal_surface_arrangement
  USING (tenant_id = shared.current_tenant_id_soft()
    AND principal_id = master.current_principal_id_soft()
    AND plane_code = current_setting('app.database_plane',true)
    AND current_database() = 'athyper_' || plane_code)
  WITH CHECK (tenant_id = shared.current_tenant_id()
    AND principal_id = master.current_principal_id_soft()
    AND plane_code = current_setting('app.database_plane',true)
    AND current_database() = 'athyper_' || plane_code);
GRANT SELECT,INSERT,UPDATE,DELETE ON master.principal_surface_arrangement TO athyperapp;
COMMENT ON TABLE master.principal_surface_arrangement IS
  'Principal-owned, tenant/plane-isolated surface arrangements. Base revision and payload coordinates must agree. Not an authorization or surface-definition source.';
