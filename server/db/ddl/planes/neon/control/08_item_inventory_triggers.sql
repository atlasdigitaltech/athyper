CREATE TRIGGER trg_item_inventory_policy_00_created_by
BEFORE INSERT ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_item_inventory_policy_10_identity_guard
BEFORE UPDATE OR DELETE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_item_inventory_policy();

CREATE TRIGGER trg_item_inventory_policy_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, item_id
ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_item_inventory_policy();

CREATE TRIGGER trg_item_inventory_policy_20_status_evidence
BEFORE UPDATE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_item_inventory_policy_90_updated_at
BEFORE UPDATE ON control.item_inventory_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
