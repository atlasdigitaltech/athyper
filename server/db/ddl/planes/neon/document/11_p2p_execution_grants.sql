DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.purchase_requisition,
            document.purchase_requisition_line,
            document.purchase_order_confirmation,
            document.delivery_note,
            document.delivery_note_line,
            document.receipt,
            document.receipt_line,
            document.service_sheet,
            document.service_sheet_line
        TO athyperapp;
        GRANT SELECT, INSERT ON document.purchase_order_confirmation_line TO athyperapp;

        GRANT EXECUTE ON FUNCTION document.trg_guard_p2p_header() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_p2p_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_p2p_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_fulfillment_capacity() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_confirmation_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.recompute_commitment_schedule(uuid, uuid, uuid) TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_refresh_commitment_schedule() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.purchase_requisition,
            document.purchase_requisition_line,
            document.purchase_order_confirmation,
            document.purchase_order_confirmation_line,
            document.delivery_note,
            document.delivery_note_line,
            document.receipt,
            document.receipt_line,
            document.service_sheet,
            document.service_sheet_line
        TO athyperadmin;
    END IF;
END $$;
