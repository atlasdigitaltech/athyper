BEGIN;

CREATE TABLE IF NOT EXISTS ai.atlas_experience_release (
  id uuid DEFAULT shared.uuidv7() NOT NULL,
  tenant_id uuid NOT NULL,
  scope text NOT NULL,
  revision bigint NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  definition jsonb NOT NULL,
  content_hash char(64) NOT NULL,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT atlas_experience_release_pkey PRIMARY KEY (id),
  CONSTRAINT atlas_experience_release_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT atlas_experience_release_revision_uq UNIQUE (tenant_id, scope, revision),
  CONSTRAINT atlas_experience_release_scope_chk CHECK (scope ~ '^[a-z][a-z0-9_.:-]{0,127}$'),
  CONSTRAINT atlas_experience_release_revision_chk CHECK (revision > 0),
  CONSTRAINT atlas_experience_release_status_chk CHECK (status IN ('draft','published','retired')),
  CONSTRAINT atlas_experience_release_definition_chk CHECK (
    jsonb_typeof(definition) = 'object'
    AND definition->>'schema' = 'atlas-experience-definition/1'
    AND definition->>'scope' = scope
    AND octet_length(definition::text) <= 131072
  ),
  CONSTRAINT atlas_experience_release_hash_chk CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT atlas_experience_release_publication_chk CHECK (
    (status = 'draft' AND published_at IS NULL AND published_by IS NULL)
    OR (status IN ('published','retired') AND published_at IS NOT NULL AND published_by IS NOT NULL)
  ),
  CONSTRAINT atlas_experience_release_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_experience_release_draft_uq
  ON ai.atlas_experience_release (tenant_id, scope) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS atlas_experience_release_published_uq
  ON ai.atlas_experience_release (tenant_id, scope) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS atlas_experience_release_history_idx
  ON ai.atlas_experience_release (tenant_id, scope, revision DESC);

COMMENT ON TABLE ai.atlas_experience_release IS
  'Versioned Studio-authored Atlas widgets, search sources, starter prompts, and agent profiles. Each plane reads only its locally published projection.';

ALTER TABLE ai.atlas_experience_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_experience_release FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_experience_tenant_scope ON ai.atlas_experience_release;
CREATE POLICY atlas_experience_tenant_scope ON ai.atlas_experience_release
  FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id_soft())
  WITH CHECK (tenant_id = shared.current_tenant_id());

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT SELECT ON ai.atlas_experience_release TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT ALL ON ai.atlas_experience_release TO athyperadmin;
  END IF;
END
$grants$;

COMMIT;
