-- Generated from canonical ATLAS EXPERIENCE FOUNDATION blocks.
-- Check: pnpm --dir server/db run db:verify:experience-foundation
-- Rebuild only this pending migration: pnpm --dir server/db run db:generate:experience-foundation
-- Atomic reconciliation: compatible existing tables/data remain untouched; drift aborts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
SELECT pg_advisory_xact_lock(hashtextextended('athyper:experience-foundation:20260910',0));

CREATE TEMP TABLE pg_temp.atlas_experience_expected_0 (
    id uuid DEFAULT shared.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    scope text NOT NULL,
    revision bigint NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    definition jsonb NOT NULL,
    content_hash character(64) NOT NULL,
    published_at timestamp with time zone,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone,
    updated_by uuid,
    CONSTRAINT atlas_experience_release_audit_pair_chk CHECK (((updated_at IS NULL) = (updated_by IS NULL))),
    CONSTRAINT atlas_experience_release_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072))) IS TRUE),
    CONSTRAINT atlas_experience_release_hash_chk CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT atlas_experience_release_publication_chk CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (published_by IS NULL)) OR ((status = ANY (ARRAY['published'::text, 'retired'::text])) AND (published_at IS NOT NULL) AND (published_by IS NOT NULL)))),
    CONSTRAINT atlas_experience_release_revision_chk CHECK ((revision > 0)),
    CONSTRAINT atlas_experience_release_scope_chk CHECK ((scope ~ '^[a-z][a-z0-9_.:-]{0,127}$'::text)),
    CONSTRAINT atlas_experience_release_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text])))
);

COMMENT ON TABLE pg_temp.atlas_experience_expected_0 IS 'Versioned Studio-authored Atlas widgets, search sources, starter prompts, and agent profiles. Each plane reads only its locally published projection.';

ALTER TABLE ONLY pg_temp.atlas_experience_expected_0
    ADD CONSTRAINT atlas_experience_release_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pg_temp.atlas_experience_expected_0
    ADD CONSTRAINT atlas_experience_release_revision_uq UNIQUE (tenant_id, scope, revision);

ALTER TABLE ONLY pg_temp.atlas_experience_expected_0
    ADD CONSTRAINT atlas_experience_release_tenant_id_uq UNIQUE (tenant_id, id);

CREATE UNIQUE INDEX atlas_experience_release_draft_uq ON pg_temp.atlas_experience_expected_0 USING btree (tenant_id, scope) WHERE (status = 'draft'::text);

CREATE INDEX atlas_experience_release_history_idx ON pg_temp.atlas_experience_expected_0 USING btree (tenant_id, scope, revision DESC);

CREATE UNIQUE INDEX atlas_experience_release_published_uq ON pg_temp.atlas_experience_expected_0 USING btree (tenant_id, scope) WHERE (status = 'published'::text);

ALTER TABLE pg_temp.atlas_experience_expected_0 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_temp.atlas_experience_expected_0 FORCE ROW LEVEL SECURITY;

CREATE POLICY atlas_experience_tenant_scope ON pg_temp.atlas_experience_expected_0 USING ((tenant_id = shared.current_tenant_id_soft())) WITH CHECK ((tenant_id = shared.current_tenant_id()));

REVOKE ALL ON TABLE pg_temp.atlas_experience_expected_0 FROM PUBLIC;
GRANT SELECT ON TABLE pg_temp.atlas_experience_expected_0 TO athyperapp;
GRANT ALL ON TABLE pg_temp.atlas_experience_expected_0 TO athyperadmin;

