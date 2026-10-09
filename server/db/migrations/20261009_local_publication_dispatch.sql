-- Durable authenticated command admission and bounded worker discovery.
BEGIN;
-- Durable developer command identity; queue delivery is retried by the worker.
ALTER TABLE publication.local_publication_request ADD COLUMN command_id uuid;
ALTER TABLE publication.local_publication_request ADD CONSTRAINT local_publication_command_uq UNIQUE(tenant_id,developer_id,command_id);
CREATE FUNCTION publication.read_local_publication_admission(p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.local_publication_request%ROWTYPE;
BEGIN
 SELECT * INTO r FROM publication.local_publication_request WHERE command_id=p_command
 AND tenant_id=shared.current_tenant_id_soft() AND developer_id=master.current_principal_id_soft() FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM publication.fn_local_publication_request_authority(r.request_json,true);
 RETURN r.request_json;
END $$;
CREATE FUNCTION publication.admit_local_publication_command(p_request jsonb,p_command uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE hash text;
BEGIN
 IF p_command IS NULL THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_COMMAND_ID_REQUIRED'; END IF;
 hash:=publication.admit_local_publication_request(p_request);
 UPDATE publication.local_publication_request SET command_id=p_command WHERE request_hash=hash AND (command_id IS NULL OR command_id=p_command);
 IF NOT FOUND THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_COMMAND_CONFLICT'; END IF;
 RETURN hash;
END $$;
CREATE FUNCTION publication.pending_local_publication_requests(p_after text,p_limit integer) RETURNS TABLE(request_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after IS NOT NULL AND p_after !~ '^[a-f0-9]{64}$')
 OR NOT EXISTS(SELECT 1 FROM master.principal WHERE id=master.current_principal_id_soft() AND tenant_id=shared.current_tenant_id_soft() AND status='active' AND principal_type='service_account')
 OR NOT EXISTS(SELECT 1 FROM publication.local_publication_host WHERE singleton AND identity='{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}'::jsonb)
 THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_DISCOVERY_DENIED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.request_hash FROM publication.local_publication_request r
 WHERE r.tenant_id=shared.current_tenant_id_soft() AND r.publisher_id=master.current_principal_id_soft()
 AND (r.execution_status IS NULL OR r.execution_status='in_review')
 AND (r.request_json->>'expiresAt')::timestamptz>clock_timestamp()
 AND (p_after IS NULL OR r.request_hash>p_after)
 ORDER BY r.request_hash LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION publication.read_local_publication_admission(uuid),publication.admit_local_publication_command(jsonb,uuid),publication.pending_local_publication_requests(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_local_publication_admission(uuid),publication.admit_local_publication_command(jsonb,uuid) TO athyper_control_api;
GRANT EXECUTE ON FUNCTION publication.pending_local_publication_requests(text,integer) TO athyper_worker;
ALTER FUNCTION publication.read_local_publication_admission(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.admit_local_publication_command(jsonb,uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.pending_local_publication_requests(text,integer) OWNER TO athyper_definer_product_publication;

COMMIT;
