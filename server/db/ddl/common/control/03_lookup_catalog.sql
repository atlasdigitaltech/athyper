-- Plane-local configurable vocabulary shared by Athyper, Neon, and Mesh.
-- Domain codes express semantic ownership; physical storage remains in control.

CREATE TABLE control.lookup_domain (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  source_schema text NOT NULL,
  is_extensible boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid
);

COMMENT ON TABLE control.lookup_domain IS
  'ARCHETYPE=B;SCOPE=N. Plane-local registry of named lookup domains. source_schema records semantic ownership, not physical storage.';

CREATE TABLE control.lookup_value (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  domain_code text NOT NULL,
  description text,
  category text,
  sort_order smallint DEFAULT 0 NOT NULL,
  is_system boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  is_active boolean GENERATED ALWAYS AS (status = 'active') STORED,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid
);

COMMENT ON TABLE control.lookup_value IS
  'ARCHETYPE=B;SCOPE=P+T. Global rows have NULL tenant_id/is_system=true; extensible domains may add tenant rows.';