CREATE TEMP TABLE pg_temp.atlas_experience_expected_1 (
    id uuid DEFAULT shared.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    plane_code text NOT NULL,
    surface_key text NOT NULL,
    layer text NOT NULL,
    source_release_id uuid NOT NULL,
    source_revision bigint NOT NULL,
    definition jsonb NOT NULL,
    content_hash character(64) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid NOT NULL,
    retired_at timestamp with time zone,
    retired_by uuid,
    CONSTRAINT experience_surface_projection_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))) IS TRUE),
    CONSTRAINT experience_surface_projection_hash_chk CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT experience_surface_projection_key_chk CHECK ((surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'::text)),
    CONSTRAINT experience_surface_projection_layer_chk CHECK ((layer = ANY (ARRAY['shared'::text, 'tenant'::text]))),
    CONSTRAINT experience_surface_projection_local_plane_chk CHECK (((plane_code = current_setting('app.database_plane'::text, true)) AND (plane_code = substring(current_database() from 9))) IS TRUE),
    CONSTRAINT experience_surface_projection_plane_chk CHECK ((plane_code = ANY (ARRAY['studio'::text, 'neon'::text, 'mesh'::text]))),
    CONSTRAINT experience_surface_projection_retirement_chk CHECK ((((status = 'active'::text) AND (retired_at IS NULL) AND (retired_by IS NULL)) OR ((status = 'retired'::text) AND (retired_at IS NOT NULL) AND (retired_by IS NOT NULL)))),
    CONSTRAINT experience_surface_projection_revision_chk CHECK ((source_revision > 0)),
    CONSTRAINT experience_surface_projection_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

COMMENT ON TABLE pg_temp.atlas_experience_expected_1 IS 'Verified plane-local experience projection. Application planes never read Studio authoring tables at request time.';

ALTER TABLE ONLY pg_temp.atlas_experience_expected_1
    ADD CONSTRAINT experience_surface_projection_coordinate_uq UNIQUE (tenant_id, id);

ALTER TABLE ONLY pg_temp.atlas_experience_expected_1
    ADD CONSTRAINT experience_surface_projection_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pg_temp.atlas_experience_expected_1
    ADD CONSTRAINT experience_surface_projection_source_uq UNIQUE (tenant_id, source_release_id);

CREATE UNIQUE INDEX experience_surface_projection_active_uq ON pg_temp.atlas_experience_expected_1 USING btree (tenant_id, surface_key, layer) WHERE (status = 'active'::text);

CREATE INDEX experience_surface_projection_lookup_idx ON pg_temp.atlas_experience_expected_1 USING btree (tenant_id, surface_key, layer, source_revision DESC) WHERE (status = 'active'::text);

ALTER TABLE pg_temp.atlas_experience_expected_1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_temp.atlas_experience_expected_1 FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON pg_temp.atlas_experience_expected_1 USING ((tenant_id = shared.current_tenant_id_soft())) WITH CHECK ((tenant_id = shared.current_tenant_id()));

REVOKE ALL ON TABLE pg_temp.atlas_experience_expected_1 FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON TABLE pg_temp.atlas_experience_expected_1 TO athyperapp;
GRANT ALL ON TABLE pg_temp.atlas_experience_expected_1 TO athyperadmin;

CREATE OR REPLACE FUNCTION pg_temp.atlas_experience_signature(target regclass)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $signature$
SELECT jsonb_build_object(
 'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(ic.relname,i.indisvalid,regexp_replace(pg_get_indexdef(i.indexrelid),' ON .* USING ',' ON <table> USING ')) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal),
 'grants',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
) FROM pg_class c WHERE c.oid=target
$signature$;

DO $preflight$
BEGIN
 IF to_regclass('ai.atlas_experience_release') IS NOT NULL THEN
   LOCK TABLE ai.atlas_experience_release IN ACCESS EXCLUSIVE MODE;
   IF pg_temp.atlas_experience_signature('ai.atlas_experience_release'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('pg_temp.atlas_experience_expected_0'::regclass) THEN
     -- Compare the whole legacy signature, not just the named CHECKs.
     ALTER TABLE pg_temp.atlas_experience_expected_0 DROP CONSTRAINT atlas_experience_release_definition_chk, ADD CONSTRAINT atlas_experience_release_definition_chk CHECK (((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072)));
     IF pg_temp.atlas_experience_signature('ai.atlas_experience_release'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('pg_temp.atlas_experience_expected_0'::regclass) THEN
       RAISE EXCEPTION 'EXPERIENCE_SCHEMA_DRIFT: ai.atlas_experience_release; reconcile columns, constraints, indexes, RLS, policies, triggers and grants before retrying';
     END IF;
     ALTER TABLE ai.atlas_experience_release DROP CONSTRAINT atlas_experience_release_definition_chk, ADD CONSTRAINT atlas_experience_release_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072))) IS TRUE);
     ALTER TABLE pg_temp.atlas_experience_expected_0 DROP CONSTRAINT atlas_experience_release_definition_chk, ADD CONSTRAINT atlas_experience_release_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072))) IS TRUE);
   END IF;
 END IF;

 IF to_regclass('runtime_meta.experience_surface_projection') IS NOT NULL THEN
   LOCK TABLE runtime_meta.experience_surface_projection IN ACCESS EXCLUSIVE MODE;
   IF pg_temp.atlas_experience_signature('runtime_meta.experience_surface_projection'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('pg_temp.atlas_experience_expected_1'::regclass) THEN
     -- Compare the whole legacy signature, not just the named CHECKs.
     ALTER TABLE pg_temp.atlas_experience_expected_1 DROP CONSTRAINT experience_surface_projection_definition_chk, ADD CONSTRAINT experience_surface_projection_definition_chk CHECK (((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144)));
ALTER TABLE pg_temp.atlas_experience_expected_1 DROP CONSTRAINT experience_surface_projection_local_plane_chk, ADD CONSTRAINT experience_surface_projection_local_plane_chk CHECK ((plane_code = current_setting('app.database_plane'::text, true)));
     IF pg_temp.atlas_experience_signature('runtime_meta.experience_surface_projection'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('pg_temp.atlas_experience_expected_1'::regclass) THEN
       RAISE EXCEPTION 'EXPERIENCE_SCHEMA_DRIFT: runtime_meta.experience_surface_projection; reconcile columns, constraints, indexes, RLS, policies, triggers and grants before retrying';
     END IF;
     ALTER TABLE runtime_meta.experience_surface_projection DROP CONSTRAINT experience_surface_projection_definition_chk, ADD CONSTRAINT experience_surface_projection_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))) IS TRUE);
