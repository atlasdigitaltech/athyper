CREATE OR REPLACE FUNCTION document.trg_validate_pricing_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_company_id uuid;
    v_parent_status text;
    v_condition_term master.pricing_term_type_d;
    v_condition_status master.pricing_condition_status_d;
    v_condition_classes text[];
    v_required_class text;
    v_tax_kind control.tax_group_kind_d;
BEGIN
    IF NEW.source_doc_type = 'purchase_requisition_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.purchase_requisition
             WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.purchase_requisition_line l
              JOIN document.purchase_requisition h ON h.tenant_id=l.tenant_id AND h.id=l.purchase_requisition_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.purchase_requisition_id=NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'commitment_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text
              INTO v_company_id, v_parent_status
              FROM document.commitment
             WHERE tenant_id = NEW.tenant_id AND id = NEW.source_doc_id;
        ELSE
            SELECT c.company_code_id, c.status::text
              INTO v_company_id, v_parent_status
              FROM document.commitment_line l
              JOIN document.commitment c
                ON c.tenant_id = l.tenant_id AND c.id = l.commitment_id
             WHERE l.tenant_id = NEW.tenant_id
               AND l.id = NEW.source_line_id
               AND l.commitment_id = NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'purchase_invoice_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text
              INTO v_company_id, v_parent_status
              FROM document.purchase_invoice
             WHERE tenant_id = NEW.tenant_id AND id = NEW.source_doc_id;
        ELSE
            SELECT i.company_code_id, i.status::text
              INTO v_company_id, v_parent_status
              FROM document.purchase_invoice_line l
              JOIN document.purchase_invoice i
                ON i.tenant_id = l.tenant_id AND i.id = l.purchase_invoice_id
             WHERE l.tenant_id = NEW.tenant_id
               AND l.id = NEW.source_line_id
               AND l.purchase_invoice_id = NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'receipt_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.receipt WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.receipt_line l JOIN document.receipt h ON h.tenant_id=l.tenant_id AND h.id=l.receipt_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.receipt_id=NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'service_sheet_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.service_sheet WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.service_sheet_line l JOIN document.service_sheet h ON h.tenant_id=l.tenant_id AND h.id=l.service_sheet_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.service_sheet_id=NEW.source_doc_id;
        END IF;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'PRICING_SOURCE_NOT_FOUND: %.% in tenant %',
            NEW.source_doc_type, COALESCE(NEW.source_line_id, NEW.source_doc_id), NEW.tenant_id;
    END IF;
    IF v_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION 'PRICING_COMPANY_MISMATCH: source company % differs from component company %',
            v_company_id, NEW.company_code_id;
    END IF;

    SELECT term_type, status, applies_to_classes
      INTO v_condition_term, v_condition_status, v_condition_classes
      FROM master.condition_type
     WHERE tenant_id = NEW.tenant_id AND id = NEW.condition_type_id;
    IF v_condition_term IS NULL THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_FOUND: % in tenant %', NEW.condition_type_id, NEW.tenant_id;
    END IF;
    IF v_condition_status <> 'active' THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_ACTIVE: % has status %', NEW.condition_type_id, v_condition_status;
    END IF;
    IF v_condition_term <> NEW.term_type THEN
        RAISE EXCEPTION 'PRICING_CONDITION_TERM_MISMATCH: condition term % differs from row %',
            v_condition_term, NEW.term_type;
    END IF;
    v_required_class := CASE NEW.source_doc_type
        WHEN 'purchase_requisition_line' THEN 'purchase_requisition'
        WHEN 'commitment_line' THEN 'purchase_order'
        WHEN 'purchase_invoice_line' THEN 'purchase_invoice'
        WHEN 'receipt_line' THEN 'goods_receipt'
        WHEN 'service_sheet_line' THEN 'service_sheet'
    END;
    IF NEW.source_doc_type IN ('commitment_line','purchase_invoice_line')
       AND NOT (v_required_class = ANY(v_condition_classes)) THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_APPLICABLE: condition % does not apply to %',
            NEW.condition_type_id, v_required_class;
    END IF;

    IF NEW.tax_group_id IS NOT NULL THEN
        SELECT group_kind INTO v_tax_kind
          FROM control.tax_group
         WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_group_id
           AND status = 'active'
           AND effective_from <= CURRENT_DATE
           AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
        IF v_tax_kind IS NULL THEN
            RAISE EXCEPTION 'PRICING_TAX_GROUP_NOT_ACTIVE: %', NEW.tax_group_id;
        END IF;
        IF (NEW.term_type = 'withholding' AND v_tax_kind <> 'withholding')
           OR (NEW.term_type = 'tax' AND v_tax_kind = 'withholding') THEN
            RAISE EXCEPTION 'PRICING_TAX_GROUP_KIND_MISMATCH: term % cannot use group kind %',
                NEW.term_type, v_tax_kind;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.source_doc_type IS DISTINCT FROM OLD.source_doc_type
        OR NEW.source_doc_id IS DISTINCT FROM OLD.source_doc_id
        OR NEW.source_line_id IS DISTINCT FROM OLD.source_line_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'PRICING_IDENTITY_IMMUTABLE';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_pricing_component_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_row document.pricing_component%ROWTYPE;
    v_parent_status text;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    IF v_row.source_doc_type = 'purchase_requisition_line' THEN
        SELECT status::text INTO v_parent_status FROM document.purchase_requisition
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: requisition status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'commitment_line' THEN
        SELECT status::text INTO v_parent_status
          FROM document.commitment
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: commitment status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'purchase_invoice_line' THEN
        SELECT status::text INTO v_parent_status
          FROM document.purchase_invoice
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_doc_id;
        IF v_parent_status NOT IN ('proforma','draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: invoice status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'receipt_line' THEN
        SELECT status::text INTO v_parent_status FROM document.receipt
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: receipt status is %', v_parent_status;
        END IF;
    ELSE
        SELECT status::text INTO v_parent_status FROM document.service_sheet
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: service sheet status is %', v_parent_status;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_schedule_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_parent_id uuid;
    v_parent_qty numeric(18,4);
    v_parent_currency character(3);
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.is_current_version
       AND NOT NEW.is_current_version
       AND NEW.terminal_status IS NOT NULL THEN
        NEW.supersedes_at := COALESCE(NEW.supersedes_at, now());
        IF NEW.status = 'active' THEN
            NEW.status := CASE WHEN NEW.terminal_status = 'CLOSED' THEN 'retired' ELSE 'cancelled' END;
        END IF;
        NEW.status_source := 'terminal';
    END IF;

    IF NEW.source_doc_type = 'purchase_requisition_line' THEN
        SELECT purchase_requisition_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.purchase_requisition_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    ELSIF NEW.source_doc_type = 'commitment_line' THEN
        SELECT commitment_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.commitment_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    ELSE
        SELECT purchase_invoice_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.purchase_invoice_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    END IF;

    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULE_SOURCE_NOT_FOUND: %.% in tenant %',
            NEW.source_doc_type, NEW.source_line_id, NEW.tenant_id;
    END IF;
    IF v_parent_id <> NEW.source_doc_id THEN
        RAISE EXCEPTION 'SCHEDULE_SOURCE_HEADER_MISMATCH: expected %, received %',
            v_parent_id, NEW.source_doc_id;
    END IF;
    IF NEW.currency_code IS NOT NULL AND NEW.currency_code <> v_parent_currency THEN
        RAISE EXCEPTION 'SCHEDULE_CURRENCY_MISMATCH: parent %, schedule %',
            v_parent_currency, NEW.currency_code;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.source_doc_type IS DISTINCT FROM OLD.source_doc_type
        OR NEW.source_doc_id IS DISTINCT FROM OLD.source_doc_id
        OR NEW.source_line_id IS DISTINCT FROM OLD.source_line_id
        OR NEW.schedule_no IS DISTINCT FROM OLD.schedule_no
        OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_schedule_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_row document.schedule_line%ROWTYPE;
    v_parent_quantity numeric(18,4);
    v_scheduled_quantity numeric(18,4);
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    IF v_row.source_doc_type = 'purchase_requisition_line' THEN
        SELECT quantity INTO v_parent_quantity
          FROM document.purchase_requisition_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    ELSIF v_row.source_doc_type = 'commitment_line' THEN
        SELECT quantity INTO v_parent_quantity
          FROM document.commitment_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    ELSE
        SELECT quantity INTO v_parent_quantity
          FROM document.purchase_invoice_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    END IF;

    IF v_parent_quantity IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT COALESCE(sum(scheduled_quantity), 0)
      INTO v_scheduled_quantity
      FROM document.schedule_line
     WHERE tenant_id = v_row.tenant_id
       AND source_doc_type = v_row.source_doc_type
       AND source_line_id = v_row.source_line_id
       AND is_current_version
       AND terminal_status IS NULL;
    IF v_scheduled_quantity > v_parent_quantity THEN
        RAISE EXCEPTION 'SCHEDULE_QUANTITY_EXCEEDED: scheduled % exceeds source-line quantity %',
            v_scheduled_quantity, v_parent_quantity;
    END IF;
    RETURN NULL;
END;
$$;
