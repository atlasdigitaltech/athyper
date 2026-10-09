-- The deployed compilation/activation source adapter uses the runtime read pool.
-- This exact reader rechecks tenant, publisher, current standing authority and
-- immutable release linkage; grant no source-table or writer privileges.
GRANT EXECUTE ON FUNCTION publication.local_publication_execution_context(uuid) TO athyper_runtime;
