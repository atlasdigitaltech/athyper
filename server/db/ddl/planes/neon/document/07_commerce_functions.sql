CREATE OR REPLACE FUNCTION document.trg_set_commerce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_order_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_company  uuid;
    v_currency character(3);
    v_item_company uuid;
BEGIN
    SELECT company_code_id, currency_code
      INTO v_company, v_currency
      FROM document.sales_order
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.sales_order_id;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_currency IS NOT NULL AND NEW.currency_code <> v_currency THEN
        RAISE EXCEPTION 'Sales-order line currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_company IS NOT NULL
       AND v_item_company IS NOT NULL
       AND v_company <> v_item_company THEN
        RAISE EXCEPTION 'Sales-order item must belong to the order company code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_production_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, snapshot
AS $$
DECLARE
    v_company uuid;
    v_item    uuid;
    v_uom     text;
BEGIN
    SELECT company_code_id, output_item_id, uom_code
      INTO v_company, v_item, v_uom
      FROM snapshot.bom
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.bom_snapshot_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR v_item <> NEW.output_item_id
        OR v_uom <> NEW.uom_code
    ) THEN
        RAISE EXCEPTION
            'Production order company, output item, and UOM must match its BOM snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_production_order_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, snapshot
AS $$
DECLARE
    v_order_snapshot uuid;
    v_component_snapshot snapshot.bom_component%ROWTYPE;
BEGIN
    IF NEW.bom_component_snapshot_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT bom_snapshot_id INTO v_order_snapshot
      FROM document.production_order
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.production_order_id;

    SELECT * INTO v_component_snapshot
      FROM snapshot.bom_component
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.bom_component_snapshot_id;

    IF FOUND AND (
        v_component_snapshot.bom_snapshot_id <> v_order_snapshot
        OR v_component_snapshot.component_item_id <> NEW.component_item_id
        OR v_component_snapshot.uom_code <> NEW.uom_code
    ) THEN
        RAISE EXCEPTION
            'Production component must match a component of the order BOM snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
