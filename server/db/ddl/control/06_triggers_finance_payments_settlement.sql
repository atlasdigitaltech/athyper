DROP TRIGGER IF EXISTS trg_pmib_conflict ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_conflict BEFORE INSERT OR UPDATE OF tenant_id,payment_method_id,company_code_id,
    bank_account_link_id,currency_code,direction,counterparty_country_code,payment_network,priority,
    effective_from,effective_until,status ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION control.guard_payment_interface_binding_conflict();

DROP TRIGGER IF EXISTS trg_pmib_house_bank ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_house_bank BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,bank_account_link_id
    ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION control.guard_payment_interface_house_bank();

DROP TRIGGER IF EXISTS trg_psr_company_book ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_company_book BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,book_code,effective_from,status
    ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION control.guard_payment_settlement_book();
