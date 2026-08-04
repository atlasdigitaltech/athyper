CREATE VIEW snapshot.latest_entity_snapshot
WITH (security_invoker = true, security_barrier = true) AS
SELECT DISTINCT ON (identity.tenant_id, identity.entity_type, identity.entity_id)
    identity.id AS snapshot_id,
    identity.tenant_id,
    identity.entity_type,
    identity.entity_id,
    identity.entity_code,
    identity.version_number,
    identity.payload_schema_version,
    identity.entity_contract_hash,
    identity.payload_hash,
    identity.capture_event,
    identity.capture_kind,
    identity.valid_from,
    identity.valid_until,
    identity.captured_at,
    identity.captured_by,
    payload.payload_json
FROM snapshot.entity_snapshot_identity AS identity
JOIN snapshot.entity_snapshot AS payload
  ON payload.tenant_id = identity.tenant_id
 AND payload.snapshot_id = identity.id
 AND payload.captured_at = identity.captured_at
ORDER BY identity.tenant_id, identity.entity_type, identity.entity_id,
         identity.version_number DESC, identity.captured_at DESC;

CREATE VIEW snapshot.entity_contract_inventory
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    tenant_id,
    entity_type,
    entity_contract_hash,
    payload_schema_version,
    count(*) AS snapshot_count,
    max(version_number) AS latest_version_number,
    max(captured_at) AS latest_captured_at
FROM snapshot.entity_snapshot_identity
GROUP BY tenant_id, entity_type, entity_contract_hash, payload_schema_version;

COMMENT ON VIEW snapshot.entity_contract_inventory IS
  'Published snapshot-contract inventory replacing legacy mutable Meta Entity audit views.';

CREATE VIEW snapshot.active_flow_template
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
FROM snapshot.latest_entity_snapshot
WHERE entity_type IN ('control.transaction_flow_template', 'control.entity_flow')
  AND (valid_from IS NULL OR valid_from <= statement_timestamp())
  AND (valid_until IS NULL OR valid_until > statement_timestamp());

CREATE VIEW snapshot.blueprint_catalog
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
FROM snapshot.latest_entity_snapshot
WHERE entity_type IN ('control.blueprint_registry', 'snapshot.blueprint');

CREATE VIEW snapshot.active_workflow_sla_policy
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
FROM snapshot.latest_entity_snapshot
WHERE entity_type = 'control.workflow_sla_policy'
  AND (valid_from IS NULL OR valid_from <= statement_timestamp())
  AND (valid_until IS NULL OR valid_until > statement_timestamp());

CREATE VIEW snapshot.active_bank_format_rule
WITH (security_invoker = true, security_barrier = true) AS
SELECT *
FROM snapshot.latest_entity_snapshot
WHERE entity_type = 'control.bank_format_rule'
  AND (valid_from IS NULL OR valid_from <= statement_timestamp())
  AND (valid_until IS NULL OR valid_until > statement_timestamp());

COMMENT ON VIEW snapshot.active_flow_template IS
  'Immutable published-flow projection replacing control.v_active_flow_templates.';
COMMENT ON VIEW snapshot.blueprint_catalog IS
  'Immutable blueprint projection replacing control.v_blueprint_catalogue.';
COMMENT ON VIEW snapshot.active_workflow_sla_policy IS
  'Plane-local immutable projection of Admin-authored active workflow SLA policy revisions.';
COMMENT ON VIEW snapshot.active_bank_format_rule IS
  'Plane-local immutable projection of Admin-authored active bank-format validation revisions.';
