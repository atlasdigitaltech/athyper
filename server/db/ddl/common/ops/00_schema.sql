CREATE SCHEMA IF NOT EXISTS ops;

COMMENT ON SCHEMA ops IS
    'Plane-local jobs, attempts, checkpoints, and dead-letter state.';
