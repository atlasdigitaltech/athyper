CREATE OR REPLACE FUNCTION document.trg_manage_stocktake_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_missing_count integer;
    v_missing_movement integer;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Completed or cancelled stocktake is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required to complete a stocktake'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
               count(*) FILTER (
                   WHERE counted_quantity IS NOT NULL
                     AND counted_quantity <> system_quantity
                     AND posted_inventory_movement_id IS NULL
               )
          INTO v_missing_count, v_missing_movement
          FROM document.stocktake_line
         WHERE tenant_id = NEW.tenant_id AND stocktake_id = NEW.id;

        IF NOT EXISTS (
            SELECT 1 FROM document.stocktake_line
             WHERE tenant_id = NEW.tenant_id AND stocktake_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'A stocktake cannot be completed without lines'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_missing_count > 0 THEN
            RAISE EXCEPTION 'Every stocktake line must be counted before completion'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_missing_movement > 0 THEN
            RAISE EXCEPTION 'Every non-zero stocktake variance must reference its inventory movement'
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.completed_at := statement_timestamp();
        NEW.completed_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_stocktake_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master, ledger
AS $$
DECLARE
    v_header document.stocktake%ROWTYPE;
    v_item_company uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_movement ledger.inventory_movement%ROWTYPE;
BEGIN
    SELECT * INTO v_header
      FROM document.stocktake
     WHERE tenant_id = NEW.tenant_id AND id = NEW.stocktake_id;

    IF FOUND AND v_header.status NOT IN ('planned', 'in_progress') THEN
        RAISE EXCEPTION 'Stocktake lines can only be changed while the stocktake is planned or in progress'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;
    IF FOUND AND v_item_company <> v_header.company_code_id THEN
        RAISE EXCEPTION 'Stocktake item and warehouse must belong to the same company code'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' OR NEW.counted_quantity IS DISTINCT FROM OLD.counted_quantity THEN
        IF NEW.counted_quantity IS NULL THEN
            NEW.counted_at := NULL;
            NEW.counted_by := NULL;
        ELSE
            IF v_actor IS NULL THEN
                RAISE EXCEPTION 'Current principal context is required to record a count'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            NEW.counted_at := statement_timestamp();
            NEW.counted_by := v_actor;
        END IF;
    END IF;

    IF NEW.posted_inventory_movement_id IS NOT NULL THEN
        SELECT * INTO v_movement
          FROM ledger.inventory_movement
         WHERE tenant_id = NEW.tenant_id AND id = NEW.posted_inventory_movement_id;
        IF FOUND AND (
            v_movement.company_code_id <> v_header.company_code_id
            OR v_movement.warehouse_id <> v_header.warehouse_id
            OR v_movement.item_id <> NEW.item_id
            OR v_movement.uom_code <> NEW.uom_code
            OR v_movement.currency_code <> NEW.currency_code
            OR v_movement.source_entity_type <> 'document.stocktake'
            OR v_movement.source_entity_id <> NEW.stocktake_id
            OR v_movement.source_line_id IS DISTINCT FROM NEW.id
            OR v_movement.quantity <> (NEW.counted_quantity - NEW.system_quantity)
        ) THEN
            RAISE EXCEPTION 'Posted inventory movement does not match the stocktake variance line'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_stocktake_line_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_status document.stocktake_status_d;
BEGIN
    SELECT status INTO v_status FROM document.stocktake
     WHERE tenant_id = OLD.tenant_id AND id = OLD.stocktake_id;
    IF v_status NOT IN ('planned', 'in_progress') THEN
        RAISE EXCEPTION 'Stocktake lines cannot be deleted after completion or cancellation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.sales_organization_profile p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.operating_organization_id = NEW.operating_organization_id
    ) THEN
        RAISE EXCEPTION 'Operating organization does not have a sales profile'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.operating_organization_id = NEW.operating_organization_id
           AND a.company_code_id = NEW.principal_seller_company_id
           AND a.status = 'active'
           AND a.effective_from <= CURRENT_DATE
           AND (a.effective_until IS NULL OR a.effective_until > CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Principal seller company is not active in the sales operating organization'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF TG_ARGV[0] = 'opportunity' THEN
        SELECT operating_organization_id INTO v_org
          FROM document.sales_opportunity
         WHERE tenant_id = NEW.tenant_id AND id = NEW.opportunity_id;
    ELSE
        SELECT operating_organization_id INTO v_org
          FROM document.sales_quotation
         WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.operating_organization_id = v_org
           AND a.company_code_id = NEW.company_code_id
           AND a.status = 'active'
           AND a.effective_from <= CURRENT_DATE
           AND (a.effective_until IS NULL OR a.effective_until > CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Participating company is not active in the sales operating organization'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_quotation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_opp document.sales_opportunity%ROWTYPE;
BEGIN
    IF NEW.opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opp FROM document.sales_opportunity
         WHERE tenant_id = NEW.tenant_id AND id = NEW.opportunity_id;
        IF FOUND AND (
            v_opp.customer_id <> NEW.customer_id
            OR v_opp.operating_organization_id <> NEW.operating_organization_id
            OR v_opp.selling_model <> NEW.selling_model
            OR v_opp.principal_seller_company_id IS DISTINCT FROM NEW.principal_seller_company_id
        ) THEN
            RAISE EXCEPTION 'Quotation commercial context must match its opportunity'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_order document.sales_order%ROWTYPE;
    v_total numeric(18,6);
BEGIN
    SELECT total_amount INTO v_total FROM document.sales_quotation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    IF NEW.allocation_amount IS NOT NULL AND NEW.allocation_amount > v_total THEN
        RAISE EXCEPTION 'Quotation allocation amount cannot exceed quotation total'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.output_sales_order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM document.sales_order
         WHERE tenant_id = NEW.tenant_id AND id = NEW.output_sales_order_id;
        IF FOUND AND (
            v_order.quotation_id IS DISTINCT FROM NEW.quotation_id
            OR v_order.company_code_id <> NEW.company_code_id
        ) THEN
            RAISE EXCEPTION 'Converted sales order must belong to the allocation quotation and company'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_intercompany_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_order document.sales_order%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM document.sales_order
     WHERE tenant_id = NEW.tenant_id AND id = NEW.sales_order_id;
    IF FOUND AND (
        v_order.company_code_id <> NEW.selling_company_code_id
        OR v_order.currency_code <> NEW.currency_code
        OR NEW.allocation_amount > v_order.total_amount
        OR (NEW.status = 'posted' AND v_order.status NOT IN ('confirmed', 'partially_fulfilled', 'fulfilled'))
    ) THEN
        RAISE EXCEPTION 'Intercompany fulfilment must match the sales-order owner, currency, and value ceiling'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_order_quotation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_quote document.sales_quotation%ROWTYPE;
BEGIN
    IF NEW.quotation_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_quote FROM document.sales_quotation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    IF FOUND AND (
        v_quote.customer_id <> NEW.customer_id
        OR v_quote.currency_code <> NEW.currency_code
        OR NOT EXISTS (
            SELECT 1 FROM document.sales_quotation_company c
             WHERE c.tenant_id = NEW.tenant_id
               AND c.quotation_id = NEW.quotation_id
               AND c.company_code_id = NEW.company_code_id
               AND c.status = 'active'
        )
    ) THEN
        RAISE EXCEPTION 'Sales order must match the originating quotation customer, currency, and active company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_intercompany_fulfillment_total(
    p_tenant_id uuid,
    p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_order_total numeric(18,6); v_allocated numeric(18,6);
BEGIN
    SELECT total_amount INTO v_order_total FROM document.sales_order
     WHERE tenant_id = p_tenant_id AND id = p_sales_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT coalesce(sum(allocation_amount), 0) INTO v_allocated
      FROM document.sales_order_intercompany_fulfillment
     WHERE tenant_id = p_tenant_id AND sales_order_id = p_sales_order_id
       AND status <> 'cancelled';
    IF v_allocated > v_order_total THEN
        RAISE EXCEPTION 'Active intercompany fulfilment allocations exceed sales-order total'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_intercompany_fulfillment_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_intercompany_fulfillment_total(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'sales_order_id')::uuid,
            (to_jsonb(OLD)->>'sales_order_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_sales_opportunity_structure(
    p_tenant_id uuid,
    p_opportunity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_header document.sales_opportunity%ROWTYPE;
BEGIN
    SELECT * INTO v_header FROM document.sales_opportunity
     WHERE tenant_id = p_tenant_id AND id = p_opportunity_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_header.status NOT IN ('draft', 'cancelled') AND NOT EXISTS (
        SELECT 1 FROM document.sales_opportunity_company c
         WHERE c.tenant_id = p_tenant_id AND c.opportunity_id = p_opportunity_id
           AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Active sales opportunity requires at least one participating company'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_header.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.sales_opportunity_company c
         WHERE c.tenant_id = p_tenant_id AND c.opportunity_id = p_opportunity_id
           AND c.company_code_id = v_header.principal_seller_company_id
           AND c.participation_role = 'lead_seller' AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Principal seller must be the active lead company on the opportunity'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_sales_quotation_structure(
    p_tenant_id uuid,
    p_quotation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_header document.sales_quotation%ROWTYPE;
    v_rows integer;
    v_percent_rows integer;
    v_amount_rows integer;
    v_percent numeric;
    v_amount numeric;
    v_unconverted integer;
BEGIN
    SELECT * INTO v_header FROM document.sales_quotation
     WHERE tenant_id = p_tenant_id AND id = p_quotation_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_header.status NOT IN ('draft', 'cancelled') AND NOT EXISTS (
        SELECT 1 FROM document.sales_quotation_company c
         WHERE c.tenant_id = p_tenant_id AND c.quotation_id = p_quotation_id
           AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Submitted sales quotation requires at least one participating company'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_header.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.sales_quotation_company c
         WHERE c.tenant_id = p_tenant_id AND c.quotation_id = p_quotation_id
           AND c.company_code_id = v_header.principal_seller_company_id
           AND c.participation_role = 'lead_seller' AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Principal seller must be the active lead company on the quotation'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), count(allocation_percent), count(allocation_amount),
           coalesce(sum(allocation_percent), 0), coalesce(sum(allocation_amount), 0),
           count(*) FILTER (WHERE status <> 'converted')
      INTO v_rows, v_percent_rows, v_amount_rows, v_percent, v_amount, v_unconverted
      FROM document.sales_quotation_allocation
     WHERE tenant_id = p_tenant_id AND quotation_id = p_quotation_id
       AND status <> 'cancelled';

    IF v_header.status IN ('submitted', 'approved', 'converted') AND v_rows > 0 THEN
        IF v_percent_rows > 0 AND (v_percent_rows <> v_rows OR v_percent <> 100) THEN
            RAISE EXCEPTION 'Active quotation percentage allocations must total exactly 100'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_amount_rows > 0 AND (v_amount_rows <> v_rows OR v_amount <> v_header.total_amount) THEN
            RAISE EXCEPTION 'Active quotation amount allocations must total the quotation amount'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF v_header.status = 'converted' AND (v_rows = 0 OR v_unconverted > 0) THEN
        RAISE EXCEPTION 'Converted quotation requires converted company allocations'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_sales_opportunity_structure()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_sales_opportunity_structure(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'opportunity_id')::uuid,
            (to_jsonb(OLD)->>'opportunity_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_sales_quotation_structure()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_sales_quotation_structure(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'quotation_id')::uuid,
            (to_jsonb(OLD)->>'quotation_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;
