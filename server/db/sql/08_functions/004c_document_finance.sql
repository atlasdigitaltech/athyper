-- 08_functions/004c_document_finance.sql
-- Finance enforcement trigger functions.
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql,
--             04_tables/008_governance.sql

-- =============================================================================
-- document.trg_je_period_gate_fn
-- =============================================================================
-- Blocks journal_entry INSERT (and posting_date UPDATE) when the target
-- book-period is hard_closed at either the book or fiscal-period level.
--
-- Checks two independent gates:
--   1. master.fiscal_period.status      = 'hard_close'
--   2. governance.book_period_status.status IN ('hard_close','future')
--
-- A missing book_period_status row is treated as 'future' (not yet opened).
-- soft_close periods ALLOW posting (they are still mutable pre-close).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_je_period_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, governance, pg_catalog
AS $$
DECLARE
  v_fp_status   text;
  v_bps_status  text;
BEGIN
  -- 1. Check master.fiscal_period status
  SELECT fp.status
    INTO v_fp_status
    FROM master.fiscal_period fp
   WHERE fp.tenant_id       = NEW.tenant_id        -- same tenant
     AND fp.company_code_id = NEW.company_code_id
     AND fp.fiscal_year     = NEW.fiscal_year
     AND fp.period_number   = NEW.period_number
   LIMIT 1;

  IF v_fp_status = 'hard_close' THEN
    RAISE EXCEPTION
      'PERIOD_HARD_CLOSED: Fiscal period %/% for company % is hard-closed. '
      'Use a prior-period adjustment JE with close_override_id.',
      NEW.fiscal_year, NEW.period_number, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check governance.book_period_status
  SELECT bps.status
    INTO v_bps_status
    FROM governance.book_period_status bps
   WHERE bps.tenant_id       = NEW.tenant_id
     AND bps.company_code_id = NEW.company_code_id
     AND bps.book_id         = NEW.book_id
     AND bps.fiscal_year     = NEW.fiscal_year
     AND bps.period_number   = NEW.period_number
   LIMIT 1;

  -- Missing row = 'future' (period not yet opened)
  v_bps_status := COALESCE(v_bps_status, 'future');

  IF v_bps_status IN ('hard_close', 'future') THEN
    RAISE EXCEPTION
      'BOOK_PERIOD_NOT_OPEN: Book period %/% for company %/book % has status ''%''. '
      'Period must be in status ''open'' or ''soft_close'' to accept postings.',
      NEW.fiscal_year, NEW.period_number, NEW.company_code_id, NEW.book_id, v_bps_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_period_gate_fn IS
  'BEFORE INSERT trigger function for document.journal_entry. '
  'Blocks posting to hard-closed fiscal periods or unopened book-periods. '
  'Checks master.fiscal_period AND governance.book_period_status.';


-- =============================================================================
-- document.trg_jl_validate_posting_controls_fn
-- =============================================================================
-- Validates that the GL account is postable in the given company before
-- a journal_line can be inserted.
--
-- Checks master.company_code_gl_account for:
--   - posting_allowed = true (account not globally blocked)
--   - blocked_for_manual = false (unless source_doc_type is auto-posting)
--
-- A missing company_code_gl_account row means the account is NOT assigned
-- to this company — posting is rejected.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_validate_posting_controls_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, pg_catalog
AS $$
DECLARE
  v_ctrl       record;
  v_je_source  text;
BEGIN
  -- Look up posting controls for this company + account
  SELECT cga.posting_allowed,
         cga.blocked_for_manual,
         cga.blocked_for_auto
    INTO v_ctrl
    FROM master.company_code_gl_account cga
   WHERE cga.tenant_id       = NEW.tenant_id
     AND cga.company_code_id = NEW.company_code_id
     AND cga.gl_account_id   = NEW.gl_account_id
   LIMIT 1;

  -- Account not assigned to company at all
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'ACCOUNT_NOT_ASSIGNED: GL account % is not assigned to company % '
      'in master.company_code_gl_account.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Globally blocked
  IF NOT v_ctrl.posting_allowed THEN
    RAISE EXCEPTION
      'ACCOUNT_POSTING_BLOCKED: GL account % is blocked for posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Get the parent JE source type to distinguish manual vs auto
  SELECT je.source_doc_type
    INTO v_je_source
    FROM document.journal_entry je
   WHERE je.id        = NEW.journal_entry_id
     AND je.tenant_id = NEW.tenant_id
   LIMIT 1;

  -- Manual posting blocked
  IF v_ctrl.blocked_for_manual AND v_je_source = 'MANUAL' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_MANUAL: GL account % is blocked for manual posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Auto posting blocked
  IF v_ctrl.blocked_for_auto AND v_je_source != 'MANUAL' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_AUTO: GL account % is blocked for automatic posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_jl_validate_posting_controls_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Validates posting_allowed + blocked_for_manual/auto '
  'against master.company_code_gl_account before accepting a journal line.';


