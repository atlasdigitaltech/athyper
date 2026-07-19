-- ============================================================================
-- Concept: AP P0 Triggers (v1.2) - row_version on PIL, dimension_set hash,
--          AD polymorphic validation, AD status-gated mutation
-- Depends on: 06_triggers.sql (shared.trg_increment_row_version),
--             01t_ap_p0_foundations.sql (validation + hash functions)
-- Spec: docs/specs/purchase_invoice_field_design.md §8
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================


-- =============================================================================
-- P0.1  row_version trigger on PIL
-- =============================================================================
-- Pattern matches §ROW_VERSION block in 06_triggers.sql.
-- The shared.trg_increment_row_version() function lives there.
-- =============================================================================

-- §PIL  Purchase Invoice Line row_version
DROP TRIGGER IF EXISTS trg_pil_row_version ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_row_version
    BEFORE UPDATE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER trg_pil_row_version ON document.purchase_invoice_line IS
    'Increments row_version on every UPDATE to purchase_invoice_line. '
    'Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines — each line carries '
    'expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT.';


-- =============================================================================
-- §P0.5  AD polymorphic source validation
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ad_validate_polymorphic_source ON document.accounting_distribution;
CREATE TRIGGER trg_ad_validate_polymorphic_source
    BEFORE INSERT OR UPDATE OF source_doc_type, source_doc_id, source_line_id
    ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION document.fn_ad_validate_polymorphic_source();

COMMENT ON TRIGGER trg_ad_validate_polymorphic_source ON document.accounting_distribution IS
    'Validates polymorphic source tuple: parent row exists in the correct table per '
    'source_doc_type, tenant matches, source_doc_id (header) owns source_line_id. '
    'Hard-validates purchase_invoice_line; other source types soft-validated pending '
    'per-domain wiring.';


