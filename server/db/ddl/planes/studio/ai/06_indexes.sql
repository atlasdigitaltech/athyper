-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

CREATE INDEX atlas_support_session_expiry_idx ON ai.atlas_support_session USING btree (expires_at) WHERE status = 'active'::text;

CREATE INDEX atlas_support_session_origin_idx ON ai.atlas_support_session USING btree (origin_principal_id, status, expires_at);

CREATE INDEX atlas_support_session_target_idx ON ai.atlas_support_session USING btree (target_tenant_id, status, expires_at);

CREATE UNIQUE INDEX atlas_support_session_token_uq ON ai.atlas_support_session USING btree (token_hash);
