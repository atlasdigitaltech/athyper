-- Preserve unsuccessful evaluation evidence independently of rolled-back authoring drafts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
 IF to_regclass('ai.atlas_learning_inbox') IS NULL THEN RAISE EXCEPTION 'Atlas learning baseline required'; END IF;
END $$;
CREATE TABLE ai.atlas_learning_attempt (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 inbox_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
 revision integer NOT NULL CHECK (revision>=0),
 source_release_id uuid NOT NULL,
 source_descriptor_hash text NOT NULL CHECK (source_descriptor_hash ~ '^[0-9a-f]{64}$'),
 source_contract_hash text NOT NULL CHECK (source_contract_hash ~ '^[0-9a-f]{64}$'),
 resolver_version text NOT NULL CHECK (length(resolver_version) BETWEEN 1 AND 200),
 scoring_version text NOT NULL CHECK (length(scoring_version) BETWEEN 1 AND 200),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE ai.atlas_learning_attempt_result (
 tenant_id uuid NOT NULL,
 attempt_id uuid PRIMARY KEY,
 status text NOT NULL CHECK (status IN ('succeeded','failed')),
 failure_code text CHECK (failure_code IN ('LEARNING_FIXTURE_SET_UNAVAILABLE','LEARNING_FIXTURE_PROVENANCE_INVALID','LEARNING_SOURCE_UNAVAILABLE','LEARNING_TARGET_UNSUPPORTED','LEARNING_EVALUATOR_CHANGED','LEARNING_EVALUATION_FAILED','LEARNING_EVALUATION_RECEIPT_INVALID','LEARNING_CONTROLLED_FIXTURES_REQUIRED','REVIEWER_SEPARATION_REQUIRED','LEARNING_CONFLICT','LEARNING_INVALID_INPUT','LEARNING_ATTEMPT_FAILED')),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object' AND pg_column_size(evidence)<=2048 AND
   evidence - ARRAY['fixtureSetId','fixtureContentHash','evaluatorFixtureHash','evaluatedDescriptorHash','fixtureCount','passedCount','resultHash']::text[] = '{}'::jsonb),
 finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((status='succeeded' AND failure_code IS NULL) OR (status='failed' AND failure_code IS NOT NULL))
);
ALTER TABLE ai.atlas_learning_attempt ADD CONSTRAINT atlas_learning_attempt_coordinate_fk FOREIGN KEY(tenant_id,inbox_id,proposal_hash) REFERENCES ai.atlas_learning_inbox(tenant_id,id,proposal_hash);
ALTER TABLE ai.atlas_learning_attempt_result ADD CONSTRAINT atlas_learning_attempt_result_coordinate_fk FOREIGN KEY(tenant_id,attempt_id) REFERENCES ai.atlas_learning_attempt(tenant_id,id);
CREATE INDEX atlas_learning_attempt_inbox_ix ON ai.atlas_learning_attempt(tenant_id,inbox_id,started_at DESC,id DESC);
CREATE TRIGGER atlas_learning_attempt_immutable BEFORE UPDATE OR DELETE ON ai.atlas_learning_attempt FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER atlas_learning_attempt_result_immutable BEFORE UPDATE OR DELETE ON ai.atlas_learning_attempt_result FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE ai.atlas_learning_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_learning_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY atlas_learning_attempt_tenant ON ai.atlas_learning_attempt USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
ALTER TABLE ai.atlas_learning_attempt_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_learning_attempt_result FORCE ROW LEVEL SECURITY;
CREATE POLICY atlas_learning_attempt_result_tenant ON ai.atlas_learning_attempt_result USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON ai.atlas_learning_attempt,ai.atlas_learning_attempt_result FROM PUBLIC;
GRANT SELECT,INSERT ON ai.atlas_learning_attempt,ai.atlas_learning_attempt_result TO athyperapp;
GRANT ALL ON ai.atlas_learning_attempt,ai.atlas_learning_attempt_result TO athyperadmin;
COMMIT;
