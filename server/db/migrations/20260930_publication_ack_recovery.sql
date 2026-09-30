-- Recover an activated target whose acknowledgement was interrupted.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
END $$;
-- Cross-tenant discovery exposes coordinates only. Application and failure
-- transitions still run under the selected tenant's RLS context.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_publication_recovery') THEN
    CREATE ROLE athyper_publication_recovery NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA publication TO athyper_publication_recovery;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_publication_recovery_owner') THEN
    CREATE ROLE athyper_publication_recovery_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA publication, shared TO athyper_publication_recovery_owner;
GRANT SELECT (id, tenant_id) ON publication.release TO athyper_publication_recovery_owner;
GRANT SELECT (id, publication_release_id) ON publication.artifact TO athyper_publication_recovery_owner;
GRANT SELECT (id, artifact_id, target_plane, status, created_at) ON publication.deployment TO athyper_publication_recovery_owner;
GRANT SELECT (deployment_id) ON publication.deployment_acknowledgement TO athyper_publication_recovery_owner;
DROP POLICY IF EXISTS recovery_discovery ON publication.release;
CREATE POLICY recovery_discovery ON publication.release FOR SELECT
  TO athyper_publication_recovery_owner USING (true);
-- Provision a separate recovery login and grant it this role out of band.
-- The general publication service must not inherit cross-tenant discovery.
REVOKE athyper_publication_recovery FROM athyper_publication_service;
CREATE OR REPLACE FUNCTION publication.fn_recoverable_deployment_coordinates(
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_limit integer
)
RETURNS TABLE(tenant_id uuid, deployment_id uuid, target_plane text,
              created_at timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT r.tenant_id, d.id, d.target_plane, d.created_at
  FROM publication.deployment d
  JOIN publication.artifact a ON a.id = d.artifact_id
  JOIN publication.release r ON r.id = a.publication_release_id
  WHERE (d.status IN ('pending','dispatched','received','staged','verified')
    OR (d.status='activated' AND NOT EXISTS (
      SELECT 1 FROM publication.deployment_acknowledgement ack WHERE ack.deployment_id=d.id)))
    AND d.created_at < clock_timestamp() - interval '2 minutes'
    AND (p_after_created_at IS NULL OR
         (d.created_at, d.id) > (p_after_created_at,
           COALESCE(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  ORDER BY d.created_at, d.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 200);
$$;
ALTER FUNCTION publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer)
  OWNER TO athyper_publication_recovery_owner;
REVOKE ALL ON FUNCTION publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer) TO athyper_publication_recovery;

COMMIT;
