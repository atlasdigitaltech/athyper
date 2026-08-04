CREATE OR REPLACE FUNCTION control.trg_validate_item_inventory_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_company uuid;
    v_managed boolean;
BEGIN
    SELECT company_code_id, is_inventory_managed
      INTO v_company, v_managed
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.item_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR NOT v_managed
    ) THEN
        RAISE EXCEPTION
            'Inventory policy requires an inventory-managed item in the same company'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_item_inventory_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION
                'Activated item inventory policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Inventory policy identity, coordinates, effective start, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
