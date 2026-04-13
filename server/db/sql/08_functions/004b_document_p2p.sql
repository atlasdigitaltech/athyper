-- =============================================================================
-- 08_functions/004b_document_p2p.sql  –  Guard functions for P2P tables
-- =============================================================================
-- Modelled after ledger.trg_guard_inventory_company_consistency() (line 35787).
-- Four company-consistency functions (one per distinct column-shape) plus two
-- business-rule guards for payment allocation semantics.
--
-- Why four company-consistency functions not one:
--   goods_receipt header  – has company_code_id directly; checks warehouse + site
--   goods_receipt line    – no company_code_id; reads from parent GR header
--   commitment_line       – no company_code_id; reads from parent commitment
--   ses_line              – no company_code_id; reads from parent SES; item only
--
-- master.warehouse has no company_code_id; resolved via warehouse → site → company.
--
-- Payment allocation guards (§16):
--   trg_guard_payment_allocation()       – BEFORE ROW  – type-specific field rules
--   trg_guard_netting_allocation_count() – AFTER STMT  – NETTING minimum line count
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.1  GR HEADER: receiving_warehouse_id + receiving_site_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_gr_header_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
DECLARE
    v_resolved uuid;
BEGIN
    -- Skip no-op updates
    IF TG_OP = 'UPDATE'
       AND OLD.company_code_id        IS NOT DISTINCT FROM NEW.company_code_id
       AND OLD.receiving_warehouse_id IS NOT DISTINCT FROM NEW.receiving_warehouse_id
       AND OLD.receiving_site_id      IS NOT DISTINCT FROM NEW.receiving_site_id
    THEN
        RETURN NEW;
    END IF;

    IF NEW.receiving_warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id
          AND w.id = NEW.receiving_warehouse_id;

        IF v_resolved IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION
                'GR header: receiving_warehouse % belongs to company %, but GR company is %',
                NEW.receiving_warehouse_id, v_resolved, NEW.company_code_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.receiving_site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.site
        WHERE tenant_id = NEW.tenant_id AND id = NEW.receiving_site_id;

        IF v_resolved IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION
                'GR header: receiving_site % belongs to company %, but GR company is %',
                NEW.receiving_site_id, v_resolved, NEW.company_code_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.2  GR LINE: item_id + warehouse_id (company from parent GR header)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_gr_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
DECLARE
    v_header_co uuid;
    v_resolved  uuid;
BEGIN
    SELECT company_code_id INTO v_header_co
    FROM document.goods_receipt
    WHERE tenant_id = NEW.tenant_id AND id = NEW.goods_receipt_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;  -- parent not found yet (deferred FK); let FK catch it
    END IF;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.item
        WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'GR line: item % belongs to company %, but GR company is %',
                NEW.item_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id AND w.id = NEW.warehouse_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'GR line: warehouse % belongs to company %, but GR company is %',
                NEW.warehouse_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.3  COMMITMENT LINE: item_id + delivery_warehouse_id + delivery_site_id
--        (company from parent document.commitment)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_commitment_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
DECLARE
    v_header_co uuid;
    v_resolved  uuid;
BEGIN
    SELECT company_code_id INTO v_header_co
    FROM document.commitment
    WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.item
        WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: item % belongs to company %, but commitment company is %',
                NEW.item_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.delivery_warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id AND w.id = NEW.delivery_warehouse_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: delivery_warehouse % belongs to company %, but commitment company is %',
                NEW.delivery_warehouse_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.delivery_site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.site
        WHERE tenant_id = NEW.tenant_id AND id = NEW.delivery_site_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: delivery_site % belongs to company %, but commitment company is %',
                NEW.delivery_site_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.4  SES LINE: item_id only (optional catalogued services)
--        (company from parent document.service_entry_sheet)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_ses_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
DECLARE
    v_header_co uuid;
    v_item_co   uuid;