ALTER TABLE runtime_meta.experience_surface_projection DROP CONSTRAINT experience_surface_projection_local_plane_chk, ADD CONSTRAINT experience_surface_projection_local_plane_chk CHECK (((plane_code = current_setting('app.database_plane'::text, true)) AND (plane_code = substring(current_database() from 9))) IS TRUE);
     ALTER TABLE pg_temp.atlas_experience_expected_1 DROP CONSTRAINT experience_surface_projection_definition_chk, ADD CONSTRAINT experience_surface_projection_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))) IS TRUE);
ALTER TABLE pg_temp.atlas_experience_expected_1 DROP CONSTRAINT experience_surface_projection_local_plane_chk, ADD CONSTRAINT experience_surface_projection_local_plane_chk CHECK (((plane_code = current_setting('app.database_plane'::text, true)) AND (plane_code = substring(current_database() from 9))) IS TRUE);
   END IF;
 END IF;
END $preflight$;

DO $install$
BEGIN
 IF to_regclass('ai.atlas_experience_release') IS NULL THEN
CREATE TABLE ai.atlas_experience_release (
    id uuid DEFAULT shared.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    scope text NOT NULL,
    revision bigint NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    definition jsonb NOT NULL,
    content_hash character(64) NOT NULL,
    published_at timestamp with time zone,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone,
    updated_by uuid,
    CONSTRAINT atlas_experience_release_audit_pair_chk CHECK (((updated_at IS NULL) = (updated_by IS NULL))),
    CONSTRAINT atlas_experience_release_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072))) IS TRUE),
    CONSTRAINT atlas_experience_release_hash_chk CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT atlas_experience_release_publication_chk CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (published_by IS NULL)) OR ((status = ANY (ARRAY['published'::text, 'retired'::text])) AND (published_at IS NOT NULL) AND (published_by IS NOT NULL)))),
    CONSTRAINT atlas_experience_release_revision_chk CHECK ((revision > 0)),
    CONSTRAINT atlas_experience_release_scope_chk CHECK ((scope ~ '^[a-z][a-z0-9_.:-]{0,127}$'::text)),
    CONSTRAINT atlas_experience_release_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text])))
);

COMMENT ON TABLE ai.atlas_experience_release IS 'Versioned Studio-authored Atlas widgets, search sources, starter prompts, and agent profiles. Each plane reads only its locally published projection.';

ALTER TABLE ONLY ai.atlas_experience_release
    ADD CONSTRAINT atlas_experience_release_pkey PRIMARY KEY (id);

ALTER TABLE ONLY ai.atlas_experience_release
    ADD CONSTRAINT atlas_experience_release_revision_uq UNIQUE (tenant_id, scope, revision);

ALTER TABLE ONLY ai.atlas_experience_release
    ADD CONSTRAINT atlas_experience_release_tenant_id_uq UNIQUE (tenant_id, id);

CREATE UNIQUE INDEX atlas_experience_release_draft_uq ON ai.atlas_experience_release USING btree (tenant_id, scope) WHERE (status = 'draft'::text);

CREATE INDEX atlas_experience_release_history_idx ON ai.atlas_experience_release USING btree (tenant_id, scope, revision DESC);

