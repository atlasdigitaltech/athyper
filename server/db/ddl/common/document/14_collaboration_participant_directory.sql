-- Limited discovery, never a record-access grant. The service must readmit each
-- recipient against the current parent/capability policy before returning names.
CREATE OR REPLACE FUNCTION document.collaboration_principal_candidates(
 p_query text DEFAULT '', p_principal_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, display_name text, auth_epoch bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT p.id,p.name,p.auth_epoch::bigint
 FROM master.principal p
 JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id
 WHERE p.tenant_id=shared.current_tenant_id_soft() AND p.status='active' AND p.principal_type='user'
   AND m.status='active' AND m.effective_from<=statement_timestamp()
   AND (m.effective_until IS NULL OR m.effective_until>statement_timestamp())
   AND (p_principal_id IS NULL OR p.id=p_principal_id)
   AND p.name ILIKE '%'||left(coalesce(p_query,''),100)||'%'
   AND EXISTS(SELECT 1 FROM master.principal caller
     JOIN authz.plane_membership admission ON admission.tenant_id=caller.tenant_id AND admission.principal_id=caller.id
     WHERE caller.tenant_id=p.tenant_id AND caller.id=master.current_principal_id_soft()
       AND caller.status='active' AND admission.status='active'
       AND admission.effective_from<=statement_timestamp()
       AND (admission.effective_until IS NULL OR admission.effective_until>statement_timestamp()))
 ORDER BY p.name,p.id LIMIT 50
$$;
REVOKE ALL ON FUNCTION document.collaboration_principal_candidates(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION document.collaboration_principal_candidates(text,uuid) TO athyperapp;

-- Mention search exposes only the eligible directory name and username, never contact details.
CREATE OR REPLACE FUNCTION document.collaboration_mention_candidates(
 p_query text DEFAULT ''
) RETURNS TABLE(id uuid, display_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT p.id,p.name,p.code::text
 FROM master.principal p
 JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id
 WHERE p.tenant_id=shared.current_tenant_id_soft() AND p.status='active' AND p.principal_type='user'
   AND m.status='active' AND m.effective_from<=statement_timestamp()
   AND (m.effective_until IS NULL OR m.effective_until>statement_timestamp())
   AND (p.name ILIKE '%'||left(coalesce(p_query,''),100)||'%' OR p.code ILIKE '%'||left(coalesce(p_query,''),100)||'%')
   AND EXISTS(SELECT 1 FROM master.principal caller
     JOIN authz.plane_membership admission ON admission.tenant_id=caller.tenant_id AND admission.principal_id=caller.id
     WHERE caller.tenant_id=p.tenant_id AND caller.id=master.current_principal_id_soft()
       AND caller.status='active' AND admission.status='active'
       AND admission.effective_from<=statement_timestamp()
       AND (admission.effective_until IS NULL OR admission.effective_until>statement_timestamp()))
 ORDER BY p.name,p.id LIMIT 50
$$;
REVOKE ALL ON FUNCTION document.collaboration_mention_candidates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION document.collaboration_mention_candidates(text) TO athyperapp;
