CREATE VIEW ops.authorization_shadow_qualification_v
WITH (security_barrier=true)
AS
WITH evidence AS (
  SELECT plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,
         count(*)::bigint AS sample_count,
         count(*) FILTER (WHERE comparison_status='mismatch')::bigint AS mismatch_count,
         count(*) FILTER (WHERE comparison_status='candidate_error')::bigint AS candidate_error_count,
         min(observed_at) AS observed_from,max(observed_at) AS observed_through,
         bool_and(comparison_status='match') AS is_clean
    FROM ops.authorization_shadow_comparison
   GROUP BY plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash
), coverage AS (
  SELECT requirement.plane_code,requirement.entity_code,requirement.source_entity_operation_id,
         requirement.source_release_hash,requirement.source_artifact_hash,
         count(*)::integer AS required_cohort_count,
         count(*) FILTER (WHERE covered.cohort_code IS NOT NULL)::integer AS covered_cohort_count
    FROM ops.authorization_qualification_cohort_requirement requirement
    LEFT JOIN (SELECT DISTINCT plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,cohort_code
                 FROM ops.authorization_shadow_comparison WHERE comparison_status='match') covered
      ON covered.plane_code=requirement.plane_code AND covered.entity_code=requirement.entity_code
     AND covered.source_entity_operation_id=requirement.source_entity_operation_id
     AND covered.source_release_hash=requirement.source_release_hash
     AND covered.source_artifact_hash=requirement.source_artifact_hash
     AND covered.cohort_code=requirement.cohort_code
   GROUP BY requirement.plane_code,requirement.entity_code,requirement.source_entity_operation_id,
            requirement.source_release_hash,requirement.source_artifact_hash
)
SELECT evidence.*,COALESCE(coverage.required_cohort_count,0) AS required_cohort_count,
       COALESCE(coverage.covered_cohort_count,0) AS covered_cohort_count,
       (evidence.sample_count >= 1000 AND evidence.mismatch_count=0 AND evidence.candidate_error_count=0
        AND evidence.observed_through-evidence.observed_from >= interval '24 hours'
        AND coverage.required_cohort_count>0
        AND coverage.required_cohort_count=coverage.covered_cohort_count) AS qualifies_default
  FROM evidence LEFT JOIN coverage USING
       (plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash);

COMMENT ON VIEW ops.authorization_shadow_qualification_v IS
  'Exact-coordinate volume, duration, parity, and required-cohort qualification summary. Missing cohort requirements fail closed.';
