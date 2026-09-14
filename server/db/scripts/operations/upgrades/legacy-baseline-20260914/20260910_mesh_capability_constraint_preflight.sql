-- Prepare the constraint name expected by the unchanged historical repair.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF current_database()<>'athyper_mesh' THEN RAISE EXCEPTION 'This migration requires athyper_mesh'; END IF; END $$;
ALTER TABLE mesh.network_relationship_capability DROP CONSTRAINT IF EXISTS network_relationship_capability_approval_chk,
 ADD CONSTRAINT network_relationship_capability_approval_chk CHECK (
        (status = 'requested' AND approved_by_tenant_id IS NULL)
        OR (status = 'rejected' AND approved_by_tenant_id IS NOT NULL)
        OR (status IN ('active', 'suspended') AND approved_by_tenant_id IS NOT NULL AND approved_by_tenant_id <> requested_by_tenant_id)
        OR (status = 'ended' AND (approved_by_tenant_id IS NULL OR approved_by_tenant_id <> requested_by_tenant_id))
    );
COMMIT;