-- =============================================================================
-- §P0.6  AD status-gated mutation (Decision #17 — Option A)
-- =============================================================================
-- Reads OLD parent status. Allows Stage 3 final-posting UPDATE (OLD parent is
-- still 'approved' at that moment) while blocking any further write once parent
-- enters posted family.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ad_status_gated_mutation ON document.accounting_distribution;
CREATE TRIGGER trg_ad_status_gated_mutation
    BEFORE UPDATE OR DELETE ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION document.fn_ad_status_gated_mutation();

COMMENT ON TRIGGER trg_ad_status_gated_mutation ON document.accounting_distribution IS
    'Blocks UPDATE/DELETE when OLD parent PI status is terminal '
    '(posted/partially_paid/fully_paid/reversed/cancelled). '
    'Allows the Stage 3 final-posting UPDATE because OLD parent is still ''approved'' '
    'at that moment. Posting service ordering is critical: AD UPDATEs BEFORE pi.status=posted.';


-- =============================================================================
-- §P0.7  Dimension Set Hash triggers (PI, PIL, AD)
-- =============================================================================
-- PC is skipped — PC has no dimension columns in v1.2.
-- =============================================================================

-- §PI
DROP TRIGGER IF EXISTS trg_pi_dimension_set_hash ON document.purchase_invoice;
-- Phase 1 reset removed purchase_invoice header accounting dimensions.
-- Dimension hashing remains on document.accounting_distribution.

-- §PIL — line-level dim hash trigger removed (accounting dimensions now live on AD).
DROP TRIGGER IF EXISTS trg_pil_dimension_set_hash ON document.purchase_invoice_line;

-- §AD
DROP TRIGGER IF EXISTS trg_ad_dimension_set_hash ON document.accounting_distribution;
CREATE TRIGGER trg_ad_dimension_set_hash
    BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id
    ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION document.trg_ad_dimension_set_hash_refresh();

COMMENT ON TRIGGER trg_ad_dimension_set_hash ON document.accounting_distribution IS
    'Keeps dimension_set_id in sync with the three scalar dimensions on AD '
    '(cost_center, profit_center, project). Site dimension is sourced from the '
    'P2P line. Includes the Stage 3 final-posting UPDATE.';


-- =============================================================================
-- §P0.8  PIL → AD auto-create on insert
-- =============================================================================
-- Accounting dimensions (cost_center, profit_center, project, budget_allocation,
-- dimension_set) live exclusively on document.accounting_distribution. Each PIL
-- gets a default 1:1 AD row at insert time so the UI always has an AD to render
-- and the posting service has a complete distribution set to read from.
--
-- COMPATIBILITY FALLBACK:
-- New user-visible defaulting should be owned by the Meta Entity defaults
-- resolver/service layer. This trigger remains as a defensive fallback for
-- generic/import line insert paths until every writer creates its default AD
-- through accounting.default_distribution.
--
-- Dim defaults are cascaded from the parent PI header. Account resolution stays
-- deferred until posting (account_source='PENDING' → posting service resolves
-- the GL via accounting profile, falling back to the hardcoded path).
-- =============================================================================

DROP TRIGGER IF EXISTS trg_pil_auto_create_default_ad ON document.purchase_invoice_line;
DROP FUNCTION IF EXISTS document.trg_pil_auto_create_default_ad();


-- =============================================================================
-- End of 06z_ap_p0_triggers.sql
-- =============================================================================



-- ============================================================================
-- PI snapshot-freeze trigger
-- Once status leaves 'draft'/'rejected', header bill-side address snapshots
-- become immutable. Edits require amendment (new PI revision).
-- ============================================================================

DROP TRIGGER IF EXISTS trg_pi_freeze_address_snapshot ON document.purchase_invoice;
DROP FUNCTION IF EXISTS document.trg_pi_freeze_address_snapshot();
-- Phase 1 reset moved billto/billfrom/remitto ownership to invoice lines.

-- Legacy trigger from Phase 3b (targets dropped jurisdiction columns) — remove.
DROP TRIGGER IF EXISTS trg_pi_freeze_jurisdiction_snapshot ON document.purchase_invoice;
DROP FUNCTION IF EXISTS document.trg_pi_freeze_jurisdiction_snapshot();


-- ============================================================================
-- PI LINE snapshot-freeze trigger
-- Same contract for line-level ship addresses + tax jurisdictions + tax group.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.trg_pil_freeze_jurisdiction_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_parent_status text;
BEGIN
    SELECT status INTO v_parent_status
      FROM document.purchase_invoice
     WHERE id = NEW.purchase_invoice_id;

    IF v_parent_status IS DISTINCT FROM 'draft' AND v_parent_status IS DISTINCT FROM 'rejected' THEN
        IF (NEW.to_tax_jurisdiction_id   IS DISTINCT FROM OLD.to_tax_jurisdiction_id)
        OR (NEW.from_tax_jurisdiction_id IS DISTINCT FROM OLD.from_tax_jurisdiction_id)
        OR (NEW.site_id                  IS DISTINCT FROM OLD.site_id)
        OR (NEW.shipto_address_id        IS DISTINCT FROM OLD.shipto_address_id)
        OR (NEW.shipfrom_address_id      IS DISTINCT FROM OLD.shipfrom_address_id)
        OR (NEW.tax_group_id             IS DISTINCT FROM OLD.tax_group_id)
        THEN
            RAISE EXCEPTION 'PIL_SNAPSHOT_FROZEN: line jurisdiction/tax snapshot is immutable when parent status=% (line id=%)',
                v_parent_status, OLD.id
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pil_freeze_jurisdiction_snapshot ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_freeze_jurisdiction_snapshot
    BEFORE UPDATE OF
        site_id, shipto_address_id, to_tax_jurisdiction_id,
        shipfrom_address_id, from_tax_jurisdiction_id,
        tax_group_id
    ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pil_freeze_jurisdiction_snapshot();


-- ============================================================================
-- Shipping panel — address → jurisdiction derivation (LINE-level)
-- ============================================================================
-- When the user picks (or the resolver auto-stamps) a ship-to / ship-from
-- address on a PI line, the line's tax_jurisdiction snapshot is derived from
-- the chosen address's tax_jurisdiction_id. The address's own jurisdiction is
-- itself derived by trg_address_derive_jurisdiction (master/06_triggers.sql)
-- from country_code + region.
--
-- Resolution chain:
--   country + region  →  address.tax_jurisdiction_id
--                     →  PIL.to_tax_jurisdiction_id   (ship_to)
--                     →  PIL.from_tax_jurisdiction_id (ship_from)
--
-- The trigger only stamps when the address pointer changes — manual overrides
-- on the jurisdiction column survive unrelated UPDATEs.
-- ============================================================================

-- PI header no longer carries ship addresses (line-only). Legacy derive trigger
-- targeting default_shipto/shipfrom_address_id is dropped.
DROP TRIGGER IF EXISTS trg_pi_derive_ship_jurisdictions ON document.purchase_invoice;
DROP FUNCTION IF EXISTS document.trg_pi_derive_ship_jurisdictions();

CREATE OR REPLACE FUNCTION document.trg_pil_derive_ship_jurisdictions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Ship-to
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id
               AND a.id        = NEW.shipto_address_id;
        END IF;
    END IF;

    -- Ship-from (symmetric)
    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id
               AND a.id        = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pil_derive_ship_jurisdictions ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_derive_ship_jurisdictions
    BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id
    ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pil_derive_ship_jurisdictions();

COMMENT ON TRIGGER trg_pil_derive_ship_jurisdictions ON document.purchase_invoice_line IS
    'Stamps to_/from_tax_jurisdiction_id from the chosen shipto_/shipfrom_address_id. '
    'Address jurisdiction itself comes from country + region via '
    'trg_address_derive_jurisdiction (master/06_triggers.sql).';


-- Symmetric line-level derive triggers for commitment_line and SES line
-- (mirror PIL behaviour so addresses → jurisdiction stamp at any layer).
CREATE OR REPLACE FUNCTION document.trg_cl_derive_ship_jurisdictions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipto_address_id;
        END IF;
    END IF;

    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cl_derive_ship_jurisdictions ON document.commitment_line;
CREATE TRIGGER trg_cl_derive_ship_jurisdictions
    BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id
    ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_cl_derive_ship_jurisdictions();


CREATE OR REPLACE FUNCTION document.trg_sshl_derive_ship_jurisdictions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipto_address_id;
        END IF;
    END IF;

    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sshl_derive_ship_jurisdictions ON document.service_sheet_line;
CREATE TRIGGER trg_sshl_derive_ship_jurisdictions
    BEFORE INSERT OR UPDATE OF shipto_address_id, shipfrom_address_id
    ON document.service_sheet_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_sshl_derive_ship_jurisdictions();


-- ============================================================================
-- Phase 4 (P1c): PI date + fiscal scope derivation trigger
-- ============================================================================
-- Auto-fills derived date/fiscal fields whenever a PI is inserted or its
-- source inputs are updated. Fills NULLs only — explicit user values are
-- always preserved.
--
-- Derivation chain:
--   received_date            <- CURRENT_DATE (today)
--   document_date            <- supplier_invoice_date  (the canonical "invoice date")
--   baseline_date            <- document_date
--   posting_date             <- document_date  (period-gate trigger may bump later)
--   due_date                 <- baseline_date + payment_term.due_days
--                               (only when due_rule_type='NET_DAYS'; other rules
--                                left for service layer / future enhancement)
--   fiscal_year              <- generated period covering posting_date
--   period_number            <- generated period covering posting_date
--
-- NOTE: document.purchase_invoice has no `invoice_date` column. The UI/API
-- field "invoice_date" is an alias mapping to the `document_date` column
-- (see 042_control_entity_field_contract.sql: `('invoice_date', 'document_date', ...)`).
--
-- Idempotency:
--   Only fills NULLs. If supplier_invoice_date changes after the fact, derived
--   dates do NOT auto-recompute (user must re-derive manually if desired).
--   This protects user overrides — service layer or UI re-derivation should
--   NULL the target field first, then UPDATE the source.
--
-- Period-gate interaction:
--   This trigger runs BEFORE the existing period-gate trigger. If the derived
--   posting_date lands in a closed period, the period-gate trigger will reject
--   the row or stamp metadata accordingly (existing behavior preserved).
-- ============================================================================

CREATE OR REPLACE FUNCTION document.trg_pi_derive_dates()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_due_rule    text;
    v_due_days    integer;
    v_grace_days  integer;
    v_resolved_fiscal_year smallint;
    v_resolved_period_number smallint;
BEGIN
    -- ─── 1. received_date defaults to today ──────────────────────────────
    IF NEW.received_date IS NULL THEN
        NEW.received_date := CURRENT_DATE;
    END IF;

    -- ─── 3. baseline_date defaults to document_date ──────────────────────
    --     Credit-term clock starts at the document/invoice date by convention
    IF NEW.baseline_date IS NULL AND NEW.supplier_invoice_date IS NOT NULL THEN
        NEW.baseline_date := NEW.supplier_invoice_date;
    END IF;

    -- ─── 4. posting_date defaults to document_date ───────────────────────
    --     Period-gate trigger may bump forward if document_date falls in a
    --     closed period — that runs after this trigger.
    IF NEW.posting_date IS NULL AND NEW.supplier_invoice_date IS NOT NULL THEN
        NEW.posting_date := NEW.supplier_invoice_date;
    END IF;

    -- ─── 5. due_date = baseline + payment_term.due_days (NET_DAYS only) ──
    --     Handles the dominant payment-term shape. EOM / FIXED_DAY / COD /
    --     PREPAID rules need richer math (next month-end, specific DOM,
    --     immediate, pre-payment) — service layer / payment-term resolver
    --     will own those when the AP module gets advanced terms support.
    IF NEW.due_date IS NULL
       AND NEW.payment_term_id IS NOT NULL
       AND NEW.baseline_date IS NOT NULL
    THEN
        SELECT pt.due_rule_type, pt.due_days, pt.grace_days
          INTO v_due_rule, v_due_days, v_grace_days
          FROM master.payment_term pt
         WHERE pt.id = NEW.payment_term_id
           AND pt.tenant_id = NEW.tenant_id
         LIMIT 1;

        IF v_due_rule = 'NET_DAYS' AND v_due_days IS NOT NULL THEN
            NEW.due_date := NEW.baseline_date
                            + v_due_days
                            + COALESCE(v_grace_days, 0);
        ELSIF v_due_rule = 'COD' OR v_due_rule = 'PREPAID' THEN
            -- Due immediately on baseline date (no payment-term days)
            NEW.due_date := NEW.baseline_date;
        END IF;
        -- EOM / FIXED_DAY left unset — service-layer/UI must compute these
    END IF;

    -- ─── 6. fiscal scope from generated company periods ─────────────────
    -- Special periods are excluded because adjustment/closing periods can
    -- share a date with the final normal period and require explicit choice.
    IF NEW.posting_date IS NOT NULL
       AND NEW.company_code_id IS NOT NULL
       AND (NEW.fiscal_year IS NULL OR NEW.period_number IS NULL)
    THEN
        SELECT p.fiscal_year, p.period_number
          INTO v_resolved_fiscal_year, v_resolved_period_number
          FROM master.resolve_fiscal_period(
              NEW.tenant_id,
              NEW.company_code_id,
              NEW.posting_date,
              false
          ) p;

        NEW.fiscal_year := COALESCE(NEW.fiscal_year, v_resolved_fiscal_year);
        NEW.period_number := COALESCE(NEW.period_number, v_resolved_period_number);
    END IF;

    RETURN NEW;
END $$;

COMMENT ON FUNCTION document.trg_pi_derive_dates() IS
    'Phase 4 P1c: BEFORE INSERT/UPDATE on document.purchase_invoice. Fills NULL '
    'derived dates (document_date, baseline_date, posting_date, due_date, '
    'received_date) and fiscal scope (fiscal_year, period_number) from '
    'supplier_invoice_date + payment_term + generated company fiscal periods. '
    'document_date is the canonical "invoice date" column (UI alias "invoice_date" '
    'maps to it). Only fills NULLs; explicit user values are preserved.';

DROP TRIGGER IF EXISTS trg_pi_derive_dates ON document.purchase_invoice;
CREATE TRIGGER trg_pi_derive_dates
    BEFORE INSERT OR UPDATE OF
        supplier_invoice_date,
        baseline_date,
        posting_date,
        payment_term_id,
        company_code_id
    ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION document.trg_pi_derive_dates();


-- ============================================================================
-- PIL defaulter: cascade-resolve site_id / shipto_address_id / shipfrom_address_id
-- ============================================================================
-- Runs BEFORE trg_pil_derive_ship_jurisdictions so that once the ship-addresses
-- are settled, the jurisdiction trigger can stamp to_/from_tax_jurisdiction_id.
-- Trigger name sorts alphabetically before 'derive_ship_jurisdictions' so the
-- ordering is enforced by the planner's deterministic by-name fire order.
--
-- Cascade for site_id:
--   1. PIL.commitment_line_id        → commitment_line.site_id
--   2. PIL.receipt_line_id           → receipt.receiving_site_id (via parent receipt)
--   3. PIL.service_sheet_line_id     → service_sheet_line.site_id (line owns it)
--   4. NULL — user picks
--
-- Cascade for shipto_address_id:
--   1. PIL.commitment_line_id        → commitment_line.shipto_address_id
--   2. PIL.service_sheet_line_id     → service_sheet_line.shipto_address_id
--   3. v_site_address WHERE site_id = NEW.site_id
--        AND purpose IN ('ship_to','default') AND currently-effective
--        ORDER BY purpose='ship_to', is_primary, effective_from DESC
--   4. NULL — user picks
--   (receipt_line has no ship_address columns — falls through to step 3.)
--
-- Cascade for shipfrom_address_id:
--   1. PIL.commitment_line_id        → commitment_line.shipfrom_address_id
--   2. PIL.service_sheet_line_id     → service_sheet_line.shipfrom_address_id
--   3. v_supplier_address WHERE supplier_id = PI.supplier_id
--        AND purpose IN ('ship_from','default') AND currently-effective
--        ORDER BY purpose='ship_from', is_primary, effective_from DESC
--   4. NULL — user picks
--
-- Only fills NULLs — explicit user values are preserved. Re-runs when any of
-- the listed UPDATE columns changes so that, e.g., switching the chosen
-- commitment_line_id resets the inheritance chain.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_pil_default_ship_addresses ON document.purchase_invoice_line;
DROP FUNCTION IF EXISTS document.resolve_pil_defaults();
