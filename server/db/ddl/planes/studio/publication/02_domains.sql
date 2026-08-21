CREATE DOMAIN publication.release_kind_d AS text
    CHECK (VALUE IN ('publish', 'rollback'));

CREATE DOMAIN publication.release_status_d AS text
    CHECK (VALUE IN ('preparing', 'approved', 'published', 'withdrawn'));

CREATE DOMAIN publication.compatibility_level_d AS text
    CHECK (VALUE IN ('breaking', 'backward_compatible', 'forward_compatible', 'fully_compatible'));

CREATE DOMAIN publication.artifact_status_d AS text
    CHECK (VALUE IN ('compiled', 'validated', 'signed', 'withdrawn'));

CREATE DOMAIN publication.deployment_status_d AS text
    CHECK (VALUE IN (
        'pending', 'dispatched', 'received', 'staged', 'verified',
        'activated', 'failed', 'rolled_back'
    ));

CREATE DOMAIN publication.signature_status_d AS text
    CHECK (VALUE IN ('unsigned', 'signed', 'verified', 'invalid'));

COMMENT ON DOMAIN publication.release_kind_d IS
  'A rollback is a new signed release and never mutates previously published evidence.';
COMMENT ON DOMAIN publication.deployment_status_d IS
  'Per-target delivery state; application runtimes continue from their last verified active release.';
COMMENT ON DOMAIN publication.signature_status_d IS
  'Cryptographic evidence state. Invalid signatures must fail closed.';
