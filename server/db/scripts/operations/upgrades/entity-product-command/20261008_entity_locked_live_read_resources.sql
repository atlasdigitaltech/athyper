BEGIN;
SET LOCAL lock_timeout='5s';
CREATE ROLE athyper_definer_live_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA runtime_meta,shared TO athyper_definer_live_read;
GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_definer_live_read;
GRANT SELECT,UPDATE ON runtime_meta.applied_release TO athyper_definer_live_read;
GRANT SELECT,UPDATE ON runtime_meta.release_activation_head TO athyper_definer_live_read;
GRANT SELECT,UPDATE ON runtime_meta.applied_release_payload TO athyper_definer_live_read;
CREATE POLICY athyper_definer_live_read_p_0 ON runtime_meta.applied_release FOR SELECT TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text));
CREATE POLICY athyper_definer_live_read_p_1 ON runtime_meta.applied_release FOR UPDATE TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text)) WITH CHECK (false);
CREATE POLICY athyper_definer_live_read_p_2 ON runtime_meta.release_activation_head FOR SELECT TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text));
CREATE POLICY athyper_definer_live_read_p_3 ON runtime_meta.release_activation_head FOR UPDATE TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text)) WITH CHECK (false);
CREATE POLICY athyper_definer_live_read_p_4 ON runtime_meta.applied_release_payload FOR SELECT TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text) AND tenant_id=shared.current_tenant_id_soft() AND artifact_kind IN ('entity_security_manifest','entity_storage_authority'));
CREATE POLICY athyper_definer_live_read_p_5 ON runtime_meta.applied_release_payload FOR UPDATE TO athyper_definer_live_read USING (pg_has_role(SESSION_USER, 'athyper_runtime'::name, 'MEMBER'::text) AND tenant_id=shared.current_tenant_id_soft() AND artifact_kind IN ('entity_security_manifest','entity_storage_authority')) WITH CHECK (false);
-- Bounded runtime evidence reader. Row locks stay in the caller transaction.
-- EXECUTE conveys no publication, activation or graph-write authority.
CREATE FUNCTION runtime_meta.fn_locked_live_read_resources(
 p_keys text[],p_tenant uuid,p_plane text,p_maximum_bytes integer)
RETURNS TABLE(publication_key text,source_release_id uuid,source_release_no bigint,
 artifact_hash text,row_version bigint,payload_hash text,payload_json jsonb,signed_document jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_keys IS NULL OR cardinality(p_keys)<1 OR cardinality(p_keys)>64
 OR cardinality(p_keys)<>(SELECT count(DISTINCT k) FROM unnest(p_keys) k)
 OR EXISTS(SELECT 1 FROM unnest(p_keys) k WHERE k IS NULL OR k !~ '^[a-z][a-z0-9_.:-]{1,190}$')
 OR p_tenant IS NULL OR p_tenant IS DISTINCT FROM shared.current_tenant_id_soft()
 OR NULLIF(current_setting('app.current_principal_id',true),'') IS NULL
 OR p_plane IS NULL OR p_plane NOT IN ('studio','neon','mesh')
 OR p_plane IS DISTINCT FROM current_setting('app.database_plane',true)
 OR p_maximum_bytes IS NULL OR p_maximum_bytes<1 OR p_maximum_bytes>4194304
 THEN RAISE EXCEPTION 'LIVE_READ_RESOURCE_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT h.publication_key::text,r.source_release_id,r.source_release_no::bigint,
 r.artifact_hash::text,h.row_version::bigint,p.payload_hash::text,p.payload_json,p.coordinates->'signed_document'
 FROM runtime_meta.release_activation_head h
 JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id
 AND r.publication_key=h.publication_key AND r.source_release_no=h.source_release_no AND r.artifact_hash=h.artifact_hash
 JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=r.id
 WHERE h.publication_key=ANY(p_keys) AND r.status='active' AND p.tenant_id=p_tenant
 AND p.artifact_kind IN ('entity_security_manifest','entity_storage_authority')
 AND p.coordinates->>'plane_code'=p_plane
 AND octet_length(p.payload_json::text)+octet_length(p.coordinates::text)<=p_maximum_bytes
 ORDER BY h.publication_key FOR SHARE OF h,r,p;
END $$;
REVOKE ALL ON FUNCTION runtime_meta.fn_locked_live_read_resources(text[],uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runtime_meta.fn_locked_live_read_resources(text[],uuid,text,integer) TO athyper_runtime;
ALTER FUNCTION runtime_meta.fn_locked_live_read_resources(text[], uuid, text, integer) OWNER TO athyper_definer_live_read;
COMMIT;
