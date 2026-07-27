-- ============================================================================
-- Atlas conversation authorization helpers.
--
-- RLS policies on the generic conversation envelope cannot safely join back
-- through RLS-protected Atlas rows without recursion. These narrowly scoped
-- helpers run with row_security disabled, return only booleans, and derive the
-- tenant, principal, and Atlas plane from transaction-local session settings.
-- Ownership, PUBLIC revocation, and the athyperapp grant are finalized in
-- security/800_security_hardening.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.fn_is_atlas_conversation(
    p_tenant_id uuid,
    p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, master
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM master.conversation AS c
         WHERE c.tenant_id = p_tenant_id
           AND c.id = p_conversation_id
           AND c.type = 'atlas_agent'
    );
$$;

COMMENT ON FUNCTION master.fn_is_atlas_conversation(uuid, uuid) IS
    'RLS recursion-safe discriminator. Returns no conversation data.';


CREATE OR REPLACE FUNCTION master.fn_atlas_conversation_access(
    p_tenant_id uuid,
    p_conversation_id uuid,
    p_owner_only boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, master
SET row_security = off
AS $$
    SELECT
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_principal_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_atlas_plane', true), '') IS NOT NULL
        AND p_tenant_id =
            nullif(current_setting('app.current_tenant_id', true), '')::uuid
        AND EXISTS (
            SELECT 1
              FROM master.atlas_thread AS t
             WHERE t.tenant_id = p_tenant_id
               AND t.conversation_id = p_conversation_id
               AND t.plane =
                   nullif(current_setting('app.current_atlas_plane', true), '')
               AND (
                    t.owner_principal_id =
                        nullif(current_setting('app.current_principal_id', true), '')::uuid
                    OR (
                        p_owner_only = false
                        AND EXISTS (
                            SELECT 1
                              FROM master.conversation_participant AS cp
                             WHERE cp.tenant_id = t.tenant_id
                               AND cp.conversation_id = t.conversation_id
                               AND cp.principal_id =
                                   nullif(
                                       current_setting('app.current_principal_id', true),
                                       ''
                                   )::uuid
                               AND cp.left_at IS NULL
                        )
                    )
               )
        );
$$;

COMMENT ON FUNCTION master.fn_atlas_conversation_access(uuid, uuid, boolean) IS
    'Principal-private Atlas access predicate. Requires transaction-local '
    'app.current_tenant_id, app.current_principal_id, and app.current_atlas_plane. '
    'Missing, revoked, cross-tenant, or wrong-plane context fails closed.';
