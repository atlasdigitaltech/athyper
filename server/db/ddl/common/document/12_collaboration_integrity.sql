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
-- Exact owner coordinates are stored at admission; raw policy JSON is not a client field.

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
CREATE INDEX comment_draft_expiry_idx ON document.comment_draft(expires_at,tenant_id,id);
