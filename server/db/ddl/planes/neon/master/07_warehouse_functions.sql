CREATE OR REPLACE FUNCTION master.trg_guard_warehouse_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.site_id IS DISTINCT FROM OLD.site_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'warehouse tenant, site and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    IF OLD.status = 'active' AND NEW.status <> 'active' AND (
        EXISTS (
            SELECT 1 FROM ledger.inventory_balance
             WHERE tenant_id = OLD.tenant_id AND warehouse_id = OLD.id
               AND quantity_on_hand <> 0
        )
        OR EXISTS (
            SELECT 1 FROM ledger.inventory_valuation_layer
             WHERE tenant_id = OLD.tenant_id AND warehouse_id = OLD.id
               AND remaining_quantity > 0
        )
    ) THEN
        RAISE EXCEPTION 'warehouse with on-hand stock or open valuation layers cannot be deactivated'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_warehouse_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
BEGIN
    IF NOT control.lookup_value_is_active(
        'master.warehouse_type',
        NEW.warehouse_type,
        NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'unknown or inactive warehouse type %', NEW.warehouse_type
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
