-- Cross-row invariants for the Neon product, catalog, and BOM foundation.

CREATE OR REPLACE FUNCTION master.trg_guard_product_catalog_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'master.% identity, tenant, and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_commodity_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT c.id, c.parent_id
              FROM master.commodity_category c
             WHERE c.tenant_id = NEW.tenant_id
               AND c.id = NEW.parent_id
            UNION ALL
            SELECT c.id, c.parent_id
              FROM master.commodity_category c
              JOIN ancestors a ON a.parent_id = c.id
             WHERE c.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Commodity category hierarchy cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_item_product_uom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_product_uom text;
BEGIN
    SELECT p.base_uom_code
      INTO v_product_uom
      FROM master.product p
     WHERE p.tenant_id = NEW.tenant_id
       AND p.id = NEW.product_id;

    IF FOUND AND NEW.base_uom_code <> v_product_uom THEN
        RAISE EXCEPTION
            'Item base UOM % must match product base UOM %',
            NEW.base_uom_code, v_product_uom
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_catalog_item_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_catalog_company uuid;
    v_item_company    uuid;
BEGIN
    SELECT company_code_id INTO v_catalog_company
      FROM master.catalog
     WHERE tenant_id = NEW.tenant_id AND id = NEW.catalog_id;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_catalog_company IS NOT NULL
       AND v_item_company IS NOT NULL
       AND v_catalog_company <> v_item_company THEN
        RAISE EXCEPTION 'Catalog item must belong to the catalog company code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_bom_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company       uuid;
    v_uom           text;
    v_manufactured  boolean;
BEGIN
    SELECT company_code_id, base_uom_code, is_manufactured
      INTO v_company, v_uom, v_manufactured
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.output_item_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR v_uom <> NEW.uom_code
        OR NOT v_manufactured
    ) THEN
        RAISE EXCEPTION
            'BOM output must be a manufactured item in the same company and base UOM'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_bom_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_output_item uuid;
    v_item_company uuid;
BEGIN
    SELECT output_item_id
      INTO v_output_item
      FROM master.bom
     WHERE tenant_id = NEW.tenant_id
       AND company_code_id = NEW.company_code_id
       AND id = NEW.bom_id;

    SELECT company_code_id
      INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.component_item_id;

    IF v_output_item = NEW.component_item_id THEN
        RAISE EXCEPTION 'A BOM cannot directly consume its output item'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_item_company IS NOT NULL AND v_item_company <> NEW.company_code_id THEN
        RAISE EXCEPTION 'BOM component must belong to the BOM company code'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_output_item IS NOT NULL AND EXISTS (
        WITH RECURSIVE descendants(item_id) AS (
            SELECT NEW.component_item_id
            UNION
            SELECT bc.component_item_id
              FROM descendants d
              JOIN master.bom b
                ON b.tenant_id = NEW.tenant_id
               AND b.company_code_id = NEW.company_code_id
               AND b.output_item_id = d.item_id
              JOIN master.bom_component bc
                ON bc.tenant_id = b.tenant_id
               AND bc.company_code_id = b.company_code_id
               AND bc.bom_id = b.id
             WHERE bc.id <> NEW.id
        )
        SELECT 1 FROM descendants WHERE item_id = v_output_item
    ) THEN
        RAISE EXCEPTION 'BOM component graph cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_released_bom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_status master.bom_status_d;
BEGIN
    SELECT status INTO v_status
      FROM master.bom
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.bom_id, OLD.bom_id);

    IF v_status IN ('released', 'retired') THEN
        RAISE EXCEPTION
            'Components of a released or retired BOM are immutable; create a new BOM revision'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
