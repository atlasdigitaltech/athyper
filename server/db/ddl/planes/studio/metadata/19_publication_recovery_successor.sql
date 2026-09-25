-- Preserve every permit; only the terminal member of a recovery chain may authorize.
ALTER TABLE metadata.publication_recovery_archive
 DROP CONSTRAINT IF EXISTS publication_recovery_archive_tenant_id_source_release_id_key;
ALTER TABLE metadata.publication_recovery_archive
 ADD COLUMN IF NOT EXISTS supersedes_id uuid UNIQUE REFERENCES metadata.publication_recovery_archive(id);
CREATE UNIQUE INDEX IF NOT EXISTS publication_recovery_one_root
 ON metadata.publication_recovery_archive(tenant_id,source_release_id) WHERE supersedes_id IS NULL;

CREATE OR REPLACE FUNCTION metadata.fn_succeed_publication_recovery(
 p_id uuid,p_prior uuid,p_payload jsonb,p_reason text,p_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,metadata AS $$
DECLARE prior metadata.publication_recovery_archive%ROWTYPE; existing metadata.publication_recovery_archive%ROWTYPE;
BEGIN
 IF NOT pg_has_role(session_user,'athyperadmin','MEMBER') THEN RAISE EXCEPTION 'RECOVERY_OPERATOR_REQUIRED' USING ERRCODE='insufficient_privilege'; END IF;
 SELECT * INTO STRICT prior FROM metadata.publication_recovery_archive WHERE id=p_prior;
 PERFORM pg_advisory_xact_lock(hashtextextended('publication-recovery:'||prior.tenant_id||':'||prior.source_release_id,0));
 -- Only the reviewed live catalog binding may change. Historical evidence stays byte-equivalent JSON.
 IF (p_payload-'currentCatalogHash') IS DISTINCT FROM (prior.payload-'currentCatalogHash')
 OR coalesce(p_payload->>'currentCatalogHash','') !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'RECOVERY_SUCCESSOR_EVIDENCE_CHANGED'; END IF;
 SELECT * INTO existing FROM metadata.publication_recovery_archive WHERE id=p_id;
 IF FOUND THEN
  IF existing.supersedes_id IS DISTINCT FROM p_prior OR existing.payload IS DISTINCT FROM p_payload
   OR existing.reason IS DISTINCT FROM p_reason OR existing.expires_at IS DISTINCT FROM p_expires_at
  THEN RAISE EXCEPTION 'RECOVERY_SUCCESSOR_CONFLICT'; END IF;
  RETURN existing.id;
 END IF;
 IF prior.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM metadata.publication_recovery_revocation WHERE archive_id=p_prior)
 THEN RAISE EXCEPTION 'RECOVERY_PRIOR_STILL_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.publication_recovery_archive WHERE supersedes_id=p_prior)
 THEN RAISE EXCEPTION 'RECOVERY_SUCCESSOR_EXISTS'; END IF;
 IF p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '1 hour' THEN RAISE EXCEPTION 'RECOVERY_EXPIRY_INVALID'; END IF;
 INSERT INTO metadata.publication_recovery_archive(id,tenant_id,source_release_id,entity_code,artifact_hash,backup_hash,payload_hash,payload,reason,expires_at,supersedes_id)
 VALUES(p_id,prior.tenant_id,prior.source_release_id,prior.entity_code,prior.artifact_hash,prior.backup_hash,
 encode(public.digest(p_payload::text,'sha256'),'hex'),p_payload,p_reason,p_expires_at,p_prior);
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION metadata.fn_succeed_publication_recovery(uuid,uuid,jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION metadata.fn_succeed_publication_recovery(uuid,uuid,jsonb,text,timestamptz) TO athyperadmin;

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
 SELECT * INTO prior FROM metadata.publication_recovery_archive WHERE tenant_id=p_tenant AND source_release_id=p_release AND supersedes_id IS NULL;
 IF FOUND THEN
  IF prior.payload_hash<>payload_hash OR prior.artifact_hash<>p_artifact_hash OR prior.backup_hash<>p_backup_hash OR prior.reason<>p_reason OR prior.expires_at<>p_expires_at THEN RAISE EXCEPTION 'RECOVERY_IMPORT_CONFLICT'; END IF;
  RETURN prior.id;
 END IF;
 INSERT INTO metadata.publication_recovery_archive(tenant_id,source_release_id,entity_code,artifact_hash,backup_hash,payload_hash,payload,reason,expires_at)
 VALUES(p_tenant,p_release,p_entity,p_artifact_hash,p_backup_hash,payload_hash,p_payload,p_reason,p_expires_at) RETURNING id INTO result;
 RETURN result;
END $$;
