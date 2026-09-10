BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- The underlying cache contains every tenant. Only this filtered projection is
-- available to application roles; materialized views do not enforce table RLS.
CREATE OR REPLACE VIEW master.v_company_postable_account
WITH (security_barrier = true) AS
SELECT * FROM master.mv_company_postable_account
WHERE tenant_id = shared.current_tenant_id_soft();

-- PUBLIC must always be revoked, even before application roles are provisioned.
REVOKE ALL ON master.mv_company_postable_account FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   REVOKE ALL ON master.mv_company_postable_account FROM athyperapp;
   GRANT SELECT ON master.v_company_postable_account TO athyperapp;
 END IF;
END $$;
COMMIT;
