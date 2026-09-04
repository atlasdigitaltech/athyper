REVOKE ALL ON snapshot.entity_snapshot_identity FROM PUBLIC;
REVOKE ALL ON snapshot.entity_snapshot FROM PUBLIC;
REVOKE ALL ON snapshot.entity_case_snapshot_lineage FROM PUBLIC;
REVOKE ALL ON
    snapshot.latest_entity_snapshot,
    snapshot.entity_contract_inventory,
    snapshot.active_flow_template,
    snapshot.blueprint_catalog,
    snapshot.active_workflow_sla_policy,
    snapshot.active_bank_format_rule
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION snapshot.fn_compute_entity_snapshot_hash(
    uuid, text, uuid, integer, integer, text, text,
    snapshot.capture_kind_d, jsonb, uuid, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_capture_entity(
    text, uuid, text, integer, text, bigint, text,
    snapshot.capture_kind_d, jsonb, uuid, uuid, timestamptz,
    timestamptz, snapshot.retention_class_d, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_get_entity_snapshot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_hash(uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_chain(text, uuid)
    FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperapp;
        GRANT SELECT ON
            snapshot.entity_snapshot_identity,
            snapshot.entity_snapshot,
            snapshot.entity_case_snapshot_lineage,
            snapshot.latest_entity_snapshot,
            snapshot.entity_contract_inventory,
            snapshot.active_flow_template,
            snapshot.blueprint_catalog,
            snapshot.active_workflow_sla_policy,
            snapshot.active_bank_format_rule
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_capture_entity(
            text, uuid, text, integer, text, bigint, text,
            snapshot.capture_kind_d, jsonb, uuid, uuid, timestamptz,
            timestamptz, snapshot.retention_class_d, text
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_get_entity_snapshot(uuid)
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_hash(uuid)
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_chain(
            text, uuid
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            snapshot.entity_snapshot_identity,
            snapshot.entity_snapshot,
            snapshot.entity_case_snapshot_lineage,
            snapshot.latest_entity_snapshot,
            snapshot.entity_contract_inventory,
            snapshot.active_flow_template,
            snapshot.blueprint_catalog,
            snapshot.active_workflow_sla_policy,
            snapshot.active_bank_format_rule
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_snapshot_hash(
            uuid, text, uuid, integer, integer, text, text,
            snapshot.capture_kind_d, jsonb, uuid, text
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_capture_entity(
            text, uuid, text, integer, text, bigint, text,
            snapshot.capture_kind_d, jsonb, uuid, uuid, timestamptz,
            timestamptz, snapshot.retention_class_d, text
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_get_entity_snapshot(uuid)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_hash(uuid)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_verify_entity_snapshot_chain(
            text, uuid
        ) TO athyperadmin;
    END IF;
END;
$$;
