-- Generated from the extracted live Atlas AI contract.
-- Maintained as canonical foundation DDL; use additive migrations for installed databases.
-- Supported verification and maintenance: server/db/scripts/README.md (Atlas AI DDL).

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

-- BEGIN ATLAS F4 LEARNING STUDIO
CREATE TABLE ai.atlas_learning_inbox (
 id uuid DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid NOT NULL,
 origin_plane text NOT NULL CHECK (origin_plane IN ('neon','mesh','studio')),
 candidate_id uuid NOT NULL,
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal)='object' AND pg_column_size(proposal)<=4096),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','rejected','drafted')),
 revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
 submitted_by uuid NOT NULL,
 reviewed_by uuid,
 change_set_id uuid,
 evaluated_hash text,
 evaluation jsonb CHECK (pg_column_size(evaluation)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 UNIQUE(tenant_id,origin_plane,candidate_id),
 CHECK (state='pending' OR reviewed_by IS NOT NULL),
 CHECK (reviewed_by IS NULL OR reviewed_by<>submitted_by),
 CHECK (state<>'drafted' OR (change_set_id IS NOT NULL AND evaluated_hash IS NOT NULL AND evaluation IS NOT NULL))
);
CREATE TABLE ai.atlas_learning_candidate_event (
 id uuid DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid NOT NULL,
 inbox_id uuid NOT NULL REFERENCES ai.atlas_learning_inbox(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 decision text NOT NULL CHECK (decision IN ('received','rejected','drafted')),
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 revision integer NOT NULL,
 change_set_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(inbox_id,revision)
);
-- END ATLAS F4 LEARNING STUDIO
