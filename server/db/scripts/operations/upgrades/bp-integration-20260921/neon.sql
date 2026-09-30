-- Explicit upgrade from pre-CA DEV baseline; never replay canonical foundation DDL.
-- Rehearse against a restored backup before application. A repeat/partial baseline fails atomically.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('bp-integration-20260921',0));
DO $$ BEGIN IF current_database() <> 'athyper_neon' THEN RAISE EXCEPTION 'Wrong plane database'; END IF; END $$;
ALTER TABLE document.comment ADD COLUMN revision_no integer NOT NULL DEFAULT 1 CHECK(revision_no>0);
CREATE TABLE document.comment_revision (
    id             uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id      uuid                              NOT NULL,
    comment_id     uuid                              NOT NULL,
    revision_no    integer                           NOT NULL,
    comment_text   text                              NOT NULL,
    content_format document.comment_content_format_d NOT NULL DEFAULT 'plain',
    content_json   jsonb,
    content_html   text,
    content_schema text,
    visibility     document.comment_visibility_d NOT NULL,
    status         text NOT NULL,
    change_kind    text                              NOT NULL DEFAULT 'edit',
    created_at     timestamptz                       NOT NULL DEFAULT now(),
    created_by     uuid                              NOT NULL,

    CONSTRAINT comment_revision_pkey PRIMARY KEY (id),
    CONSTRAINT comment_revision_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT comment_revision_number_uq UNIQUE (tenant_id, comment_id, revision_no),
    CONSTRAINT comment_revision_number_chk CHECK (revision_no > 0),
    CONSTRAINT comment_revision_text_chk CHECK (btrim(comment_text) <> '' AND length(comment_text) <= 50000),
    CONSTRAINT comment_revision_kind_chk CHECK (change_kind IN ('create', 'edit', 'moderate', 'restore', 'delete')),
    CONSTRAINT comment_revision_content_json_chk CHECK (content_json IS NULL OR jsonb_typeof(content_json) = 'object'),
    CONSTRAINT comment_revision_content_schema_chk
        CHECK (content_schema IS NULL OR content_schema ~ '^athyper\.rich-text/[0-9]+\.[0-9]+$')
);

INSERT INTO document.comment_revision(tenant_id,comment_id,revision_no,comment_text,content_format,content_json,content_html,content_schema,visibility,status,change_kind,created_at,created_by)
SELECT tenant_id,id,revision_no,comment_text,content_format,content_json,content_html,content_schema,visibility,status,'create',COALESCE(updated_at,created_at),COALESCE(updated_by,created_by) FROM document.comment;
-- Shared CA-02 integrity, installed on every fresh plane after its foundation.
ALTER TABLE document.comment_revision
 ADD CONSTRAINT comment_revision_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id),
 ADD CONSTRAINT comment_revision_comment_fk FOREIGN KEY(tenant_id,comment_id) REFERENCES document.comment(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT comment_revision_actor_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id);
CREATE INDEX comment_revision_comment_idx ON document.comment_revision(tenant_id,comment_id,revision_no DESC);

-- The trigger is the only revision writer. Its insert participates in the comment
-- command's transaction, including its relations, receipt, audit and outbox.
CREATE FUNCTION document.trg_comment_revision_number() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.revision_no:=1;
 ELSE NEW.revision_no:=OLD.revision_no+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comment_revision_number BEFORE INSERT OR UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_revision_number();

CREATE FUNCTION document.trg_capture_comment_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE kind text;
BEGIN
 kind:=CASE WHEN TG_OP='INSERT' THEN 'create'
            WHEN NEW.status='deleted' AND OLD.status<>'deleted' THEN 'delete'
            WHEN OLD.status='deleted' AND NEW.status<>'deleted' THEN 'restore'
            WHEN NEW.status IS DISTINCT FROM OLD.status OR NEW.visibility IS DISTINCT FROM OLD.visibility THEN 'moderate'
            ELSE 'edit' END;
 INSERT INTO document.comment_revision(tenant_id,comment_id,revision_no,comment_text,content_format,content_json,content_html,content_schema,visibility,status,change_kind,created_by)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision_no,NEW.comment_text,NEW.content_format,NEW.content_json,NEW.content_html,NEW.content_schema,NEW.visibility,NEW.status,kind,COALESCE(NEW.updated_by,NEW.created_by));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION document.trg_capture_comment_revision() FROM PUBLIC;
CREATE TRIGGER comment_revision_capture AFTER INSERT OR UPDATE ON document.comment
FOR EACH ROW EXECUTE FUNCTION document.trg_capture_comment_revision();

CREATE FUNCTION document.trg_comment_revision_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Comment revisions are immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER comment_revision_immutable BEFORE UPDATE OR DELETE ON document.comment_revision
FOR EACH ROW EXECUTE FUNCTION document.trg_comment_revision_immutable();
ALTER TABLE document.comment_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY revision_owner ON document.comment_revision FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
-- History remains author-only until CA-03 supplies additional admitted history
-- readers. Current comment visibility/deletion still controls every revision.
CREATE POLICY revision_read ON document.comment_revision FOR SELECT TO athyperapp USING(
 tenant_id=shared.current_tenant_id_soft() AND EXISTS(
  SELECT 1 FROM document.comment c WHERE c.tenant_id=comment_revision.tenant_id
  AND c.id=comment_revision.comment_id AND c.commenter_id=master.current_principal_id_soft() AND c.status<>'deleted'));
