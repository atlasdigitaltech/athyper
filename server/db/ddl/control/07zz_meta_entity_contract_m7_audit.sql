-- ============================================================================
-- Meta Entity Contract M7: unified migration, drift and rollout audit surface.
-- Read-only by design. Runtime counters are reported only as a count and are
-- never copied into Contract migration artifacts.
-- ============================================================================

CREATE OR REPLACE VIEW control.v_meta_entity_contract_audit AS
WITH base AS (
  SELECT
    entity.id AS entity_id,
    entity.entity_code,
    entity.tenant_id,
    state.published_version_id,
    state.current_draft_version_id,
    published.status AS published_status,
    draft.status AS draft_status,
    published.contract_schema_version,
    published.contract_hash,
    state.contract_hash AS publish_contract_hash,
    published.projection_hash,
    state.materialized_hash,
    state.admin_compiled_hash,
    state.neon_compiled_hash,
    state.mesh_compiled_hash,
    state.readiness_status,
    state.readiness_diagnostics,
    published.contract_document,
    COALESCE(jsonb_array_length(
      CASE WHEN jsonb_typeof(published.contract_document->'relations')='array'
        THEN published.contract_document->'relations' ELSE '[]'::jsonb END
    ), 0) AS expected_relations,
    COALESCE(jsonb_array_length(
      CASE WHEN jsonb_typeof(published.contract_document->'operations')='array'
        THEN published.contract_document->'operations' ELSE '[]'::jsonb END
    ), 0) AS expected_operations,
    COALESCE(jsonb_array_length(
      CASE WHEN jsonb_typeof(published.contract_document#>'{numbering,configurations}')='array'
        THEN published.contract_document#>'{numbering,configurations}' ELSE '[]'::jsonb END
    ), 0) AS expected_numbering,
    COALESCE(jsonb_array_length(
      CASE WHEN jsonb_typeof(published.contract_document->'flows')='array'
        THEN published.contract_document->'flows' ELSE '[]'::jsonb END
    ), 0) AS expected_flows,
    (SELECT count(*)
       FROM jsonb_array_elements(CASE
         WHEN jsonb_typeof(published.contract_document->'operations')='array'
           THEN published.contract_document->'operations' ELSE '[]'::jsonb END
       ) operation
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(operation->'action_rules')='array'
           THEN operation->'action_rules' ELSE '[]'::jsonb END
       ) action_rule) AS expected_action_rules,
    (SELECT count(*)
       FROM jsonb_array_elements(CASE
         WHEN jsonb_typeof(published.contract_document#>'{lifecycle,states}')='array'
           THEN published.contract_document#>'{lifecycle,states}' ELSE '[]'::jsonb END
       ) lifecycle_state
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(lifecycle_state->'masks')='array'
           THEN lifecycle_state->'masks' ELSE '[]'::jsonb END
       ) lifecycle_mask) AS expected_lifecycle_masks,
    (SELECT count(*)
       FROM jsonb_array_elements(CASE
         WHEN jsonb_typeof(published.contract_document->'flows')='array'
           THEN published.contract_document->'flows' ELSE '[]'::jsonb END
       ) flow
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(flow->'steps')='array'
           THEN flow->'steps' ELSE '[]'::jsonb END
       ) step) AS expected_flow_steps,
    (SELECT count(*)
       FROM jsonb_array_elements(CASE
         WHEN jsonb_typeof(published.contract_document->'flows')='array'
           THEN published.contract_document->'flows' ELSE '[]'::jsonb END
       ) flow
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(flow->'steps')='array'
           THEN flow->'steps' ELSE '[]'::jsonb END
       ) step
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(step->'sections')='array'
           THEN step->'sections' ELSE '[]'::jsonb END
       ) section) AS expected_flow_sections,
    (SELECT count(*)
       FROM jsonb_array_elements(CASE
         WHEN jsonb_typeof(published.contract_document->'flows')='array'
           THEN published.contract_document->'flows' ELSE '[]'::jsonb END
       ) flow
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(flow->'steps')='array'
           THEN flow->'steps' ELSE '[]'::jsonb END
       ) step
       CROSS JOIN LATERAL jsonb_array_elements(CASE
         WHEN jsonb_typeof(step->'fields')='array'
           THEN step->'fields' ELSE '[]'::jsonb END
       ) field_binding) AS expected_flow_fields,
    (SELECT count(*) FROM control.entity_relation row
      WHERE row.entity_version_id=state.published_version_id) AS actual_relations,
    (SELECT count(*) FROM control.entity_operation row
      WHERE row.entity_version_id=state.published_version_id) AS actual_operations,
    (SELECT count(*) FROM control.entity_numbering_config row
      WHERE row.entity_version_id=state.published_version_id) AS actual_numbering,
    (SELECT count(*) FROM control.entity_lifecycle_state_mask row
      WHERE row.entity_version_id=state.published_version_id) AS actual_lifecycle_masks,
    (SELECT count(*) FROM control.entity_action_rule row
      WHERE row.entity_version_id=state.published_version_id) AS actual_action_rules,
    (SELECT count(*) FROM control.entity_flow row
      WHERE row.entity_version_id=state.published_version_id) AS actual_flows,
    (SELECT count(*)
       FROM control.entity_flow flow
       JOIN control.entity_flow_step step ON step.flow_id=flow.id
      WHERE flow.entity_version_id=state.published_version_id) AS actual_flow_steps,
    (SELECT count(*)
       FROM control.entity_flow flow
       JOIN control.entity_flow_step step ON step.flow_id=flow.id
       JOIN control.entity_flow_section section ON section.flow_step_id=step.id
      WHERE flow.entity_version_id=state.published_version_id) AS actual_flow_sections,
    (SELECT count(*)
       FROM control.entity_flow flow
       JOIN control.entity_flow_step step ON step.flow_id=flow.id
       JOIN control.entity_flow_field field_binding ON field_binding.flow_step_id=step.id
      WHERE flow.entity_version_id=state.published_version_id) AS actual_flow_fields,
    (SELECT count(*)
       FROM control.entity_numbering_counter counter
       JOIN control.entity_numbering_config numbering_config
         ON numbering_config.id=counter.config_id
      WHERE numbering_config.entity_id=entity.id
        AND counter.tenant_id IS NOT DISTINCT FROM entity.tenant_id) AS runtime_counter_count,
    (SELECT count(*) FROM snapshot.entity_plane_compiled artifact
      WHERE artifact.entity_version_id=state.published_version_id
        AND artifact.tenant_id IS NOT DISTINCT FROM state.tenant_id) AS plane_artifact_count,
    (SELECT count(*) FROM snapshot.entity_plane_compiled artifact
      WHERE artifact.entity_version_id=state.published_version_id
        AND artifact.tenant_id IS NOT DISTINCT FROM state.tenant_id
        AND (
          artifact.contract_hash IS DISTINCT FROM state.contract_hash
          OR artifact.materialized_hash IS DISTINCT FROM state.materialized_hash
          OR artifact.compiled_hash IS DISTINCT FROM CASE artifact.plane_key
            WHEN 'admin' THEN state.admin_compiled_hash
            WHEN 'neon' THEN state.neon_compiled_hash
            WHEN 'mesh' THEN state.mesh_compiled_hash
            ELSE NULL
          END
        )) AS plane_artifact_hash_mismatches,
    COALESCE((published.contract_document#>>'{catalog,enabled}')::boolean, false) AS catalog_enabled,
    COALESCE((published.contract_document#>>'{runtime,catalog_enabled}')::boolean, false)
      AS runtime_catalog_enabled,
    COALESCE((published.contract_document#>>'{runtime,runtime_enabled}')::boolean, false)
      AS runtime_enabled,
    published.contract_document#>>'{runtime,api_exposure}' AS api_exposure,
    ARRAY(SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(published.contract_document#>'{catalog,plane_eligibility}')='array'
        THEN published.contract_document#>'{catalog,plane_eligibility}' ELSE '[]'::jsonb END
    )) AS plane_eligibility,
    rls.rls_table_count,
    rls.forced_rls_table_count,
    fk.version_owner_fk_count
  FROM control.entity entity
  LEFT JOIN control.entity_publish_state state
    ON state.entity_id=entity.id
   AND state.tenant_id IS NOT DISTINCT FROM entity.tenant_id
  LEFT JOIN control.entity_version published ON published.id=state.published_version_id
  LEFT JOIN control.entity_version draft ON draft.id=state.current_draft_version_id
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE class.relrowsecurity) AS rls_table_count,
      count(*) FILTER (WHERE class.relforcerowsecurity) AS forced_rls_table_count
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='control'
      AND class.relname=ANY(ARRAY[
        'entity_flow','entity_flow_step','entity_flow_section','entity_flow_field',
        'entity_lifecycle_state_mask','entity_numbering_config','entity_numbering_counter'
      ])
  ) rls
  CROSS JOIN LATERAL (
    SELECT count(*) AS version_owner_fk_count
      FROM pg_constraint constraint_record
      JOIN pg_class class ON class.oid=constraint_record.conrelid
      JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
     WHERE namespace.nspname='control'
       AND constraint_record.contype='f'
       AND class.relname=ANY(ARRAY[
         'entity_field','entity_relation','entity_surface','entity_operation',
         'entity_action_rule','entity_lifecycle','entity_lifecycle_state_mask',
         'entity_numbering_config','entity_flow'
       ])
       AND pg_get_constraintdef(constraint_record.oid) LIKE '%entity_version%'
  ) fk
), classified AS (
  SELECT base.*,
    (published_version_id IS NOT NULL AND published_status IS DISTINCT FROM 'EFFECTIVE')
      AS partial_publication,
    (published_version_id IS NOT NULL AND (
      readiness_status IS DISTINCT FROM 'READY'
      OR contract_hash IS NULL
      OR publish_contract_hash IS DISTINCT FROM contract_hash
      OR projection_hash IS DISTINCT FROM materialized_hash
      OR plane_artifact_count<>3
      OR plane_artifact_hash_mismatches<>0
    )) AS hash_or_readiness_drift,
    (expected_relations<>actual_relations
      OR expected_operations<>actual_operations
      OR expected_numbering<>actual_numbering
      OR expected_flows<>actual_flows
      OR expected_action_rules<>actual_action_rules
      OR expected_lifecycle_masks<>actual_lifecycle_masks
      OR expected_flow_steps<>actual_flow_steps
      OR expected_flow_sections<>actual_flow_sections
      OR expected_flow_fields<>actual_flow_fields
    ) AS relational_drift,
    (rls_table_count<>7 OR forced_rls_table_count<>7 OR version_owner_fk_count<9)
      AS security_posture_drift
  FROM base
)
SELECT
  classified.*,
  CASE
    WHEN partial_publication THEN 'CRITICAL'
    WHEN hash_or_readiness_drift THEN 'CRITICAL'
    WHEN relational_drift THEN 'HIGH'
    WHEN security_posture_drift THEN 'HIGH'
    WHEN published_version_id IS NULL THEN 'WARN'
    WHEN contract_schema_version IS DISTINCT FROM '2.1' THEN 'WARN'
    ELSE 'INFO'
  END AS severity,
  CASE
    WHEN partial_publication
      THEN 'Atomically repoint to the previous immutable version; preserve transition evidence.'
    WHEN hash_or_readiness_drift
      THEN 'Stop cohort rollout, re-run validation/materialization/compile, and invalidate caches.'
    WHEN relational_drift
      THEN 'Quarantine migration; reconcile Contract owner arrays with version-owned projections.'
    WHEN security_posture_drift
      THEN 'Repair and FORCE RLS plus entity-version ownership foreign keys before rollout.'
    WHEN published_version_id IS NULL
      THEN 'Export legacy graph and create a reviewed v2.1 publication candidate.'
    WHEN contract_schema_version IS DISTINCT FROM '2.1'
      THEN 'Run deterministic v2.0 to v2.1 migration and review hydration diagnostics.'
    ELSE 'No remediation required.'
  END AS remediation_guidance
FROM classified;

COMMENT ON VIEW control.v_meta_entity_contract_audit IS
  'M7 unified audit: pointers, Contract/projection/compiled drift, governed child coverage, plane exposure, runtime counter count, and RLS/FK posture.';
