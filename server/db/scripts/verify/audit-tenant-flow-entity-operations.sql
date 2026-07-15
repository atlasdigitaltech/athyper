-- Phase 5 pre-migration audit: run before applying the entity_operation
-- execution_target backfill. The query intentionally returns every tenant
-- override that uses a flow UI (including disabled rows), not only the six lifecycle mappings.
-- Review unmapped/custom flows before migration so none silently fall through.

SELECT
    eo.tenant_id,
    eo.entity_name,
    eo.permission_code,
    eo.handler_type,
    eo.handler_target AS ui_flow_target,
    eo.execution_target,
    eo.is_enabled,
    eo.id
FROM control.entity_operation eo
WHERE eo.tenant_id IS NOT NULL
  AND eo.handler_target LIKE 'flow:%'
ORDER BY eo.tenant_id, eo.entity_name, eo.permission_code;

-- Rollout override audit. This query must return zero rows before enabling a
-- tenant override: every enabled operation must resolve to a compiled registry
-- key and every override must use one of the accepted flag shapes.
WITH lifecycle_registry(entity_name, operation_code) AS (
    VALUES
      ('purchase_requisition', 'submit'),
      ('receipt', 'submit'),
      ('service_sheet', 'submit'),
      ('purchase_invoice', 'submit'),
      ('purchase_invoice', 'post'),
      ('purchase_invoice', 'reverse')
), tenant_rollout AS (
    SELECT e.tenant_id,
           e.name AS entity_name,
           e.feature_flags -> 'lifecycle_command_orchestrator_v2' AS flag_value
      FROM control.entity e
     WHERE e.tenant_id IS NOT NULL
       AND e.feature_flags ? 'lifecycle_command_orchestrator_v2'
), enabled_operations AS (
    SELECT tr.tenant_id, tr.entity_name, op.operation_code
      FROM tenant_rollout tr
      CROSS JOIN LATERAL (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(tr.flag_value) = 'array' THEN tr.flag_value
            WHEN jsonb_typeof(tr.flag_value) = 'object'
              AND jsonb_typeof(tr.flag_value -> 'operations') = 'array'
              THEN tr.flag_value -> 'operations'
            ELSE '[]'::jsonb
          END
        ) AS operation_code
      ) op
)
SELECT tr.tenant_id, tr.entity_name, NULL::text AS operation_code,
       'invalid lifecycle_command_orchestrator_v2 flag shape' AS finding
  FROM tenant_rollout tr
 WHERE COALESCE(jsonb_typeof(tr.flag_value), 'null') NOT IN ('boolean', 'array', 'object')
    OR (jsonb_typeof(tr.flag_value) = 'object'
        AND jsonb_typeof(tr.flag_value -> 'enabled') IS DISTINCT FROM 'boolean'
        AND jsonb_typeof(tr.flag_value -> 'operations') IS DISTINCT FROM 'array')
UNION ALL
SELECT eo.tenant_id, eo.entity_name, eo.operation_code,
       'enabled operation has no lifecycle command registry key' AS finding
  FROM enabled_operations eo
  LEFT JOIN lifecycle_registry lr
    ON lr.entity_name = eo.entity_name
   AND lr.operation_code = lower(replace(eo.operation_code, '-', '_'))
 WHERE lr.entity_name IS NULL
ORDER BY tenant_id, entity_name, operation_code;