CREATE UNIQUE INDEX atlas_experience_release_published_uq ON ai.atlas_experience_release USING btree (tenant_id, scope) WHERE (status = 'published'::text);

ALTER TABLE ai.atlas_experience_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_experience_release FORCE ROW LEVEL SECURITY;

CREATE POLICY atlas_experience_tenant_scope ON ai.atlas_experience_release USING ((tenant_id = shared.current_tenant_id_soft())) WITH CHECK ((tenant_id = shared.current_tenant_id()));

REVOKE ALL ON TABLE ai.atlas_experience_release FROM PUBLIC;
GRANT SELECT ON TABLE ai.atlas_experience_release TO athyperapp;
GRANT ALL ON TABLE ai.atlas_experience_release TO athyperadmin;
 END IF;
END $install$;

DO $install$
BEGIN
 IF to_regclass('runtime_meta.experience_surface_projection') IS NULL THEN
CREATE TABLE runtime_meta.experience_surface_projection (
    id uuid DEFAULT shared.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    plane_code text NOT NULL,
    surface_key text NOT NULL,
    layer text NOT NULL,
    source_release_id uuid NOT NULL,
    source_revision bigint NOT NULL,
    definition jsonb NOT NULL,
    content_hash character(64) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid NOT NULL,
    retired_at timestamp with time zone,
    retired_by uuid,
    CONSTRAINT experience_surface_projection_definition_chk CHECK ((((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))) IS TRUE),
    CONSTRAINT experience_surface_projection_hash_chk CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT experience_surface_projection_key_chk CHECK ((surface_key ~ '^[a-z][a-z0-9_.-]{1,126}$'::text)),
    CONSTRAINT experience_surface_projection_layer_chk CHECK ((layer = ANY (ARRAY['shared'::text, 'tenant'::text]))),
    CONSTRAINT experience_surface_projection_local_plane_chk CHECK (((plane_code = current_setting('app.database_plane'::text, true)) AND (plane_code = substring(current_database() from 9))) IS TRUE),
    CONSTRAINT experience_surface_projection_plane_chk CHECK ((plane_code = ANY (ARRAY['studio'::text, 'neon'::text, 'mesh'::text]))),
    CONSTRAINT experience_surface_projection_retirement_chk CHECK ((((status = 'active'::text) AND (retired_at IS NULL) AND (retired_by IS NULL)) OR ((status = 'retired'::text) AND (retired_at IS NOT NULL) AND (retired_by IS NOT NULL)))),
    CONSTRAINT experience_surface_projection_revision_chk CHECK ((source_revision > 0)),
    CONSTRAINT experience_surface_projection_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

COMMENT ON TABLE runtime_meta.experience_surface_projection IS 'Verified plane-local experience projection. Application planes never read Studio authoring tables at request time.';

ALTER TABLE ONLY runtime_meta.experience_surface_projection
    ADD CONSTRAINT experience_surface_projection_coordinate_uq UNIQUE (tenant_id, id);

ALTER TABLE ONLY runtime_meta.experience_surface_projection
    ADD CONSTRAINT experience_surface_projection_pkey PRIMARY KEY (id);

ALTER TABLE ONLY runtime_meta.experience_surface_projection
    ADD CONSTRAINT experience_surface_projection_source_uq UNIQUE (tenant_id, source_release_id);

CREATE UNIQUE INDEX experience_surface_projection_active_uq ON runtime_meta.experience_surface_projection USING btree (tenant_id, surface_key, layer) WHERE (status = 'active'::text);

CREATE INDEX experience_surface_projection_lookup_idx ON runtime_meta.experience_surface_projection USING btree (tenant_id, surface_key, layer, source_revision DESC) WHERE (status = 'active'::text);

ALTER TABLE runtime_meta.experience_surface_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.experience_surface_projection FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON runtime_meta.experience_surface_projection USING ((tenant_id = shared.current_tenant_id_soft())) WITH CHECK ((tenant_id = shared.current_tenant_id()));

REVOKE ALL ON TABLE runtime_meta.experience_surface_projection FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON TABLE runtime_meta.experience_surface_projection TO athyperapp;
GRANT ALL ON TABLE runtime_meta.experience_surface_projection TO athyperadmin;
 END IF;
END $install$;

DROP TABLE pg_temp.atlas_experience_expected_0, pg_temp.atlas_experience_expected_1;
DROP FUNCTION pg_temp.atlas_experience_signature(regclass);
COMMIT;