-- =============================================================================
-- document.trg_jl_validate_dimensions_fn                            [GAP-3]
-- =============================================================================
-- Validates that cost_center_id, profit_center_id, and project_id on a
-- journal_line (when set) are:
--   1. Active  — master record has is_active = true  (status = 'active')
--   2. In-date — posting_date falls within [valid_from, valid_to] (NULL = open)
--   3. Tenant-isolated — same tenant_id
--
-- Fires BEFORE INSERT, after trg_jl_sync_from_header ('s' < 'v') so
-- NEW.posting_date is already populated from the parent journal_entry.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_validate_dimensions_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, pg_catalog
AS $$
DECLARE
  v_posting_date  date;
BEGIN
  v_posting_date := COALESCE(NEW.posting_date, CURRENT_DATE);

  -- ── cost_center_id ────────────────────────────────────────────────────────
  IF NEW.cost_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.cost_center cc
       WHERE cc.id        = NEW.cost_center_id
         AND cc.tenant_id = NEW.tenant_id
         AND cc.is_active = true
         AND (cc.valid_from IS NULL OR cc.valid_from <= v_posting_date)
         AND (cc.valid_to   IS NULL OR cc.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: cost_center_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.cost_center_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── profit_center_id ──────────────────────────────────────────────────────
  IF NEW.profit_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.profit_center pc
       WHERE pc.id        = NEW.profit_center_id
         AND pc.tenant_id = NEW.tenant_id
         AND pc.is_active = true
         AND (pc.valid_from IS NULL OR pc.valid_from <= v_posting_date)
         AND (pc.valid_to   IS NULL OR pc.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: profit_center_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.profit_center_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── project_id ────────────────────────────────────────────────────────────
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.project p
       WHERE p.id        = NEW.project_id
         AND p.tenant_id = NEW.tenant_id
         AND p.is_active = true
         AND (p.valid_from IS NULL OR p.valid_from <= v_posting_date)
         AND (p.valid_to   IS NULL OR p.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: project_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.project_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_jl_validate_dimensions_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Validates cost_center_id, profit_center_id, and project_id against their '
  'master tables — must be active (is_active=true) and within valid_from/valid_to '
  'window relative to the posting_date. Fires after trg_jl_sync_from_header so '
  'posting_date is already populated.';


-- =============================================================================
-- document.trg_je_workflow_gate_fn                                  [GAP-4]
-- =============================================================================
-- Blocks transition created → posted when any workflow_request for the JE
-- has status 'pending' (awaiting decision) or 'rejected' (decision was no).
--
-- Absence of a workflow_request means no approval workflow was configured
-- for this JE — posting is allowed without one.
--
-- Alphabetically fires after trg_je_status_transition_guard ('s' < 'w'),
-- so state-machine validation + posted_at stamping have already occurred
-- in the same BEFORE chain before this check runs.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_je_workflow_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, pg_catalog
AS $$
DECLARE
  v_blocking_status  text;
BEGIN
  -- Look for any open or rejected workflow request for this JE
  SELECT wr.status
    INTO v_blocking_status
    FROM document.workflow_request wr
   WHERE wr.tenant_id   = NEW.tenant_id
     AND wr.entity_type = 'journal_entry'
     AND wr.entity_id   = NEW.id::text
     AND wr.status IN ('pending', 'rejected')
   ORDER BY wr.status = 'rejected' DESC  -- surface rejected over pending
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'WORKFLOW_GATE: journal_entry % cannot be posted — '
      'a workflow_request exists with status ''%''. '
      'All approval workflows must reach status ''approved'' or ''canceled'' '
      'before posting is allowed.',
      NEW.je_number, v_blocking_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_workflow_gate_fn IS
  'BEFORE UPDATE trigger function on document.journal_entry. '
  'Fires on created→posted transition. Blocks posting when any '
  'document.workflow_request for the JE has status ''pending'' or ''rejected''. '
  'No workflow_request present = no approval required = posting allowed.';


-- =============================================================================
-- document.trg_jl_check_budget_fn                                   [GAP-5]
-- =============================================================================
-- Checks budget availability before a debit journal_line is inserted.
--
-- Lookup strategy (most-specific-wins):
--   1. Find active master.budget_allocation for company + fiscal_year whose
--      dimension filters (gl_account_id, cost_center_id, profit_center_id,
--      project_id) are NULL-or-match relative to the JL being posted.
--   2. Prefer period-level ledger.budget_balance.closing_amount; fall back to
--      allocation-level available_amount.
--   3. Apply tolerance_pct, then dispatch on overspend_policy:
--        BLOCK     → hard exception
--        ESCALATE  → hard exception (escalation via workflow must be done first)
--        WARN      → non-blocking RAISE WARNING
--        ALLOW     → pass through
--
-- Credit lines are never checked (they restore budget, not consume it).
-- Lines with no matching allocation pass through (no control configured).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_check_budget_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, ledger, pg_catalog
AS $$
DECLARE
  v_alloc          record;
  v_period_closing numeric(18,4);
  v_available      numeric(18,4);
  v_tolerance      numeric(18,4);
  v_consume_amt    numeric(18,4);
BEGIN
  -- Only expense/cost postings (debit side) consume budget
  IF NEW.base_debit = 0 THEN
    RETURN NEW;
  END IF;

  v_consume_amt := NEW.base_debit;

  -- Find the best matching active budget allocation.
  -- NULL on an allocation dimension = wildcard (matches any JL value).
  -- Order by specificity: most non-NULL dimension filters wins.
  SELECT ba.id,
         ba.overspend_policy,
         ba.tolerance_pct,
         ba.available_amount
    INTO v_alloc
    FROM master.budget_allocation ba
   WHERE ba.tenant_id        = NEW.tenant_id
     AND ba.company_code_id  = NEW.company_code_id
     AND ba.fiscal_year      = NEW.fiscal_year
     AND ba.is_active        = true
     AND (ba.gl_account_id    IS NULL OR ba.gl_account_id    = NEW.gl_account_id)
     AND (ba.cost_center_id   IS NULL OR ba.cost_center_id   = NEW.cost_center_id)
     AND (ba.profit_center_id IS NULL OR ba.profit_center_id = NEW.profit_center_id)
     AND (ba.project_id       IS NULL OR ba.project_id       = NEW.project_id)
   ORDER BY
       (ba.gl_account_id    IS NOT NULL)::int
     + (ba.cost_center_id   IS NOT NULL)::int
     + (ba.profit_center_id IS NOT NULL)::int
     + (ba.project_id       IS NOT NULL)::int DESC
   LIMIT 1;

  -- No budget allocation found → no control for this posting
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Prefer period-level closing balance; fall back to allocation-level available
  SELECT bb.closing_amount
    INTO v_period_closing
    FROM ledger.budget_balance bb
   WHERE bb.budget_allocation_id = v_alloc.id
     AND bb.fiscal_year          = NEW.fiscal_year
     AND bb.period_number        = NEW.period_number
   LIMIT 1;

  v_available := COALESCE(v_period_closing, v_alloc.available_amount);
  v_tolerance := v_available * (v_alloc.tolerance_pct / 100.0);

  -- Enforce overspend policy only when consumption exceeds budget + tolerance
  IF v_consume_amt > (v_available + v_tolerance) THEN
    CASE v_alloc.overspend_policy
      WHEN 'BLOCK' THEN
        RAISE EXCEPTION
          'BUDGET_EXCEEDED: Cannot post % — available budget is % '
          '(with tolerance %). '
          'Set overspend_policy=ALLOW on allocation % to permit overruns.',
          v_consume_amt, v_available, v_tolerance, v_alloc.id
          USING ERRCODE = 'P0001';

      WHEN 'ESCALATE' THEN
        RAISE EXCEPTION
          'BUDGET_ESCALATE: Cannot post % — available budget is %. '
          'A budget revision or transfer must be approved before posting.',
          v_consume_amt, v_available
          USING ERRCODE = 'P0001';

      WHEN 'WARN' THEN
        RAISE WARNING
          'BUDGET_WARNING: Posting % exceeds available budget of % '
          '(tolerance: %). Proceeding — overspend_policy=WARN.',
          v_consume_amt, v_available, v_tolerance;

      ELSE
        NULL;  -- ALLOW: no restriction, fall through
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_jl_check_budget_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Checks debit postings against the best-matching active master.budget_allocation '
  'and ledger.budget_balance for the period. '
  'Dispatches on overspend_policy: BLOCK/ESCALATE raise exceptions; '
  'WARN emits a non-blocking warning; ALLOW/no-match passes through. '
  'Credit lines are never checked (they restore budget, not consume it).';
