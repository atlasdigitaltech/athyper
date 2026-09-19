BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE ai.atlas_learning_candidate (
 id uuid DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid NOT NULL,
 feedback_id uuid NOT NULL,
 origin_plane text NOT NULL CHECK (origin_plane IN ('neon','mesh','studio')),
 submitted_by uuid NOT NULL,
 proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal)='object' AND pg_column_size(proposal)<=4096),
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK (expires_at>created_at),
 handed_off_at timestamptz
);
COMMENT ON TABLE ai.atlas_learning_candidate IS 'ARCHETYPE=B;SCOPE=T. Immutable response-bound vocabulary proposals; not a runtime index.';
ALTER TABLE ai.ai_feedback_log ADD CONSTRAINT atlas_learning_feedback_coordinate_uq UNIQUE(tenant_id,id,submitted_by);
ALTER TABLE ai.atlas_learning_candidate ADD CONSTRAINT atlas_learning_feedback_fk FOREIGN KEY(tenant_id,feedback_id,submitted_by) REFERENCES ai.ai_feedback_log(tenant_id,id,submitted_by) ON DELETE CASCADE;
ALTER TABLE ai.atlas_learning_candidate ADD CONSTRAINT atlas_learning_source_payload_chk CHECK ((proposal->>'candidateId'=id::text AND proposal->>'feedbackId'=feedback_id::text AND proposal->>'tenantId'=tenant_id::text AND proposal->>'submittedBy'=submitted_by::text AND proposal->>'originPlane'=origin_plane) IS TRUE);
CREATE INDEX atlas_learning_candidate_retention_ix ON ai.atlas_learning_candidate(tenant_id,expires_at);
ALTER TABLE ai.atlas_learning_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_learning_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY atlas_learning_candidate_actor ON ai.atlas_learning_candidate
 USING (tenant_id=shared.current_tenant_id() AND submitted_by=NULLIF(current_setting('app.current_principal_id',true),'')::uuid)
 WITH CHECK (tenant_id=shared.current_tenant_id() AND submitted_by=NULLIF(current_setting('app.current_principal_id',true),'')::uuid);
REVOKE ALL ON ai.atlas_learning_candidate FROM PUBLIC;
GRANT SELECT,INSERT ON ai.atlas_learning_candidate TO athyperapp;
GRANT UPDATE(handed_off_at) ON ai.atlas_learning_candidate TO athyperapp;
GRANT ALL ON ai.atlas_learning_candidate TO athyperadmin;
COMMIT;