BEGIN
    IF NEW.item_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT company_code_id INTO v_header_co
    FROM document.service_entry_sheet
    WHERE tenant_id = NEW.tenant_id AND id = NEW.service_entry_sheet_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT company_code_id INTO v_item_co
    FROM master.item
    WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_item_co IS DISTINCT FROM v_header_co THEN
        RAISE EXCEPTION
            'SES line: item % belongs to company %, but SES company is %',
            NEW.item_id, v_item_co, v_header_co
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §16  PAYMENT ALLOCATION BUSINESS RULE GUARD  (BEFORE ROW)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rules:
--   ADVANCE          → must have commitment_id; must NOT have purchase_invoice_id
--   STANDARD / PARTIAL / FINAL / DOWN_PAYMENT → must have purchase_invoice_id
--   RETENTION_RELEASE → must have invoice OR commitment
--   NETTING          → must have purchase_invoice_id; no commitment_id;
--                      no advance_recovery_amount; no retention_amount
--                      (minimum line-count enforced by the companion AFTER STMT
--                      trigger trg_guard_netting_allocation_count below)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_payment_allocation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = document AS $$
DECLARE
    v_payment_type text;
BEGIN
    SELECT payment_type INTO v_payment_type
    FROM document.payment_entry
    WHERE id = NEW.payment_entry_id;

    IF v_payment_type = 'ADVANCE' THEN
        IF NEW.commitment_id IS NULL THEN
            RAISE EXCEPTION
                'Advance payment allocation requires commitment_id'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.purchase_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Advance payment allocation must not reference a purchase_invoice_id'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type IN ('STANDARD','PARTIAL','FINAL','DOWN_PAYMENT') THEN
        IF NEW.purchase_invoice_id IS NULL THEN
            RAISE EXCEPTION
                'Payment type % allocation requires purchase_invoice_id',
                v_payment_type
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type = 'RETENTION_RELEASE' THEN
        IF NEW.purchase_invoice_id IS NULL AND NEW.commitment_id IS NULL THEN
            RAISE EXCEPTION
                'Retention release allocation requires purchase_invoice_id or commitment_id'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type = 'NETTING' THEN
        -- Netting settles existing AP invoice balances across a run; it does not
        -- operate against open commitments, recover advances, or release retention.
        -- Those adjustments must be completed on their respective payment types first.
        IF NEW.purchase_invoice_id IS NULL THEN
            RAISE EXCEPTION
                'NETTING allocation requires purchase_invoice_id'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.commitment_id IS NOT NULL THEN
            RAISE EXCEPTION
                'NETTING allocation must not reference commitment_id; settle open commitments via ADVANCE or STANDARD payments first'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.advance_recovery_amount <> 0 THEN
            RAISE EXCEPTION
                'NETTING allocation must not carry advance_recovery_amount; recover advances on standard invoice payments first'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.retention_amount <> 0 THEN
            RAISE EXCEPTION
                'NETTING allocation must not carry retention_amount; use RETENTION_RELEASE payment type instead'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §16b  NETTING ALLOCATION COUNT GUARD  (AFTER STATEMENT)
-- ─────────────────────────────────────────────────────────────────────────────
-- A per-row BEFORE trigger cannot count sibling rows that have not yet been
-- committed, so the minimum-two-lines rule requires a separate AFTER STATEMENT
-- trigger.  Uses a transition table (new_rows) so the scan is limited to
-- payment_entry_ids actually touched by the current statement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_netting_allocation_count()
RETURNS trigger LANGUAGE plpgsql
SET search_path = document AS $$
BEGIN
    -- Check only NETTING payments touched by this statement.
    IF EXISTS (
        SELECT 1
        FROM   (SELECT DISTINCT payment_entry_id FROM new_rows) AS changed
        JOIN   document.payment_entry pe
          ON   pe.id = changed.payment_entry_id
         AND   pe.payment_type = 'NETTING'
        WHERE  (
                   SELECT COUNT(*)
                   FROM   document.payment_entry_allocation
                   WHERE  payment_entry_id = pe.id
               ) < 2
    ) THEN
        RAISE EXCEPTION
            'NETTING payment must have at least two allocation lines — a single-invoice netting run is meaningless; use a STANDARD payment instead'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN NULL;
END;
$$;
