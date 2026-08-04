CREATE SCHEMA IF NOT EXISTS event;

COMMENT ON SCHEMA event IS
    'Plane-local transactional outbox, inbox, and event delivery state.';
