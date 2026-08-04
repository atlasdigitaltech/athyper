-- Local cache-version coordinates for the authorization evaluator.
CREATE TABLE runtime_meta.authorization_epoch (
    id          uuid        NOT NULL DEFAULT shared.uuidv7(),
    scope_kind  text        NOT NULL,
    tenant_id   uuid,
    plane_code  text,
    epoch       bigint      NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by  text        NOT NULL DEFAULT session_user,
    CONSTRAINT authorization_epoch_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_epoch_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.authorization_epoch IS
  'Plane-local, monotonic authorization cache versions. Authority remains in authz; delivery work remains in event.';
