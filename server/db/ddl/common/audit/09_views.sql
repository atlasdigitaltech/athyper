CREATE VIEW audit.resolution_pipeline
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    tenant_id,
    plane_code,
    entity_type,
    entity_id,
    event_code,
    operation,
    outcome,
    severity,
    actor_principal_id,
    correlation_id,
    request_id,
    context,
    occurred_at,
    recorded_at
FROM audit.audit_log
WHERE event_code LIKE '%.resolution.%'
   OR event_code LIKE 'resolution.%';

CREATE VIEW audit.p2p_timeline
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    tenant_id,
    plane_code,
    entity_type,
    entity_id,
    event_code,
    operation,
    outcome,
    actor_principal_id,
    correlation_id,
    old_values,
    new_values,
    context,
    occurred_at
FROM audit.audit_log
WHERE entity_type LIKE 'document.%'
  AND (
      entity_type LIKE '%purchase%'
      OR entity_type LIKE '%payment%'
      OR entity_type LIKE '%receipt%'
      OR entity_type LIKE '%service_sheet%'
  );

CREATE VIEW audit.partition_health
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    parent_namespace.nspname AS parent_schema,
    parent_class.relname AS parent_table,
    child_namespace.nspname AS partition_schema,
    child_class.relname AS partition_table,
    pg_get_expr(child_class.relpartbound, child_class.oid) AS partition_bound,
    child_class.reltuples::bigint AS estimated_rows,
    child_class.relpages AS allocated_pages
FROM (VALUES
    ('audit.audit_log'::regclass),
    ('audit.authorization_decision_evidence'::regclass),
    ('audit.security_event'::regclass)
) AS parents(parent_oid)
CROSS JOIN LATERAL pg_partition_tree(parents.parent_oid) AS tree
JOIN pg_class AS child_class ON child_class.oid = tree.relid
JOIN pg_namespace AS child_namespace
  ON child_namespace.oid = child_class.relnamespace
JOIN pg_class AS parent_class ON parent_class.oid = parents.parent_oid
JOIN pg_namespace AS parent_namespace
  ON parent_namespace.oid = parent_class.relnamespace
WHERE tree.isleaf;

CREATE VIEW audit.activity_timeline
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    id AS audit_event_id,
    tenant_id,
    plane_code,
    split_part(event_code, '.', 1) AS domain,
    event_code AS activity_type,
    entity_type,
    entity_id,
    actor_principal_id AS actor_id,
    actor_type,
    outcome,
    severity,
    correlation_id,
    request_id,
    context AS detail,
    occurred_at AS created_at
FROM audit.audit_log
WHERE event_contract_code IN (
    'document_business_event',
    'attachment_access_event',
    'workflow_business_event',
    'accounting_business_event'
);

CREATE VIEW audit.entity_lifecycle_timeline
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    id AS audit_event_id,
    tenant_id,
    plane_code,
    entity_type,
    entity_id,
    event_code,
    operation,
    old_values ->> 'status' AS from_status,
    new_values ->> 'status' AS to_status,
    actor_principal_id AS actor_id,
    actor_type,
    reason_comment AS remarks,
    context ->> 'lifecycle_id' AS lifecycle_id,
    context ->> 'from_state_id' AS from_state_id,
    context ->> 'to_state_id' AS to_state_id,
    context ->> 'revision_no' AS revision_no,
    context ->> 'revision_label' AS revision_label,
    context ->> 'snapshot_id' AS snapshot_id,
    correlation_id,
    occurred_at AS created_at
FROM audit.audit_log
WHERE event_contract_code = 'document_business_event'
  AND (
      context ? 'lifecycle_id'
      OR (old_values ? 'status' AND new_values ? 'status')
  );

CREATE VIEW audit.workflow_timeline
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    id AS audit_event_id,
    tenant_id,
    plane_code,
    event_code,
    operation,
    outcome,
    severity,
    entity_type,
    entity_id,
    actor_principal_id AS actor_id,
    actor_type,
    old_values ->> 'status' AS from_status,
    new_values ->> 'status' AS to_status,
    context ->> 'instance_id' AS instance_id,
    context ->> 'step_instance_id' AS step_instance_id,
    context ->> 'workflow_template_code' AS workflow_template_code,
    context ->> 'workflow_template_version' AS workflow_template_version,
    context ->> 'transition_name' AS transition_name,
    correlation_id,
    trace_id,
    occurred_at AS created_at
FROM audit.audit_log
WHERE event_contract_code = 'workflow_business_event';

COMMENT ON VIEW audit.resolution_pipeline IS
  'Canonical resolution evidence projection replacing log.v_resolution_pipeline.';
COMMENT ON VIEW audit.p2p_timeline IS
  'Canonical P2P evidence timeline replacing snapshot.v_p2p_audit_timeline.';
COMMENT ON VIEW audit.partition_health IS
  'Catalog-backed inventory of audit evidence partitions, including defaults and their bounds.';
COMMENT ON VIEW audit.activity_timeline IS
  'Business-facing activity feed projected from canonical semantic audit events.';
COMMENT ON VIEW audit.entity_lifecycle_timeline IS
  'Entity lifecycle transition projection; full entity versions remain in snapshot.entity_snapshot.';
COMMENT ON VIEW audit.workflow_timeline IS
  'Workflow transition projection from canonical workflow audit events.';