REVOKE ALL ON document.comment_revision FROM PUBLIC,athyperapp;
GRANT SELECT ON document.comment_revision TO athyperapp;

-- A series display label can change without renaming an immutable stored file.
ALTER TABLE document.attachment_series ADD COLUMN display_name text
 CHECK(display_name IS NULL OR (btrim(display_name)<>'' AND length(display_name)<=1024)),
 ADD COLUMN revision_no integer NOT NULL DEFAULT 1 CHECK(revision_no>0);
ALTER TABLE document.attachment_link ADD COLUMN category_code text
 CHECK(category_code IS NULL OR category_code ~ '^[a-z][a-z0-9_]{1,62}$');
-- Exact owner coordinates are stored at admission; raw policy JSON is not a client field.
ALTER TABLE document.attachment ADD COLUMN admitted_release_hash text CHECK(admitted_release_hash IS NULL OR admitted_release_hash ~ '^sha256:[a-f0-9]{64}$'),
 ADD COLUMN admitted_policy_hash text CHECK(admitted_policy_hash IS NULL OR admitted_policy_hash ~ '^sha256:[a-f0-9]{64}$'),
 ADD COLUMN draft_id uuid,
 ADD CONSTRAINT attachment_draft_fk FOREIGN KEY(tenant_id,draft_id) REFERENCES document.comment_draft(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT attachment_admission_pair CHECK((admitted_release_hash IS NULL)=(admitted_policy_hash IS NULL));

-- Existing plane guards validate owner coordinates and recursively reject cycles.
-- Serialize record-local hierarchy changes so two concurrent moves cannot form one.
CREATE FUNCTION document.trg_lock_attachment_folder_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.entity_type||':'||NEW.entity_id,0));
 RETURN NEW;
END $$;
CREATE TRIGGER aa_attachment_folder_owner_lock BEFORE INSERT OR UPDATE ON document.attachment_folder
FOR EACH ROW EXECUTE FUNCTION document.trg_lock_attachment_folder_owner();

CREATE FUNCTION document.trg_attachment_immutable_bytes() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.is_virus_scanned AND (NOT NEW.is_virus_scanned OR
   ROW(NEW.sha256,NEW.size_bytes,NEW.content_type,NEW.storage_bucket,NEW.file_name,NEW.original_filename,NEW.series_id,NEW.version_no,NEW.parent_attachment_id)
   IS DISTINCT FROM ROW(OLD.sha256,OLD.size_bytes,OLD.content_type,OLD.storage_bucket,OLD.file_name,OLD.original_filename,OLD.series_id,OLD.version_no,OLD.parent_attachment_id)
   OR (NEW.storage_key IS DISTINCT FROM OLD.storage_key AND NOT(OLD.status IN('expired','deleted','orphaned') AND NEW.status='deleted' AND NEW.storage_key='purged/'||OLD.id::text))) THEN
  RAISE EXCEPTION 'Scanned attachment bytes and version identity are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.admitted_policy_hash IS NOT NULL AND
    ROW(NEW.metadata->>'entity_type',NEW.metadata->>'entity_id') IS DISTINCT FROM ROW(OLD.metadata->>'entity_type',OLD.metadata->>'entity_id') THEN
  RAISE EXCEPTION 'Admitted attachment owner is immutable' USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.admitted_release_hash,NEW.admitted_policy_hash) IS DISTINCT FROM ROW(OLD.admitted_release_hash,OLD.admitted_policy_hash) THEN
  RAISE EXCEPTION 'Upload admission is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attachment_immutable_bytes BEFORE UPDATE ON document.attachment
FOR EACH ROW EXECUTE FUNCTION document.trg_attachment_immutable_bytes();

-- Draft expiry is persisted from the admitted policy on each successful save.
ALTER TABLE document.comment_draft ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days');
CREATE INDEX comment_draft_expiry_idx ON document.comment_draft(expires_at,tenant_id,id);


-- Apply parent-audience admission to dependent rows as on fresh installations.
DROP POLICY tenant_read ON document.comment_mention;
CREATE POLICY tenant_read ON document.comment_mention
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND EXISTS (
            SELECT 1
            FROM document.comment AS comment_target
            WHERE comment_target.tenant_id = document.comment_mention.tenant_id
              AND comment_target.id = document.comment_mention.comment_id
        )
    );
DROP POLICY tenant_read ON document.comment_reaction;
CREATE POLICY tenant_read ON document.comment_reaction
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND EXISTS (
            SELECT 1
            FROM document.comment AS comment_target
            WHERE comment_target.tenant_id = document.comment_reaction.tenant_id
              AND comment_target.id = document.comment_reaction.comment_id
        )
    );
COMMIT;
