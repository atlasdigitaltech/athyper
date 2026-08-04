CREATE OR REPLACE FUNCTION document.trg_guard_p2p_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_commitment document.commitment%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'P2P_HEADER_IDENTITY_IMMUTABLE';
    END IF;

    IF TG_OP IN ('UPDATE','DELETE') THEN
        IF TG_TABLE_NAME = 'purchase_requisition' AND OLD.status IN ('fully_converted','closed','cancelled')
           OR TG_TABLE_NAME = 'purchase_order_confirmation' AND OLD.status IN ('confirmed','changes_accepted','changes_rejected','rejected','cancelled')
           OR TG_TABLE_NAME = 'delivery_note' AND OLD.status IN ('fully_receipted','returned','cancelled')
           OR TG_TABLE_NAME = 'receipt' AND OLD.status IN ('posted','reversed','cancelled')
           OR TG_TABLE_NAME = 'service_sheet' AND OLD.status IN ('posted','reversed','cancelled') THEN
            IF TG_OP = 'DELETE' OR (
                to_jsonb(NEW) - ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by','row_version']::text[]
                IS DISTINCT FROM
                to_jsonb(OLD) - ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by','row_version']::text[]
            ) THEN
                RAISE EXCEPTION 'P2P_DOCUMENT_TERMINAL: document.% is immutable in status %', TG_TABLE_NAME, OLD.status;
            END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    END IF;

    IF TG_TABLE_NAME IN ('purchase_order_confirmation','delivery_note','receipt','service_sheet') THEN
        IF NEW.commitment_id IS NOT NULL THEN
            SELECT * INTO v_commitment
              FROM document.commitment
             WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'P2P_COMMITMENT_NOT_FOUND';
            END IF;
            IF v_commitment.company_code_id <> NEW.company_code_id
               OR v_commitment.supplier_id IS DISTINCT FROM NEW.supplier_id
               OR v_commitment.currency_code <> NEW.currency_code THEN
                RAISE EXCEPTION 'P2P_HEADER_SOURCE_MISMATCH: company, supplier, and currency must match commitment';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_p2p_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_company uuid;
    v_currency character(3);
    v_status text;
    v_commitment_id uuid;
    v_commitment_line document.commitment_line%ROWTYPE;
    v_line_currency character(3);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
            SELECT company_code_id, currency_code, status::text INTO v_company, v_currency, v_status
              FROM document.purchase_requisition WHERE tenant_id = OLD.tenant_id AND id = OLD.purchase_requisition_id;
        ELSIF TG_TABLE_NAME = 'delivery_note_line' THEN
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.delivery_note WHERE tenant_id = OLD.tenant_id AND id = OLD.delivery_note_id;
        ELSIF TG_TABLE_NAME = 'receipt_line' THEN
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.receipt WHERE tenant_id = OLD.tenant_id AND id = OLD.receipt_id;
        ELSE
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.service_sheet WHERE tenant_id = OLD.tenant_id AND id = OLD.service_sheet_id;
        END IF;
        IF (TG_TABLE_NAME = 'purchase_requisition_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
           OR (TG_TABLE_NAME = 'delivery_note_line' AND v_status NOT IN ('draft','in_transit','arrived'))
           OR (TG_TABLE_NAME = 'receipt_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
           OR (TG_TABLE_NAME = 'service_sheet_line' AND v_status NOT IN ('draft','pending_acceptance','rejected')) THEN
            RAISE EXCEPTION 'P2P_LINE_PARENT_LOCKED: % status is %', TG_TABLE_NAME, v_status;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
        SELECT company_code_id, currency_code, status::text INTO v_company, v_currency, v_status
          FROM document.purchase_requisition WHERE tenant_id = NEW.tenant_id AND id = NEW.purchase_requisition_id;
    ELSIF TG_TABLE_NAME = 'delivery_note_line' THEN
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.delivery_note WHERE tenant_id = NEW.tenant_id AND id = NEW.delivery_note_id;
    ELSIF TG_TABLE_NAME = 'receipt_line' THEN
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.receipt WHERE tenant_id = NEW.tenant_id AND id = NEW.receipt_id;
    ELSE
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.service_sheet WHERE tenant_id = NEW.tenant_id AND id = NEW.service_sheet_id;
    END IF;
    v_line_currency := nullif(to_jsonb(NEW)->>'currency_code', '')::character(3);
    IF v_company IS NULL OR v_company <> NEW.company_code_id
       OR (v_line_currency IS NOT NULL AND v_currency <> v_line_currency) THEN
        RAISE EXCEPTION 'P2P_LINE_HEADER_MISMATCH: tenant, company, or currency differs from header';
    END IF;
    IF (TG_TABLE_NAME = 'purchase_requisition_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
       OR (TG_TABLE_NAME = 'delivery_note_line' AND v_status NOT IN ('draft','in_transit','arrived'))
       OR (TG_TABLE_NAME = 'receipt_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
       OR (TG_TABLE_NAME = 'service_sheet_line' AND v_status NOT IN ('draft','pending_acceptance','rejected')) THEN
        RAISE EXCEPTION 'P2P_LINE_PARENT_LOCKED: % status is %', TG_TABLE_NAME, v_status;
    END IF;

    IF TG_TABLE_NAME <> 'purchase_requisition_line' THEN
        SELECT * INTO v_commitment_line
          FROM document.commitment_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_line_id;
        IF NOT FOUND OR (v_commitment_id IS NOT NULL AND v_commitment_line.commitment_id <> v_commitment_id) THEN
            RAISE EXCEPTION 'P2P_LINE_COMMITMENT_MISMATCH';
        END IF;
        IF v_commitment_line.company_code_id <> NEW.company_code_id THEN
            RAISE EXCEPTION 'P2P_LINE_COMPANY_MISMATCH';
        END IF;
        IF TG_TABLE_NAME = 'receipt_line' AND v_commitment_line.procurement_type <> 'goods' THEN
            RAISE EXCEPTION 'RECEIPT_REQUIRES_GOODS_LINE';
        END IF;
        IF TG_TABLE_NAME = 'service_sheet_line' AND v_commitment_line.procurement_type <> 'services' THEN
            RAISE EXCEPTION 'SERVICE_SHEET_REQUIRES_SERVICE_LINE';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.line_no IS DISTINCT FROM OLD.line_no
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'P2P_LINE_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_p2p_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid;
    v_actor uuid := COALESCE(
        nullif(to_jsonb(NEW)->>'updated_by', '')::uuid,
        nullif(to_jsonb(NEW)->>'created_by', '')::uuid,
        nullif(to_jsonb(OLD)->>'updated_by', '')::uuid,
        nullif(to_jsonb(OLD)->>'created_by', '')::uuid
    );
BEGIN
    IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
        v_parent := COALESCE(NEW.purchase_requisition_id, OLD.purchase_requisition_id);
        UPDATE document.purchase_requisition h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.purchase_requisition_line WHERE tenant_id=v_tenant AND purchase_requisition_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'receipt_line' THEN
        v_parent := COALESCE(NEW.receipt_id, OLD.receipt_id);
        UPDATE document.receipt h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.receipt_line WHERE tenant_id=v_tenant AND receipt_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'service_sheet_line' THEN
        v_parent := COALESCE(NEW.service_sheet_id, OLD.service_sheet_id);
        UPDATE document.service_sheet h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.service_sheet_line WHERE tenant_id=v_tenant AND service_sheet_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'purchase_order_confirmation_line' THEN
        v_parent := COALESCE(NEW.confirmation_id, OLD.confirmation_id);
        UPDATE document.purchase_order_confirmation h SET confirmed_total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(confirmed_quantity * confirmed_unit_price),0) total FROM document.purchase_order_confirmation_line WHERE tenant_id=v_tenant AND confirmation_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_fulfillment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_line uuid := COALESCE(NEW.commitment_line_id, OLD.commitment_line_id);
    v_limit numeric(18,4);
    v_used numeric(18,4);
BEGIN
    SELECT quantity INTO v_limit FROM document.commitment_line WHERE tenant_id=v_tenant AND id=v_line;
    IF v_limit IS NULL THEN RETURN NULL; END IF;
    IF TG_TABLE_NAME = 'receipt_line' THEN
        SELECT COALESCE(sum(received_quantity),0) INTO v_used FROM document.receipt_line WHERE tenant_id=v_tenant AND commitment_line_id=v_line;
    ELSE
        SELECT COALESCE(sum(quantity),0) INTO v_used FROM document.service_sheet_line WHERE tenant_id=v_tenant AND commitment_line_id=v_line;
    END IF;
    IF v_used > v_limit THEN
        RAISE EXCEPTION 'P2P_FULFILLMENT_EXCEEDED: fulfilled % exceeds commitment quantity %', v_used, v_limit;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_confirmation_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_commitment_id uuid;
    v_status text;
    v_line_commitment_id uuid;
BEGIN
    SELECT commitment_id, status::text INTO v_commitment_id, v_status
      FROM document.purchase_order_confirmation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.confirmation_id;
    SELECT commitment_id INTO v_line_commitment_id
      FROM document.commitment_line
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_line_id;
    IF v_commitment_id IS NULL OR v_line_commitment_id IS NULL OR v_commitment_id <> v_line_commitment_id THEN
        RAISE EXCEPTION 'CONFIRMATION_LINE_COMMITMENT_MISMATCH';
    END IF;
    IF v_status NOT IN ('received','changes_proposed') THEN
        RAISE EXCEPTION 'CONFIRMATION_PARENT_LOCKED: status is %', v_status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.recompute_commitment_schedule(
    p_tenant_id uuid,
    p_commitment_line_id uuid,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_consumed numeric(18,4);
    v_remaining numeric(18,4);
    v_row record;
    v_allocated numeric(18,4);
BEGIN
    SELECT COALESCE((SELECT sum(received_quantity) FROM document.receipt_line
                     WHERE tenant_id=p_tenant_id AND commitment_line_id=p_commitment_line_id),0)
         + COALESCE((SELECT sum(quantity) FROM document.service_sheet_line
                     WHERE tenant_id=p_tenant_id AND commitment_line_id=p_commitment_line_id),0)
      INTO v_consumed;
    v_remaining := v_consumed;
    FOR v_row IN
        SELECT id, scheduled_quantity
          FROM document.schedule_line
         WHERE tenant_id=p_tenant_id AND source_doc_type='commitment_line'
           AND source_line_id=p_commitment_line_id
           AND is_current_version AND terminal_status IS NULL
         ORDER BY scheduled_date, schedule_no, id
    LOOP
        v_allocated := LEAST(v_row.scheduled_quantity, GREATEST(v_remaining,0));
        UPDATE document.schedule_line
           SET fulfilled_quantity = v_allocated,
               fulfillment_status = CASE
                   WHEN v_allocated = 0 THEN 'open'::document.schedule_fulfillment_status_d
                   WHEN v_allocated = v_row.scheduled_quantity THEN 'fulfilled'::document.schedule_fulfillment_status_d
                   ELSE 'partial'::document.schedule_fulfillment_status_d
               END,
               row_version = row_version + 1,
               updated_by = p_actor_id
         WHERE id=v_row.id AND tenant_id=p_tenant_id;
        v_remaining := v_remaining - v_allocated;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_commitment_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor uuid := COALESCE(
        nullif(to_jsonb(NEW)->>'updated_by','')::uuid,
        nullif(to_jsonb(NEW)->>'created_by','')::uuid,
        nullif(to_jsonb(OLD)->>'updated_by','')::uuid,
        nullif(to_jsonb(OLD)->>'created_by','')::uuid
    );
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM document.recompute_commitment_schedule(OLD.tenant_id, OLD.commitment_line_id, v_actor);
    END IF;
    IF TG_OP <> 'DELETE' AND (
        TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.commitment_line_id IS DISTINCT FROM OLD.commitment_line_id
        OR to_jsonb(NEW)->>'received_quantity' IS DISTINCT FROM to_jsonb(OLD)->>'received_quantity'
        OR to_jsonb(NEW)->>'quantity' IS DISTINCT FROM to_jsonb(OLD)->>'quantity'
    ) THEN
        PERFORM document.recompute_commitment_schedule(NEW.tenant_id, NEW.commitment_line_id, v_actor);
    END IF;
    RETURN NULL;
END;
$$;
