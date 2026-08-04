DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'sourcing_event','sourcing_event_company','sourcing_event_demand',
        'sourcing_event_award','sourcing_event_award_allocation',
        'sourcing_event_intercompany_allocation'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_sourcing_event_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,operating_organization_id,buying_model,central_buyer_company_id
ON document.sourcing_event FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_event();
CREATE TRIGGER trg_sourcing_event_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_event();

CREATE TRIGGER trg_sourcing_event_company_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_company();

CREATE TRIGGER trg_sourcing_event_demand_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,sourcing_event_id,purchase_requisition_line_id,demand_company_code_id,
    requested_quantity,uom_code,requested_amount,source_currency_code,evaluation_amount,evaluation_currency_code,fx_rate_snapshot
ON document.sourcing_event_demand FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_demand();

CREATE TRIGGER trg_sourcing_event_award_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event_award
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_award();
CREATE TRIGGER trg_sourcing_event_award_80_projection
AFTER UPDATE OF status ON document.sourcing_event_award
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION document.trg_refresh_sourcing_award();

CREATE TRIGGER trg_sourcing_event_award_allocation_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_award_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_award_allocation();
CREATE TRIGGER trg_sourcing_event_award_allocation_80_projection
AFTER INSERT OR UPDATE OR DELETE ON document.sourcing_event_award_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_refresh_sourcing_award();

CREATE TRIGGER trg_sourcing_event_intercompany_10_contract
BEFORE INSERT OR UPDATE ON document.sourcing_event_intercompany_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sourcing_intercompany();
CREATE TRIGGER trg_sourcing_event_intercompany_15_state
BEFORE INSERT OR UPDATE ON document.sourcing_event_intercompany_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_sourcing_intercompany();
