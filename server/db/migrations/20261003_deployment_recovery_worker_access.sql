-- The apply worker must revalidate the independently enrolled recovery policy.
-- Only the bounded read function is exposed; actor, tenant, review and hash checks remain.
BEGIN;
GRANT EXECUTE ON FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) TO athyper_worker;
COMMIT;
