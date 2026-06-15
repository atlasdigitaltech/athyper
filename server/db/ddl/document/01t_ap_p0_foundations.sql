-- ============================================================================
-- document/01t_ap_p0_foundations.sql
-- Concept: AP P0 Foundations (v1.2) — column additions, sidecar table,
--          CHECK constraints (NOT VALID), validation functions
-- Depends on: 01e_tables_invoice.sql, 01b_tables_journal.sql, 01c_tables_extended.sql (master.budget_allocation)
-- Spec: docs/specs/purchase_invoice_field_design.md §3 (P0)
-- Triggers: see 06z_ap_p0_triggers.sql
-- RLS: see 08z_ap_p0_rls.sql
-- ============================================================================
--
-- This file is idempotent. Constraints are added NOT VALID first; the operator
-- runs `server/scripts/verify-ad-polymorphic-integrity.ts` (and similar pre-check
-- scripts) before issuing the corresponding VALIDATE CONSTRAINT.
--
-- v1.2 changelog (vs. v1.1):
--   • row_version on PIL and AD moved to 01z_row_version.sql
--   • account_source/lookup_key/fallback NOT moved to sidecar — they are
--     strategy input on AD, not forensic trace
--   • Sidecar captures resolution DECISIONS only (which fallback hit, what
--     resolved to what GL ID, resolver version)
-- ============================================================================


-- =============================================================================
-- §P0.2  AD base-currency columns (Stage 3 frozen amounts)
-- =============================================================================
-- distributed_amount_base + exchange_rate_snapshot are populated by the
-- posting service during the Stage 3 final UPDATE. Nullable today; SET NOT NULL
-- after the backfill script `server/scripts/backfill-ad-base-amounts.ts` is run
-- and verified for the relevant tenant scope.
-- =============================================================================

ALTER TABLE document.accounting_distribution
    ADD COLUMN IF NOT EXISTS distributed_amount_base numeric(18,4),
    ADD COLUMN IF NOT EXISTS exchange_rate_snapshot  numeric(20,10);

COMMENT ON COLUMN document.accounting_distribution.distributed_amount_base IS
    'Base-currency amount frozen at posting (Stage 3). '
    'Computed by posting service: distributed_amount × parent PI.exchange_rate. '
    'Nullable in Stages 1+2; required after Stage 3. '
    'Backfill: server/scripts/backfill-ad-base-amounts.ts.';

COMMENT ON COLUMN document.accounting_distribution.exchange_rate_snapshot IS
    'Exchange rate frozen at posting (Stage 3). '
    'Snapshot of parent PI.exchange_rate at the moment of GL projection. '
    'Nullable in Stages 1+2; required after Stage 3.';


-- =============================================================================
-- §P0.3  PIL budget_allocation_id (line-level override)
-- =============================================================================
-- Line cascade default from PI.budget_allocation_id; UI cascade interpretation
-- via control.entity_field.defaults (see §P0.10). FK to master.budget_allocation
-- (NOT control.budget_allocation — corrected v1.1).
-- =============================================================================

ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS budget_allocation_id uuid;

