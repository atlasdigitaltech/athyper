-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).

CREATE INDEX atlas_support_session_expiry_idx ON ai.atlas_support_session USING btree (expires_at) WHERE status = 'active'::text;

CREATE INDEX atlas_support_session_origin_idx ON ai.atlas_support_session USING btree (origin_principal_id, status, expires_at);

CREATE INDEX atlas_support_session_target_idx ON ai.atlas_support_session USING btree (target_tenant_id, status, expires_at);

CREATE UNIQUE INDEX atlas_support_session_token_uq ON ai.atlas_support_session USING btree (token_hash);

-- BEGIN ATLAS F4 LEARNING STUDIO
CREATE INDEX atlas_learning_inbox_review_ix ON ai.atlas_learning_inbox(tenant_id,state,created_at,id);
-- END ATLAS F4 LEARNING STUDIO

-- BEGIN ATLAS LEARNING ATTEMPTS
CREATE INDEX atlas_learning_attempt_inbox_ix ON ai.atlas_learning_attempt(tenant_id,inbox_id,started_at DESC,id DESC);
-- END ATLAS LEARNING ATTEMPTS
