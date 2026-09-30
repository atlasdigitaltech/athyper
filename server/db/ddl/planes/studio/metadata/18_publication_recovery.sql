-- Recovery evidence is NOT live authoring history or a new publication approval.
CREATE TABLE IF NOT EXISTS metadata.publication_recovery_archive (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 source_release_id uuid NOT NULL,
 entity_code text NOT NULL,
 artifact_hash text NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
 backup_hash text NOT NULL CHECK (backup_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND pg_column_size(payload)<=8388608),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
 imported_by text NOT NULL DEFAULT session_user,
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 UNIQUE(tenant_id,source_release_id),
 CHECK (expires_at>imported_at AND expires_at<=imported_at+interval '1 hour')
);
CREATE TABLE IF NOT EXISTS metadata.publication_recovery_revocation (
 archive_id uuid PRIMARY KEY REFERENCES metadata.publication_recovery_archive(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
 revoked_by text NOT NULL DEFAULT session_user,
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE metadata.publication_recovery_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.publication_recovery_archive FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publication_recovery_tenant ON metadata.publication_recovery_archive;
CREATE POLICY publication_recovery_tenant ON metadata.publication_recovery_archive
 USING(tenant_id=shared.current_tenant_id());
ALTER TABLE metadata.publication_recovery_revocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.publication_recovery_revocation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publication_recovery_revocation_tenant ON metadata.publication_recovery_revocation;
CREATE POLICY publication_recovery_revocation_tenant ON metadata.publication_recovery_revocation
 USING(EXISTS(SELECT 1 FROM metadata.publication_recovery_archive a WHERE a.id=archive_id AND a.tenant_id=shared.current_tenant_id()));
DROP TRIGGER IF EXISTS publication_recovery_archive_immutable ON metadata.publication_recovery_archive;
CREATE TRIGGER publication_recovery_archive_immutable BEFORE UPDATE OR DELETE ON metadata.publication_recovery_archive
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
DROP TRIGGER IF EXISTS publication_recovery_revocation_immutable ON metadata.publication_recovery_revocation;
CREATE TRIGGER publication_recovery_revocation_immutable BEFORE UPDATE OR DELETE ON metadata.publication_recovery_revocation
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
REVOKE ALL ON metadata.publication_recovery_archive,metadata.publication_recovery_revocation FROM PUBLIC,athyperapp;
GRANT SELECT ON metadata.publication_recovery_archive,metadata.publication_recovery_revocation TO athyperapp;

CREATE OR REPLACE FUNCTION metadata.fn_import_publication_recovery(
 p_tenant uuid,p_release uuid,p_entity text,p_artifact_hash text,p_backup_hash text,
 p_payload jsonb,p_reason text,p_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,metadata AS $$
DECLARE result uuid; prior metadata.publication_recovery_archive%ROWTYPE; payload_hash text;
BEGIN
 IF NOT pg_has_role(session_user,'athyperadmin','MEMBER') THEN
  RAISE EXCEPTION 'RECOVERY_OPERATOR_REQUIRED' USING ERRCODE='insufficient_privilege';
 END IF;
 IF (p_payload->>'schema'='athyper.publication-recovery/1'
   AND p_payload->>'tenantId'=p_tenant::text AND p_payload->>'releaseId'=p_release::text
   AND p_payload->>'entityCode'=p_entity AND p_payload->>'artifactHash'=p_artifact_hash
   AND p_payload->>'backupHash'=p_backup_hash) IS NOT TRUE THEN RAISE EXCEPTION 'RECOVERY_COORDINATE_MISMATCH'; END IF;
 IF p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '1 hour' THEN RAISE EXCEPTION 'RECOVERY_EXPIRY_INVALID'; END IF;
 payload_hash:=encode(public.digest(p_payload::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('publication-recovery:'||p_tenant||':'||p_release,0));
 SELECT * INTO prior FROM metadata.publication_recovery_archive WHERE tenant_id=p_tenant AND source_release_id=p_release;
 IF FOUND THEN
  IF prior.payload_hash<>payload_hash OR prior.artifact_hash<>p_artifact_hash OR prior.backup_hash<>p_backup_hash OR prior.reason<>p_reason OR prior.expires_at<>p_expires_at THEN RAISE EXCEPTION 'RECOVERY_IMPORT_CONFLICT'; END IF;
  RETURN prior.id;
 END IF;
 INSERT INTO metadata.publication_recovery_archive(tenant_id,source_release_id,entity_code,artifact_hash,backup_hash,payload_hash,payload,reason,expires_at)
 VALUES(p_tenant,p_release,p_entity,p_artifact_hash,p_backup_hash,payload_hash,p_payload,p_reason,p_expires_at) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION metadata.fn_revoke_publication_recovery(p_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF NOT pg_has_role(session_user,'athyperadmin','MEMBER') THEN RAISE EXCEPTION 'RECOVERY_OPERATOR_REQUIRED' USING ERRCODE='insufficient_privilege'; END IF;
 INSERT INTO metadata.publication_recovery_revocation(archive_id,reason) VALUES(p_id,p_reason);
END $$;
REVOKE ALL ON FUNCTION metadata.fn_import_publication_recovery(uuid,uuid,text,text,text,jsonb,text,timestamptz),metadata.fn_revoke_publication_recovery(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION metadata.fn_import_publication_recovery(uuid,uuid,text,text,text,jsonb,text,timestamptz),metadata.fn_revoke_publication_recovery(uuid,text) TO athyperadmin;
COMMENT ON TABLE metadata.publication_recovery_archive IS 'Operator-authorized, short-lived exact-artifact replay evidence. Does not modify authoring history, confer user permissions or approve new content. Activation revalidates signatures, runtime compatibility and workload authority.';