-- Tenant-scoped FK (matches Athyper composite-FK convention).
-- H1.B fix: column-scoped SET NULL (PG 15+) so only budget_allocation_id is
-- nulled, not the NOT NULL tenant_id. Fallback to RESTRICT on older PG.
DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        DROP CONSTRAINT IF EXISTS pil_budget_allocation_fk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_budget_allocation_fk
        FOREIGN KEY (tenant_id, budget_allocation_id)
        REFERENCES master.budget_allocation (tenant_id, id)
        ON DELETE SET NULL (budget_allocation_id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN syntax_error THEN
        ALTER TABLE document.purchase_invoice_line
            ADD CONSTRAINT pil_budget_allocation_fk
            FOREIGN KEY (tenant_id, budget_allocation_id)
            REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED;
END $$;

COMMENT ON COLUMN document.purchase_invoice_line.budget_allocation_id IS
    'Line-level budget allocation override. Cascade default = PI.budget_allocation_id, '
    'applied at row-create by the form runtime via control.entity_field.defaults. '
    'If null at submit, AD-level RESOLVE(dimensions, period, amount) fills.';


-- =============================================================================
-- §P0.4  Accounting Distribution Resolution Audit Sidecar
-- =============================================================================
-- 1:1 with accounting_distribution. INSERTed by the posting service during
-- the Stage 3 final UPDATE. Captures the resolver decision path, NOT the
-- strategy fields (those stay on AD: account_source, posting_role_code,
-- account_code, account_lookup_key, account_fallback, business_intent_id).
--
-- Append-only — log.trg_prevent_mutation() attached in 06z_ap_p0_triggers.sql.
-- RLS in 08z_ap_p0_rls.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS document.accounting_distribution_resolution_audit (
    -- Identity (1:1 with AD)
    accounting_distribution_id  uuid          NOT NULL,
    tenant_id                   uuid          NOT NULL,

    -- Resolution decision trace
    resolution_steps            jsonb         NOT NULL DEFAULT '[]'::jsonb,
    --   Example: [
    --     {"step":1,"strategy":"FROM_INTENT","intent_id":"...","matched_rule":"...","gl_account_id":"..."},
    --     {"step":2,"fallback":"company_default","gl_account_id":"..."}
    --   ]

    resolved_gl_account_id      uuid          NOT NULL,
    resolution_path             text          NOT NULL,
    --   'direct' | 'fallback_1' | 'fallback_2' | 'company_default'

    resolver_version            text          NOT NULL,
    -- semver of the resolver service that produced this row, e.g. 'resolver-v2.3.1'

    resolved_at                 timestamptz   NOT NULL DEFAULT now(),

    -- Metadata
    metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ad_resolution_audit_pkey          PRIMARY KEY (accounting_distribution_id),
    CONSTRAINT ad_resolution_audit_tenant_uq     UNIQUE (tenant_id, accounting_distribution_id),
    CONSTRAINT ad_resolution_audit_path_chk      CHECK (resolution_path IN (
        'direct','fallback_1','fallback_2','fallback_3','company_default','tenant_default')),
    CONSTRAINT ad_resolution_audit_resolver_chk  CHECK (btrim(resolver_version) <> '')
);

COMMENT ON TABLE document.accounting_distribution_resolution_audit IS
    'ARCHETYPE=C;SCOPE=T. Forensic trace of account resolution at Stage 3 posting. '
    'INSERTed by posting service in the same transaction as the Stage 3 final UPDATE on AD. '
    'Append-only (log.trg_prevent_mutation in 06z_ap_p0_triggers.sql). '
    'Strategy fields (account_source, posting_role_code, account_code, account_lookup_key, '
    'account_fallback, business_intent_id, commodity_category_id) stay on accounting_distribution — '
    'those are inputs the user (or service) set in Stages 1+2; this table captures the resolution OUTCOME.';


-- =============================================================================
-- §P0.7  Dimension Set Hash Refresh Function
-- =============================================================================
-- Computes a stable hash from (cost_center_id, profit_center_id, project_id, site_id)
-- so that dimension_set_id is a derived projection of the scalar dimensions.
-- Single direction of derivation — scalars are canonical (Decision #2).
--
-- Trigger attached to PI, PIL, AD in 06z_ap_p0_triggers.sql.
-- Skipped for PC (PC has no dimension columns in v1.2).
--
-- The hash uses md5 of a canonical concatenation. NULL handling: NULLs participate
-- as the string 'NULL' so different-NULL-pattern dimensions produce different hashes.
-- =============================================================================

CREATE OR REPLACE FUNCTION shared.fn_dimension_set_hash(
    p_cost_center_id    uuid,
    p_profit_center_id  uuid,
    p_project_id        uuid,
    p_site_id           uuid
) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    canonical text;
    hash_hex  text;
BEGIN
    -- All-NULL → NULL dimension_set_id (signals "no dimensions assigned")
    IF p_cost_center_id IS NULL AND p_profit_center_id IS NULL
       AND p_project_id IS NULL AND p_site_id IS NULL THEN
        RETURN NULL;
    END IF;

    canonical := coalesce(p_cost_center_id::text,   'NULL') || '|' ||
                 coalesce(p_profit_center_id::text, 'NULL') || '|' ||
                 coalesce(p_project_id::text,       'NULL') || '|' ||
                 coalesce(p_site_id::text,          'NULL');

    hash_hex := md5(canonical);

    -- Format as UUID v8 (custom): use the md5 bytes as the UUID body
    RETURN (substring(hash_hex,  1, 8) || '-' ||
            substring(hash_hex,  9, 4) || '-' ||
            '8' || substring(hash_hex, 14, 3) || '-' ||
            substring(hash_hex, 17, 4) || '-' ||
            substring(hash_hex, 21, 12))::uuid;
END;
$$;

COMMENT ON FUNCTION shared.fn_dimension_set_hash(uuid,uuid,uuid,uuid) IS
    'Computes a deterministic UUID-v8-formatted hash of the four scalar dimensions '
    '(cost_center, profit_center, project, site). Used by trg_dimension_set_hash on '
    'PI, PIL, AD to keep dimension_set_id in sync with the scalar dimensions. '
    'Decision #2 (v1.2): scalars are canonical; dimension_set_id is derived.';


CREATE OR REPLACE FUNCTION shared.trg_dimension_set_hash_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.dimension_set_id := shared.fn_dimension_set_hash(
        NEW.cost_center_id,
        NEW.profit_center_id,
        NEW.project_id,
        NEW.site_id
    );
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION shared.trg_dimension_set_hash_refresh() IS
    'BEFORE INSERT OR UPDATE OF (cost_center_id, profit_center_id, project_id, site_id) '
    'on PI, PIL, AD: recomputes dimension_set_id via shared.fn_dimension_set_hash. '
    'Decision #2 (v1.2): scalars canonical; dim_set derived.';


-- =============================================================================
-- §P0.5  AD Polymorphic Source Validation Function
-- =============================================================================
-- Closes the polymorphic FK integrity gap on AD by JOINing the correct parent
-- table per source_doc_type at INSERT and UPDATE time.
--
-- Constrained to the existing AD sealed CHECK source types (ad_source_type_chk):
--   PURCHASE_REQUISITION_LINE, COMMITMENT_LINE, PURCHASE_INVOICE_LINE,
--   GOODS_RECEIPT_LINE, SERVICE_ENTRY_SHEET_LINE.
--
-- For PURCHASE_REQUISITION_LINE, COMMITMENT_LINE, GOODS_RECEIPT_LINE,
-- SERVICE_ENTRY_SHEET_LINE: validation is best-effort — the tables exist but
-- their AD usage may pre-date this trigger. Soft-fail with NOTICE for those
-- types until each source domain wires its own audit.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_ad_validate_polymorphic_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_tenant uuid;
BEGIN
    -- PURCHASE_INVOICE_LINE — primary scope, hard-validated
    IF NEW.source_doc_type = 'PURCHASE_INVOICE_LINE' THEN
        SELECT pil.tenant_id INTO parent_tenant
          FROM document.purchase_invoice_line pil
         WHERE pil.id = NEW.source_line_id
           AND pil.tenant_id = NEW.tenant_id;

        IF parent_tenant IS NULL THEN
            RAISE EXCEPTION 'AD_SOURCE_NOT_FOUND: source_doc_type=% source_line_id=% tenant=%',
                NEW.source_doc_type, NEW.source_line_id, NEW.tenant_id
                USING ERRCODE = 'AD001';
        END IF;

        -- source_doc_id must point at the parent PI (Athyper convention from
        -- invoice-posting.service.ts): source_doc_id = parent PI.id when
        -- source_doc_type = PURCHASE_INVOICE_LINE.
        IF NOT EXISTS (
            SELECT 1 FROM document.purchase_invoice_line pil
             WHERE pil.id = NEW.source_line_id
               AND pil.purchase_invoice_id = NEW.source_doc_id
               AND pil.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'AD_SOURCE_HEADER_MISMATCH: source_doc_id=% does not own source_line_id=%',
                NEW.source_doc_id, NEW.source_line_id
                USING ERRCODE = 'AD002';
        END IF;

    -- Other source types — soft validation (NOTICE on missing) until wired
    ELSIF NEW.source_doc_type IN (
        'COMMITMENT_LINE','GOODS_RECEIPT_LINE',
        'SERVICE_ENTRY_SHEET_LINE','PURCHASE_REQUISITION_LINE'
    ) THEN
        -- Phase 2: tighten per source domain
        NULL;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_ad_validate_polymorphic_source() IS
    'BEFORE INSERT/UPDATE OF source_doc_type, source_doc_id, source_line_id on '
    'accounting_distribution: validates that the parent row exists in the correct '
    'table per source_doc_type, with matching tenant_id, and that source_doc_id '
    '(header) owns source_line_id. Hard-validates PURCHASE_INVOICE_LINE (primary AP '
    'scope); other source types soft-validated pending per-domain wiring.';


-- =============================================================================
-- §P0.6  AD Status-Gated Mutation Function (Decision #17)
-- =============================================================================
-- The critical design: trigger reads OLD parent status, not NEW.
-- This allows the Stage 3 final-posting UPDATE to succeed (OLD parent is still
-- 'approved' at that moment) while blocking any UPDATE in Stage 4 (OLD parent
-- has already transitioned to a terminal state).
--
-- Posting transaction order (enforced by service, not trigger):
--   1. UPDATE accounting_distribution SET gl_account_id=..., ... (multiple AD rows)
--      → trigger sees OLD pi.status='approved' → ALLOWED
--   2. INSERT into accounting_distribution_resolution_audit
--   3. INSERT journal_entry + journal_lines
--   4. UPDATE purchase_invoice SET status='posted'
--      → this is the LAST write; subsequent AD UPDATEs see OLD='posted' → REJECTED
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_ad_status_gated_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_parent_status text;
BEGIN
    -- Resolve OLD parent status via OLD's source_doc reference
    IF OLD.source_doc_type = 'PURCHASE_INVOICE_LINE' THEN
        SELECT pi.status INTO old_parent_status
          FROM document.purchase_invoice_line pil
          JOIN document.purchase_invoice pi ON pi.id = pil.purchase_invoice_id
         WHERE pil.id = OLD.source_line_id
           AND pil.tenant_id = OLD.tenant_id;
    -- Other source types: pass through (until each source domain wires its own gate)
    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Block UPDATE/DELETE only when parent is ALREADY terminal at time of write
    IF old_parent_status IN ('posted','partially_paid','fully_paid','reversed','cancelled') THEN
        RAISE EXCEPTION 'AD_LOCKED_BY_STATUS: parent invoice is %; AD frozen (Stage 4)', old_parent_status
            USING ERRCODE = 'AD003';
    END IF;

    -- For UPDATE: pass NEW; for DELETE: pass OLD
    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION document.fn_ad_status_gated_mutation() IS
    'BEFORE UPDATE OR DELETE on accounting_distribution: blocks mutations when '
    'OLD parent PI status is terminal (posted/partially_paid/fully_paid/reversed/cancelled). '
    'Reads OLD (not NEW) parent status — this is critical for Decision #17: the Stage 3 '
    'final posting UPDATE succeeds because OLD parent is still ''approved'' at that moment. '
    'Posting service must order writes: AD UPDATEs BEFORE pi.status=posted UPDATE.';


-- =============================================================================
-- §P0.8  PI Reversal Pair CHECK (NOT VALID then VALIDATE)
-- =============================================================================
-- Safe — jurisdiction-neutral. Pre-check script verifies zero violations.
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice
        ADD CONSTRAINT pi_reversal_pair_chk CHECK (
            (is_reversal = false AND reversal_of_id IS NULL)
            OR (is_reversal = true AND reversal_of_id IS NOT NULL)
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Validation step — run only after pre-check confirms no violations:
--   SELECT COUNT(*) FROM document.purchase_invoice
--    WHERE (is_reversal = false AND reversal_of_id IS NOT NULL)
--       OR (is_reversal = true  AND reversal_of_id IS NULL);
-- Then issue:
--   ALTER TABLE document.purchase_invoice VALIDATE CONSTRAINT pi_reversal_pair_chk;
-- (Left as a separate op so deployers can verify before locking.)


-- =============================================================================
-- §P0.8b  PI Currency Triad CHECK (NOT VALID then VALIDATE)
-- =============================================================================
-- Enforces: currency_code = base_currency_code ⇒ exchange_rate = 1.0
--           currency_code ≠ base_currency_code ⇒ exchange_rate > 0
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice
        ADD CONSTRAINT pi_currency_triad_chk CHECK (
            (currency_code = base_currency_code AND exchange_rate = 1.0)
            OR (currency_code <> base_currency_code AND exchange_rate > 0)
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- VALIDATE separately after pre-check:
--   SELECT COUNT(*) FROM document.purchase_invoice
--    WHERE NOT (
--      (currency_code = base_currency_code AND exchange_rate = 1.0)
--      OR (currency_code <> base_currency_code AND exchange_rate > 0)
--    );
-- Then:
--   ALTER TABLE document.purchase_invoice VALIDATE CONSTRAINT pi_currency_triad_chk;


-- =============================================================================
-- §P0.9  validatePurchaseInvoiceWaterfall — NEUTRAL ruleset
-- =============================================================================
-- Replaces v1.0's hard waterfall CHECK. Returns a violation list per
-- jurisdiction; NEUTRAL is the initial implementation. Other jurisdictions
-- (US, IN, UK, ...) plug in via tenant config lookup in subsequent phases.
--
-- NEUTRAL rule: subtotal_amount + tax_amount - withholding_tax_amount - retention_amount
--               ≈ total_amount within ±0.01 tolerance.
--   (Discount/freight/misc are part of subtotal_amount in the line rollup path.)
--
-- Called from:
--   • invoice-invariants.service.ts (phase='submit', phase='post')
--   • Eventually a CHECK constraint, once jurisdiction model locks (Decision #1)
-- =============================================================================

CREATE OR REPLACE FUNCTION document.validate_purchase_invoice_waterfall(
    p_invoice_id     uuid,
    p_jurisdiction   text DEFAULT 'NEUTRAL',
    p_tolerance      numeric DEFAULT 0.01
) RETURNS TABLE (
    violation_code   text,
    detail           jsonb
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    r record;
    computed_total  numeric(18,4);
    drift           numeric(18,4);
BEGIN
    SELECT pi.subtotal_amount,
           pi.tax_amount,
           coalesce(pi.withholding_tax_amount, 0) AS wht,
           coalesce(pi.retention_amount,       0) AS ret,
           pi.total_amount,
           pi.currency_code,
           pi.base_currency_code,
           pi.exchange_rate
      INTO r
      FROM document.purchase_invoice pi
     WHERE pi.id = p_invoice_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'INVOICE_NOT_FOUND'::text,
            jsonb_build_object('invoice_id', p_invoice_id);
        RETURN;
    END IF;

    IF p_jurisdiction = 'NEUTRAL' THEN
        -- NEUTRAL waterfall: total ≈ subtotal + tax - withholding - retention
        computed_total := r.subtotal_amount + r.tax_amount - r.wht - r.ret;
        drift := abs(r.total_amount - computed_total);

        IF drift > p_tolerance THEN
            RETURN QUERY SELECT
                'WATERFALL_NEUTRAL_DRIFT'::text,
                jsonb_build_object(
                    'invoice_id',      p_invoice_id,
                    'subtotal_amount', r.subtotal_amount,
                    'tax_amount',      r.tax_amount,
                    'withholding',     r.wht,
                    'retention',       r.ret,
                    'total_amount',    r.total_amount,
                    'expected_total',  computed_total,
                    'drift',           drift,
                    'tolerance',       p_tolerance
                );
        END IF;

        -- Currency triad consistency
        IF r.currency_code = r.base_currency_code AND r.exchange_rate <> 1.0 THEN
            RETURN QUERY SELECT
                'CURRENCY_TRIAD_INCONSISTENT'::text,
                jsonb_build_object(
                    'currency_code',      r.currency_code,
                    'base_currency_code', r.base_currency_code,
                    'exchange_rate',      r.exchange_rate
                );
        END IF;
    ELSE
        -- Unknown jurisdiction → soft violation pointing at config registry
        RETURN QUERY SELECT
            'WATERFALL_JURISDICTION_UNKNOWN'::text,
            jsonb_build_object(
                'jurisdiction',     p_jurisdiction,
                'available',        jsonb_build_array('NEUTRAL'),
                'fallback_applied', 'NEUTRAL'
            );
    END IF;

    RETURN;
END;
$$;

COMMENT ON FUNCTION document.validate_purchase_invoice_waterfall(uuid, text, numeric) IS
    'Returns waterfall + currency-triad violations for a purchase invoice. '
    'NEUTRAL ruleset is the initial implementation; jurisdiction-specific rules '
    '(US, IN, UK, ...) plug in via tenant config lookup in subsequent phases. '
    'Called from invoice-invariants.service.ts at submit and post phases. '
    'A CHECK constraint on the table is deferred until Decision #1 (jurisdiction model) locks.';


-- =============================================================================
-- §P0.10  control.entity_field.defaults — cascade metadata column
-- =============================================================================
-- See control DDL (separate file): server/db/ddl/control/01t_entity_field_defaults.sql
--
-- Declared here as documentation:
--   defaults jsonb — holds {default_value_source, override_detection,
--                            on_parent_change, ui_affordance}
--   Index on (entity_code, name) WHERE defaults IS NOT NULL.
--
-- Drives form runtime + BFF inheritance projection (v1.2 P9).
-- =============================================================================


-- =============================================================================
-- End of 01t_ap_p0_foundations.sql
-- =============================================================================
