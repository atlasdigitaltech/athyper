ALTER TABLE ops.authorization_shadow_comparison
  ADD COLUMN IF NOT EXISTS cohort_code text NOT NULL DEFAULT 'legacy_baseline';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='authorization_shadow_comparison_cohort_chk') THEN
    ALTER TABLE ops.authorization_shadow_comparison ADD CONSTRAINT authorization_shadow_comparison_cohort_chk
      CHECK (cohort_code ~ '^[a-z][a-z0-9_]{1,62}$');
  END IF;
END $$;

ALTER TABLE ops.authorization_parity_certification
  ADD COLUMN IF NOT EXISTS required_cohort_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS covered_cohort_count integer NOT NULL DEFAULT 0;
ALTER TABLE ops.authorization_parity_certification
  DROP CONSTRAINT IF EXISTS authorization_parity_certification_counts_chk,
  DROP CONSTRAINT IF EXISTS authorization_parity_certification_truth_chk;
ALTER TABLE ops.authorization_parity_certification
  ADD CONSTRAINT authorization_parity_certification_counts_chk CHECK (
    sample_count>=0 AND mismatch_count>=0 AND candidate_error_count>=0
    AND mismatch_count+candidate_error_count<=sample_count
    AND required_cohort_count>=0 AND covered_cohort_count>=0
    AND covered_cohort_count<=required_cohort_count),
  ADD CONSTRAINT authorization_parity_certification_truth_chk CHECK (
    (status='qualified' AND sample_count>=1000 AND mismatch_count=0 AND candidate_error_count=0
     AND required_cohort_count>0 AND covered_cohort_count=required_cohort_count
     AND observed_through-observed_from>=interval '24 hours') OR status='rejected');

CREATE TABLE IF NOT EXISTS ops.authorization_qualification_cohort_requirement (
  plane_code text NOT NULL,entity_code text NOT NULL,source_entity_operation_id uuid NOT NULL,
  source_release_hash text NOT NULL,source_artifact_hash text NOT NULL,cohort_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
  CONSTRAINT authorization_qualification_cohort_requirement_pkey PRIMARY KEY
    (plane_code,source_entity_operation_id,source_release_hash,source_artifact_hash,cohort_code),
  CONSTRAINT authorization_qualification_cohort_requirement_plane_chk CHECK (plane_code IN ('neon','mesh')),
  CONSTRAINT authorization_qualification_cohort_requirement_cohort_chk CHECK (cohort_code ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT authorization_qualification_cohort_requirement_hash_chk CHECK (
    source_release_hash ~ '^[a-f0-9]{64}$' AND source_artifact_hash ~ '^[a-f0-9]{64}$')
);
ALTER TABLE ops.authorization_qualification_cohort_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_qualification_cohort_requirement FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ops' AND tablename='authorization_qualification_cohort_requirement' AND policyname='authorization_cohort_requirement_admin') THEN
    CREATE POLICY authorization_cohort_requirement_admin ON ops.authorization_qualification_cohort_requirement
      FOR ALL TO athyperadmin USING (plane_code=current_setting('app.database_plane',true))
      WITH CHECK (plane_code=current_setting('app.database_plane',true));
    GRANT SELECT,INSERT,DELETE ON ops.authorization_qualification_cohort_requirement TO athyperadmin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ops' AND tablename='authorization_qualification_cohort_requirement' AND policyname='authorization_cohort_requirement_runtime_read') THEN
    CREATE POLICY authorization_cohort_requirement_runtime_read ON ops.authorization_qualification_cohort_requirement
      FOR SELECT TO athyperapp USING (plane_code=current_setting('app.database_plane',true));
    GRANT SELECT ON ops.authorization_qualification_cohort_requirement TO athyperapp;
  END IF;
END $$;

DROP VIEW ops.authorization_shadow_qualification_v;
