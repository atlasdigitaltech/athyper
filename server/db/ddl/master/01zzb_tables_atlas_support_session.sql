-- Durable, server-owned Atlas Admin support sessions.
-- Contains identifiers and hashes only; prompts and customer values are forbidden.
CREATE TABLE IF NOT EXISTS master.atlas_support_session (
    id                      uuid PRIMARY KEY,
    token_hash              text NOT NULL,
    origin_tenant_id        uuid NOT NULL,
    origin_principal_id     uuid NOT NULL,
    origin_subject          text NOT NULL,
    origin_auth_epoch       integer NOT NULL,
    target_tenant_id        uuid NOT NULL,
    shadow_principal_id     uuid NOT NULL,
    shadow_auth_epoch       integer NOT NULL,
    shadow_relationship_id  uuid NOT NULL,
    plane                   text NOT NULL DEFAULT 'admin',
    allowed_scopes          text[] NOT NULL,
    ticket_id               text NOT NULL,
    reason                  text NOT NULL,
    thread_id               uuid NOT NULL,
    session_binding_hash    text NOT NULL,
    issued_at               timestamptz NOT NULL,
    expires_at              timestamptz NOT NULL,
    ended_at                timestamptz,
    status                  text NOT NULL DEFAULT 'active',
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atlas_support_session_token_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT atlas_support_session_binding_hash_chk CHECK (session_binding_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT atlas_support_session_plane_chk CHECK (plane = 'admin'),
    CONSTRAINT atlas_support_session_status_chk CHECK (status IN ('active','revoked','expired','ended')),
    CONSTRAINT atlas_support_session_time_chk CHECK (expires_at > issued_at),
    CONSTRAINT atlas_support_session_end_chk CHECK ((status = 'active' AND ended_at IS NULL) OR (status <> 'active' AND ended_at IS NOT NULL)),
    CONSTRAINT atlas_support_session_scope_chk CHECK (
      cardinality(allowed_scopes) BETWEEN 1 AND 4
      AND allowed_scopes <@ ARRAY[
        'permission_denial.explain','principal.find_current_scope',
        'policy_trace.explain','tenant_health.summarize'
      ]::text[]
    ),
    CONSTRAINT atlas_support_session_origin_fk FOREIGN KEY (origin_tenant_id, origin_principal_id)
      REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT atlas_support_session_shadow_fk FOREIGN KEY (target_tenant_id, shadow_principal_id)
      REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT atlas_support_session_relationship_fk FOREIGN KEY (shadow_relationship_id)
      REFERENCES master.principal_relationship (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS master.atlas_support_session_audit (
    id                  uuid PRIMARY KEY DEFAULT shared.uuidv7(),
    session_id          uuid NOT NULL REFERENCES master.atlas_support_session(id) ON DELETE RESTRICT,
    event               text NOT NULL,
    occurred_at         timestamptz NOT NULL,
    origin_principal_id uuid NOT NULL,
    target_tenant_id    uuid NOT NULL,
    shadow_principal_id uuid NOT NULL,
    scope               text,
    resource_hash       text,
    safe_reason_code    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atlas_support_audit_event_chk CHECK (event IN ('access_started','data_read','exported','access_ended','access_denied')),
    CONSTRAINT atlas_support_audit_hash_chk CHECK (resource_hash IS NULL OR resource_hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE master.atlas_support_session IS
  'Server-only, short-lived Atlas Admin support sessions. No prompt, response, or customer record content.';
COMMENT ON TABLE master.atlas_support_session_audit IS
  'Append-only support access audit containing identifiers, scope and optional resource hash only.';
