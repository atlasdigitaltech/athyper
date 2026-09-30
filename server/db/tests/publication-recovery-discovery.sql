-- Disposable PostgreSQL fixture; load this before the canonical discovery DDL.
CREATE ROLE athyperadmin NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE athyper_publication_service NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE athyper_publication_recovery NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT athyper_publication_recovery TO athyper_publication_service;
CREATE SCHEMA publication;
CREATE SCHEMA shared;
CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE TABLE publication.release (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
CREATE TABLE publication.artifact (id uuid PRIMARY KEY, publication_release_id uuid NOT NULL);
CREATE TABLE publication.deployment (
  id uuid PRIMARY KEY, artifact_id uuid NOT NULL, target_plane text NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL
);
ALTER TABLE publication.release ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.release FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON publication.release
  USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_access ON publication.release FOR SELECT TO athyperadmin USING (true);
GRANT USAGE ON SCHEMA publication TO athyperadmin, athyper_publication_service;
GRANT SELECT ON publication.release, publication.artifact, publication.deployment TO athyperadmin;
GRANT SELECT ON publication.release TO athyper_publication_service;
INSERT INTO publication.release VALUES
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO publication.artifact VALUES
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
INSERT INTO publication.deployment VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','neon','pending',now()-interval '10 minutes'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','mesh','verified',now()-interval '9 minutes'),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','mesh','pending',now());
