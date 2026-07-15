-- ============================================================================
-- snapshot/07_views.sql
-- Concept: Snapshot Views — P2P audit timeline
-- Depends on: snapshot/01_tables.sql (document_snapshot), log/01_tables.sql (activity_log)
-- ============================================================================

-- ============================================================================
-- §1  snapshot.v_p2p_audit_timeline — interleaves activity log + snapshots
-- ============================================================================
-- LEFT JOIN log.activity_log → snapshot.document_snapshot on activity_log_id so
-- the audit UI can render one row per business event with the captured snapshot
-- inline. activity_log rows without a snapshot still appear (LEFT JOIN); snapshot
-- rows without an activity_log row do NOT (the activity log is the spine).
--
-- No FK between the two tables — activity_log is partitioned with composite PK,
-- so we join on the id column alone (deterministic in practice — uuidv7 ids).

CREATE OR REPLACE VIEW snapshot.v_p2p_audit_timeline AS
SELECT
    al.tenant_id,
    al.entity_type,
    al.entity_id,
    al.domain,
    al.activity_type,
    al.actor_id,
    al.actor_type,
    al.company_code_id,
    al.detail              AS activity_detail,
    al.correlation_id,
    al.created_at          AS activity_at,
    al.created_by          AS activity_by,
    ds.id                  AS snapshot_id,
    ds.gate_event,
    ds.gate_event_kind,
    ds.version_number      AS snapshot_version_number,
    ds.chain_seq           AS snapshot_chain_seq,
    ds.payload_hash        AS snapshot_payload_hash,
    ds.captured_at         AS snapshot_captured_at,
    ds.captured_by         AS snapshot_captured_by,
    ds.capture_source      AS snapshot_capture_source
FROM log.activity_log AS al
LEFT JOIN snapshot.document_snapshot AS ds
       ON ds.activity_log_id = al.id
      AND ds.tenant_id       = al.tenant_id
WHERE al.entity_type IN (
    'purchase_requisition', 'commitment', 'purchase_order_confirmation',
    'delivery_note', 'receipt', 'service_sheet', 'purchase_invoice',
    'schedule_line'
);

COMMENT ON VIEW snapshot.v_p2p_audit_timeline IS
    'P2P audit timeline. One row per activity_log entry for P2P entities, with the captured '
    'document_snapshot LEFT JOINed by activity_log_id. Drives the per-record audit tab in '
    'the document object page. The activity log is the spine; not every activity has a '
    'snapshot (notifications, comments) but every snapshot has an activity.';
