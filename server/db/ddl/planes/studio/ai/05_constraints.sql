-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_binding_hash_chk" CHECK (session_binding_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_end_chk" CHECK (status = 'active'::text AND ended_at IS NULL OR status <> 'active'::text AND ended_at IS NOT NULL);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_plane_chk" CHECK (plane = 'studio'::text);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_scope_chk" CHECK (cardinality(allowed_scopes) >= 1 AND cardinality(allowed_scopes) <= 4 AND allowed_scopes <@ ARRAY['permission_denial.explain'::text, 'principal.find_current_scope'::text, 'policy_trace.explain'::text, 'tenant_health.summarize'::text]);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'ended'::text]));

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_time_chk" CHECK (expires_at > issued_at);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_token_hash_chk" CHECK (token_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_origin_fk" FOREIGN KEY (origin_tenant_id, origin_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_shadow_membership_fk"
  FOREIGN KEY (target_tenant_id, shadow_principal_id, shadow_membership_id)
  REFERENCES authz.plane_membership(tenant_id, principal_id, id)
  ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_support_session"
  ADD CONSTRAINT "atlas_support_session_shadow_fk" FOREIGN KEY (target_tenant_id, shadow_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
