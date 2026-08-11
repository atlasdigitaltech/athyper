-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

CREATE TABLE "ai"."atlas_support_session" (
  "id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "origin_tenant_id" uuid NOT NULL,
  "origin_principal_id" uuid NOT NULL,
  "origin_subject" text NOT NULL,
  "origin_auth_epoch" integer NOT NULL,
  "target_tenant_id" uuid NOT NULL,
  "shadow_principal_id" uuid NOT NULL,
  "shadow_auth_epoch" integer NOT NULL,
  "shadow_membership_id" uuid NOT NULL,
  "plane" text DEFAULT 'studio'::text NOT NULL,
  "allowed_scopes" text[] NOT NULL,
  "ticket_id" text NOT NULL,
  "reason" text NOT NULL,
  "thread_id" uuid NOT NULL,
  "session_binding_hash" text NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "ai"."atlas_support_session" IS 'Server-only, short-lived Atlas Admin support sessions. No prompt, response, or customer record content.';
