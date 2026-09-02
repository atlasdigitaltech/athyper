BEGIN;

DO $$ BEGIN
  IF current_setting('app.database_plane', true) NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Experience surface foundation requires a known application plane';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS control.experience_surface_release (
  id uuid DEFAULT shared.uuidv7() NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  target_plane text NOT NULL,
  surface_key text NOT NULL,
  layer text NOT NULL DEFAULT 'tenant',
  revision bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  definition jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  source text NOT NULL DEFAULT 'human',
  validation_report jsonb NOT NULL DEFAULT '{"valid":true,"issues":[]}'::jsonb,
  base_release_id uuid,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT experience_surface_release_coordinate_uq UNIQUE(tenant_id,id),
  CONSTRAINT experience_surface_release_revision_uq UNIQUE(tenant_id,target_plane,surface_key,layer,revision),
  CONSTRAINT experience_surface_release_plane_chk CHECK(target_plane IN('studio','neon','mesh')),
  CONSTRAINT experience_surface_release_key_chk CHECK(surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT experience_surface_release_layer_chk CHECK(layer IN('shared','tenant')),
  CONSTRAINT experience_surface_release_revision_chk CHECK(revision>0),
  CONSTRAINT experience_surface_release_status_chk CHECK(status IN('draft','published','retired')),
  CONSTRAINT experience_surface_release_source_chk CHECK(source IN('human','atlas')),
  CONSTRAINT experience_surface_release_definition_chk CHECK(
    jsonb_typeof(definition)='object'
    AND definition->>'schema'='athyper-experience-surface/1'
    AND definition->>'id'=surface_key
    AND octet_length(definition::text)<=262144
  ),
  CONSTRAINT experience_surface_release_hash_chk CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT experience_surface_release_validation_chk CHECK(jsonb_typeof(validation_report)='object'),
  CONSTRAINT experience_surface_release_publication_chk CHECK(
    (status='draft' AND published_at IS NULL AND published_by IS NULL)
    OR (status IN('published','retired') AND published_at IS NOT NULL AND published_by IS NOT NULL)
  ),
  CONSTRAINT experience_surface_release_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_surface_release_draft_uq
  ON control.experience_surface_release(tenant_id,target_plane,surface_key,layer) WHERE status='draft';
CREATE UNIQUE INDEX IF NOT EXISTS experience_surface_release_published_uq
  ON control.experience_surface_release(tenant_id,target_plane,surface_key,layer) WHERE status='published';
CREATE INDEX IF NOT EXISTS experience_surface_release_history_idx
  ON control.experience_surface_release(tenant_id,target_plane,surface_key,layer,revision DESC);

COMMENT ON TABLE control.experience_surface_release IS
  'Studio-authored immutable experience revisions. Publishing retires the previous head; Atlas may create drafts but never publish.';

CREATE TABLE IF NOT EXISTS runtime_meta.experience_surface_projection (
  id uuid DEFAULT shared.uuidv7() NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  plane_code text NOT NULL,
  surface_key text NOT NULL,
  layer text NOT NULL,
  source_release_id uuid NOT NULL,
  source_revision bigint NOT NULL,
  definition jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid NOT NULL,
  retired_at timestamptz,
  retired_by uuid,
  CONSTRAINT experience_surface_projection_coordinate_uq UNIQUE(tenant_id,id),
  CONSTRAINT experience_surface_projection_source_uq UNIQUE(tenant_id,source_release_id),
  CONSTRAINT experience_surface_projection_plane_chk CHECK(plane_code IN('studio','neon','mesh')),
  CONSTRAINT experience_surface_projection_local_plane_chk CHECK(plane_code=current_setting('app.database_plane',true)),
  CONSTRAINT experience_surface_projection_key_chk CHECK(surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT experience_surface_projection_layer_chk CHECK(layer IN('shared','tenant')),
  CONSTRAINT experience_surface_projection_revision_chk CHECK(source_revision>0),
  CONSTRAINT experience_surface_projection_definition_chk CHECK(
    jsonb_typeof(definition)='object'
    AND definition->>'schema'='athyper-experience-surface/1'
    AND definition->>'id'=surface_key
    AND octet_length(definition::text)<=262144
  ),
  CONSTRAINT experience_surface_projection_hash_chk CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT experience_surface_projection_status_chk CHECK(status IN('active','retired')),
  CONSTRAINT experience_surface_projection_retirement_chk CHECK((status='active' AND retired_at IS NULL AND retired_by IS NULL) OR (status='retired' AND retired_at IS NOT NULL AND retired_by IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_surface_projection_active_uq
  ON runtime_meta.experience_surface_projection(tenant_id,surface_key,layer) WHERE status='active';
CREATE INDEX IF NOT EXISTS experience_surface_projection_lookup_idx
  ON runtime_meta.experience_surface_projection(tenant_id,surface_key,layer,source_revision DESC) WHERE status='active';

COMMENT ON TABLE runtime_meta.experience_surface_projection IS
  'Verified plane-local experience projection. Application planes never read Studio authoring tables at request time.';

CREATE TABLE IF NOT EXISTS control.route_slug_history (
  id uuid DEFAULT shared.uuidv7() NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  target_plane text NOT NULL,
  catalog_kind text NOT NULL,
  catalog_code text NOT NULL,
  source_path text NOT NULL,
  target_path text NOT NULL,
  redirect_status smallint NOT NULL DEFAULT 308,
  source_release_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT route_slug_history_coordinate_uq UNIQUE(tenant_id,id),
  CONSTRAINT route_slug_history_plane_chk CHECK(target_plane IN('studio','neon','mesh')),
  CONSTRAINT route_slug_history_kind_chk CHECK(catalog_kind IN('workspace','module','entity')),
  CONSTRAINT route_slug_history_code_chk CHECK(catalog_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT route_slug_history_source_path_chk CHECK(source_path ~ '^/[a-z0-9][a-z0-9/-]*$' AND source_path NOT LIKE '//%' AND source_path NOT LIKE '%..%'),
  CONSTRAINT route_slug_history_target_path_chk CHECK(target_path ~ '^/[a-z0-9][a-z0-9/-]*$' AND target_path NOT LIKE '//%' AND target_path NOT LIKE '%..%'),
  CONSTRAINT route_slug_history_loop_chk CHECK(source_path<>target_path),
  CONSTRAINT route_slug_history_redirect_chk CHECK(redirect_status IN(301,308)),
  CONSTRAINT route_slug_history_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT route_slug_history_status_chk CHECK(status IN('active','retired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS route_slug_history_active_source_uq
  ON control.route_slug_history(tenant_id,target_plane,source_path) WHERE status='active';
CREATE INDEX IF NOT EXISTS route_slug_history_target_idx
  ON control.route_slug_history(tenant_id,target_plane,target_path) WHERE status='active';

CREATE TABLE IF NOT EXISTS master.principal_surface_arrangement (
  id uuid DEFAULT shared.uuidv7() NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  plane_code text NOT NULL,
  surface_key text NOT NULL,
  base_revision bigint NOT NULL,
  arrangement jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT principal_surface_arrangement_uq UNIQUE(tenant_id,principal_id,plane_code,surface_key),
  CONSTRAINT principal_surface_arrangement_plane_chk CHECK(plane_code IN('studio','neon','mesh')),
  CONSTRAINT principal_surface_arrangement_key_chk CHECK(surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT principal_surface_arrangement_revision_chk CHECK(base_revision>0),
  CONSTRAINT principal_surface_arrangement_json_chk CHECK(jsonb_typeof(arrangement)='object' AND arrangement->>'schema'='athyper-experience-arrangement/1' AND octet_length(arrangement::text)<=32768),
  CONSTRAINT principal_surface_arrangement_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

ALTER TABLE control.experience_surface_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.experience_surface_release FORCE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.experience_surface_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.experience_surface_projection FORCE ROW LEVEL SECURITY;
ALTER TABLE control.route_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.route_slug_history FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_surface_arrangement ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_surface_arrangement FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access ON control.experience_surface_release;
CREATE POLICY tenant_access ON control.experience_surface_release FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS tenant_access ON runtime_meta.experience_surface_projection;
CREATE POLICY tenant_access ON runtime_meta.experience_surface_projection FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS tenant_access ON control.route_slug_history;
CREATE POLICY tenant_access ON control.route_slug_history FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS principal_access ON master.principal_surface_arrangement;
CREATE POLICY principal_access ON master.principal_surface_arrangement FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft() AND principal_id=master.current_principal_id_soft())
  WITH CHECK(tenant_id=shared.current_tenant_id() AND principal_id=master.current_principal_id_soft());

DO $grants$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE ON control.experience_surface_release TO athyperapp;
    GRANT SELECT,INSERT,UPDATE ON runtime_meta.experience_surface_projection TO athyperapp;
    GRANT SELECT,INSERT,UPDATE ON control.route_slug_history TO athyperapp;
    GRANT SELECT,INSERT,UPDATE,DELETE ON master.principal_surface_arrangement TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL ON control.experience_surface_release,runtime_meta.experience_surface_projection,control.route_slug_history,master.principal_surface_arrangement TO athyperadmin;
  END IF;
END $grants$;

COMMIT;
