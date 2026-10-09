BEGIN;
-- Bounded identity status for standing enrollment; no identity rows are exposed.
-- Existing IAM authorizes enrollment separately. Runtime SQL admission rechecks
-- these actors and locks the exact authority; no policy or principal is mutated.
CREATE FUNCTION publication.local_publication_identity_status(p_developers uuid[],p_author uuid,p_publisher uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(cardinality(p_developers) BETWEEN 1 AND 256
 AND cardinality(p_developers)=(SELECT count(DISTINCT v) FROM unnest(p_developers) v)
 AND p_author<>p_publisher AND NOT p_author=ANY(p_developers) AND NOT p_publisher=ANY(p_developers)
 AND EXISTS(SELECT 1 FROM master.principal WHERE id=master.current_principal_id_soft()
   AND tenant_id=shared.current_tenant_id_soft() AND status='active')
 AND (SELECT count(*) FROM master.principal WHERE tenant_id=shared.current_tenant_id_soft()
   AND id=ANY(p_developers) AND principal_type='user' AND status='active')=cardinality(p_developers)
 AND (SELECT count(*) FROM master.principal WHERE tenant_id=shared.current_tenant_id_soft()
   AND id IN(p_author,p_publisher) AND principal_type='service_account' AND status='active'
   AND provisioning_source='internal')=2,false);
$$;
ALTER FUNCTION publication.local_publication_identity_status(uuid[],uuid,uuid) OWNER TO athyper_definer_product_publication;
REVOKE ALL ON FUNCTION publication.local_publication_identity_status(uuid[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.local_publication_identity_status(uuid[],uuid,uuid) TO athyper_control_api,athyper_worker;

COMMIT;
