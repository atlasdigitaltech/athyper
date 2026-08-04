-- ============================================================================
-- snapshot/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "snapshot"."v_p2p_audit_timeline" AS
SELECT al.tenant_id,
    al.entity_type,
    al.entity_id,
    al.domain,
    al.activity_type,
    al.actor_id,
    al.actor_type,
    al.company_code_id,
    al.detail AS activity_detail,
    al.correlation_id,
    al.created_at AS activity_at,
    al.created_by AS activity_by,
    ds.id AS snapshot_id,
    ds.gate_event,
    ds.gate_event_kind,
    ds.version_number AS snapshot_version_number,
    ds.chain_seq AS snapshot_chain_seq,
    ds.payload_hash AS snapshot_payload_hash,
    ds.captured_at AS snapshot_captured_at,
    ds.captured_by AS snapshot_captured_by,
    ds.capture_source AS snapshot_capture_source
   FROM log.activity_log al
     LEFT JOIN snapshot.document_snapshot ds ON ds.activity_log_id = al.id AND ds.tenant_id = al.tenant_id
  WHERE al.entity_type = ANY (ARRAY['purchase_requisition'::text, 'commitment'::text, 'purchase_order_confirmation'::text, 'delivery_note'::text, 'receipt'::text, 'service_sheet'::text, 'purchase_invoice'::text, 'schedule_line'::text]);

COMMENT ON VIEW "snapshot"."v_p2p_audit_timeline" IS 'P2P audit timeline. One row per activity_log entry for P2P entities, with the captured document_snapshot LEFT JOINed by activity_log_id. Drives the per-record audit tab in the document object page. The activity log is the spine; not every activity has a snapshot (notifications, comments) but every snapshot has an activity.';
