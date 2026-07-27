CREATE UNIQUE INDEX IF NOT EXISTS atlas_support_session_token_uq
  ON master.atlas_support_session(token_hash);
CREATE INDEX IF NOT EXISTS atlas_support_session_origin_idx
  ON master.atlas_support_session(origin_principal_id, status, expires_at);
CREATE INDEX IF NOT EXISTS atlas_support_session_target_idx
  ON master.atlas_support_session(target_tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS atlas_support_session_expiry_idx
  ON master.atlas_support_session(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS atlas_support_audit_session_idx
  ON master.atlas_support_session_audit(session_id, occurred_at);
