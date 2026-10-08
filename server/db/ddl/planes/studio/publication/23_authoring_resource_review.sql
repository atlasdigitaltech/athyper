-- Narrow control-host command surface. Authenticated IAM authorization and
-- transactional audit remain the canonical host's responsibility.
CREATE FUNCTION publication.read_authoring_resource(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.release;
BEGIN
 SELECT * INTO r FROM publication.release WHERE id=p_id AND tenant_id=shared.current_tenant_id_soft()
 AND metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review') FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN to_jsonb(r);
END $$;
CREATE FUNCTION publication.propose_authoring_resource(p_source jsonb,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=master.current_principal_id_soft(); tenant uuid:=shared.current_tenant_id_soft(); r publication.release;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE id=actor AND tenant_id=tenant AND principal_type='user' AND status='active') THEN RAISE EXCEPTION 'RESOURCE_HUMAN_ACTOR_REQUIRED'; END IF;
 IF p_source->>'kind' NOT IN ('entity_authoring_descriptor','entity_identity_review') OR p_source->>'kind' IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_hash IS NULL OR octet_length(p_source::text)>4194304 THEN RAISE EXCEPTION 'RESOURCE_SOURCE_INVALID'; END IF;
 IF p_source->>'kind'='entity_identity_review' AND (p_source#>>'{payload,proposerId}' IS DISTINCT FROM actor::text OR p_source#>>'{payload,reviewerId}'=actor::text) THEN RAISE EXCEPTION 'RESOURCE_AUTHOR_MISMATCH'; END IF;
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES((p_source->>'releaseId')::uuid,tenant,p_source->>'publicationKey',(p_source->>'releaseNo')::bigint,'publish','preparing','breaking',p_hash,p_hash,actor,jsonb_build_object('artifactKind',p_source->>'kind','authoringResourceSource',p_source)) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT r FROM publication.release WHERE id=(p_source->>'releaseId')::uuid FOR SHARE;
 IF r.tenant_id<>tenant OR r.created_by<>actor OR r.release_hash<>p_hash OR r.metadata IS DISTINCT FROM jsonb_build_object('artifactKind',p_source->>'kind','authoringResourceSource',p_source) THEN RAISE EXCEPTION 'RESOURCE_PROPOSAL_CONFLICT'; END IF;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION publication.approve_authoring_resource(p_id uuid,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=master.current_principal_id_soft(); tenant uuid:=shared.current_tenant_id_soft(); r publication.release;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE id=actor AND tenant_id=tenant AND principal_type='user' AND status='active') THEN RAISE EXCEPTION 'RESOURCE_HUMAN_ACTOR_REQUIRED'; END IF;
 SELECT * INTO r FROM publication.release WHERE id=p_id AND tenant_id=tenant AND metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review') FOR UPDATE;
 IF NOT FOUND OR r.release_hash IS DISTINCT FROM p_hash OR r.created_by=actor OR r.status NOT IN ('preparing','approved') OR (r.approved_by IS NOT NULL AND r.approved_by<>actor) THEN RAISE EXCEPTION 'RESOURCE_REVIEW_CONFLICT'; END IF;
 IF r.metadata->>'artifactKind'='entity_identity_review' AND r.metadata#>>'{authoringResourceSource,payload,reviewerId}' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'RESOURCE_NAMED_REVIEW_REQUIRED'; END IF;
 SELECT * INTO r FROM publication.fn_transition_release(p_id,'approved',actor,NULL,jsonb_build_object('sourceHash',p_hash));
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource(uuid),publication.propose_authoring_resource(jsonb,text),publication.approve_authoring_resource(uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA publication TO athyper_control_api;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource(uuid),publication.propose_authoring_resource(jsonb,text),publication.approve_authoring_resource(uuid,text) TO athyper_control_api;
CREATE FUNCTION publication.guard_authoring_resource_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESOURCE_SOURCE_IMMUTABLE'; END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.release_key,NEW.release_no,NEW.release_kind,NEW.compatibility_level,NEW.release_hash,NEW.manifest_hash,NEW.created_by,NEW.metadata) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.release_key,OLD.release_no,OLD.release_kind,OLD.compatibility_level,OLD.release_hash,OLD.manifest_hash,OLD.created_by,OLD.metadata) OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'RESOURCE_SOURCE_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER authoring_resource_source_immutable BEFORE UPDATE OR DELETE ON publication.release FOR EACH ROW EXECUTE FUNCTION publication.guard_authoring_resource_source();
REVOKE ALL ON FUNCTION publication.guard_authoring_resource_source() FROM PUBLIC;
-- Audit-backed authenticated provenance, distinct from current IAM eligibility.
CREATE FUNCTION publication.read_authoring_resource_review(p_id uuid)
RETURNS TABLE(author_id uuid,reviewer_id uuid,source_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT r.created_by,r.approved_by,r.release_hash FROM publication.release r
 WHERE r.id=p_id AND r.tenant_id=shared.current_tenant_id_soft() AND r.status IN ('approved','published') AND r.approved_by<>r.created_by
 AND r.metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review')
 AND EXISTS(SELECT 1 FROM audit.audit_log a WHERE a.tenant_id=r.tenant_id AND a.plane_code='studio' AND a.event_code='metadata.entity.product.review' AND a.entity_type='publication.release' AND a.entity_id=r.id AND a.actor_type='user' AND a.actor_principal_id=r.created_by AND a.outcome='success' AND a.context->>'resourceAction'='propose' AND a.context->>'sourceHash'=r.release_hash)
 AND EXISTS(SELECT 1 FROM audit.audit_log a WHERE a.tenant_id=r.tenant_id AND a.plane_code='studio' AND a.event_code='metadata.entity.product.review' AND a.entity_type='publication.release' AND a.entity_id=r.id AND a.actor_type='user' AND a.actor_principal_id=r.approved_by AND a.outcome='success' AND a.context->>'resourceAction'='approve' AND a.context->>'sourceHash'=r.release_hash);
$$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_review(uuid) TO athyper_control_api;
