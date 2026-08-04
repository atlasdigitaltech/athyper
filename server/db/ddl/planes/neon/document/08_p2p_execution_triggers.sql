DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition','purchase_order_confirmation','delivery_note','receipt','service_sheet'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_p2p_header()', v_table || '_10_guard', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF status ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()', v_table || '_20_status', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version()', v_table || '_25_version', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table || '_30_updated', v_table);
    END LOOP;
END $$;

CREATE TRIGGER purchase_requisition_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.purchase_requisition
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER receipt_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.receipt
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();
CREATE TRIGGER service_sheet_period_guard
BEFORE INSERT OR UPDATE OF company_code_id, fiscal_period_id ON document.service_sheet
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_company_period();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition_line','delivery_note_line','receipt_line','service_sheet_line'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_validate_p2p_line()', v_table || '_10_guard', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table || '_30_updated', v_table);
    END LOOP;
END $$;

CREATE TRIGGER purchase_requisition_line_status_stamp
BEFORE UPDATE OF status ON document.purchase_requisition_line
FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();

CREATE TRIGGER confirmation_line_validate
BEFORE INSERT ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_confirmation_line();
CREATE TRIGGER confirmation_line_immutable
BEFORE UPDATE OR DELETE ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER pr_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.purchase_requisition_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER confirmation_line_total_sync AFTER INSERT ON document.purchase_order_confirmation_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER receipt_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();
CREATE TRIGGER service_sheet_line_total_sync AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
FOR EACH ROW EXECUTE FUNCTION document.trg_sync_p2p_total();

CREATE CONSTRAINT TRIGGER receipt_line_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_fulfillment_capacity();
CREATE CONSTRAINT TRIGGER service_sheet_line_capacity
AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_fulfillment_capacity();

CREATE TRIGGER receipt_line_schedule_refresh
AFTER INSERT OR UPDATE OR DELETE ON document.receipt_line
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_commitment_schedule();
CREATE TRIGGER service_sheet_line_schedule_refresh
AFTER INSERT OR UPDATE OR DELETE ON document.service_sheet_line
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_commitment_schedule();
