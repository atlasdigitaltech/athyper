-- ============================================================================
-- document/06yz_schedule_line_creation_triggers.sql
-- Concept: Review finding P2 fix — auto-create the default single schedule_line
--          on PR / commitment_line / PI line insert.
--
-- Why a DB trigger and not the TS writer service:
--   The bulk-line insert paths in records.route.ts are abstracted across
--   entity codes (linesTable + fkCol pattern, 5 distinct insert sites). A
--   DB trigger fires from EVERY insert path automatically — including
--   direct SQL inserts from services, seeds, and tests. The TS writer
--   service (schedule-line.service.ts) remains the authoritative API for:
--     - explicit multi-schedule splits (caller passes specs[])
--     - supersession + retirement lifecycle ops
--     - PR → PO schedule copy on conversion (the trigger creates a default;
--       the conversion service can supersede with the copy if needed)
--   The trigger uses ON CONFLICT DO NOTHING semantics — if the writer
--   service ran first the trigger is a no-op.
--
-- Depends on: 01v_tables_schedule_line.sql, 01j_tables_p2p.sql,
--             01c_tables_commitment.sql, 01e_tables_invoice.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  PR line — always creates one delivery schedule
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION document.trg_pr_line_default_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_scheduled_date date;
BEGIN
    -- Skip if a schedule already exists for this line (writer service ran first)
    IF EXISTS (
        SELECT 1 FROM document.schedule_line
         WHERE tenant_id          = NEW.tenant_id
           AND source_doc_type    = 'purchase_requisition_line'
           AND source_line_id     = NEW.id
           AND is_current_version = true
    ) THEN
        RETURN NEW;
    END IF;

    v_scheduled_date := COALESCE(NEW.required_by_date, CURRENT_DATE);

    INSERT INTO document.schedule_line (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        schedule_no, schedule_kind,
        scheduled_quantity, scheduled_date, currency_code,
        version_number, is_current_version,
        metadata, status, created_by
    ) VALUES (
        NEW.tenant_id,
        'purchase_requisition_line',
        NEW.purchase_requisition_id,
        NEW.id,
        1::smallint,
        'delivery',
        NEW.quantity,
        v_scheduled_date,
        NEW.currency_code,
        1,
        true,
        jsonb_build_object('source', 'trigger_default'),
        'active',
        NEW.created_by
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pr_line_default_schedule ON document.purchase_requisition_line;
CREATE TRIGGER trg_pr_line_default_schedule
    AFTER INSERT ON document.purchase_requisition_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pr_line_default_schedule();


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  commitment_line — copy from PR schedules if convert, else single default
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION document.trg_commitment_line_default_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_scheduled_date date;
    v_copied         integer := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM document.schedule_line
         WHERE tenant_id          = NEW.tenant_id
           AND source_doc_type    = 'commitment_line'
           AND source_line_id     = NEW.id
           AND is_current_version = true
    ) THEN
        RETURN NEW;
    END IF;

    -- If this commitment_line was converted from a PR line, copy the
    -- PR's current-version schedules. Reset schedule_no per new line.
    IF NEW.requisition_line_id IS NOT NULL THEN
        INSERT INTO document.schedule_line (
            tenant_id, source_doc_type, source_doc_id, source_line_id,
            schedule_no, schedule_kind,
            scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
            version_number, is_current_version,
            metadata, status, created_by
        )
        SELECT
            NEW.tenant_id,
            'commitment_line',
            NEW.commitment_id,
            NEW.id,
            row_number() OVER (ORDER BY pr_sl.schedule_no)::smallint,
            pr_sl.schedule_kind,
            pr_sl.scheduled_quantity,
            pr_sl.scheduled_quantity * NEW.unit_price,
            pr_sl.scheduled_date,
            NEW.currency_code,
            1,
            true,
            jsonb_build_object(
                'source', 'trigger_copy_from_pr',
                'copied_from_pr_schedule_id', pr_sl.id
            ),
            'active',
            NEW.created_by
          FROM document.schedule_line pr_sl
         WHERE pr_sl.tenant_id          = NEW.tenant_id
           AND pr_sl.source_doc_type    = 'purchase_requisition_line'
           AND pr_sl.source_line_id     = NEW.requisition_line_id
           AND pr_sl.is_current_version = true
           AND pr_sl.terminal_status    IS NULL
         ORDER BY pr_sl.schedule_no;

        GET DIAGNOSTICS v_copied = ROW_COUNT;
    END IF;

    -- Fallback when no PR or no PR schedules copied — write a single default
    IF v_copied = 0 THEN
        v_scheduled_date := COALESCE(NEW.required_by_date, CURRENT_DATE);
        INSERT INTO document.schedule_line (
            tenant_id, source_doc_type, source_doc_id, source_line_id,
            schedule_no, schedule_kind,
            scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
            version_number, is_current_version,
            metadata, status, created_by
        ) VALUES (
            NEW.tenant_id,
            'commitment_line',
            NEW.commitment_id,
            NEW.id,
            1::smallint,
            'delivery',
            NEW.quantity,
            NEW.quantity * NEW.unit_price,
            v_scheduled_date,
            NEW.currency_code,
            1,
            true,
            jsonb_build_object('source', 'trigger_default'),
            'active',
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commitment_line_default_schedule ON document.commitment_line;
CREATE TRIGGER trg_commitment_line_default_schedule
    AFTER INSERT ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_commitment_line_default_schedule();


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  PI line — billing_milestone schedule for non-PO invoices only
-- ─────────────────────────────────────────────────────────────────────────────
-- PO-based PI lines are tracked via the commitment_line schedules upstream —
-- no PI-line-level schedule needed. Non-PO PI lines get a billing_milestone
-- schedule iff the line carries a metadata.milestone_date hint.
--
-- COMPATIBILITY FALLBACK:
-- New user-visible schedule defaulting should be created by the Meta Entity
-- resolver/service layer (schedule.from_payment_terms / schedule.from_reference).
-- This trigger remains for generic/import writers that insert PI lines directly.

DROP TRIGGER IF EXISTS trg_pi_line_default_schedule ON document.purchase_invoice_line;
DROP FUNCTION IF EXISTS document.trg_pi_line_default_schedule();


COMMENT ON FUNCTION document.trg_pr_line_default_schedule()         IS 'AFTER INSERT on purchase_requisition_line — creates default delivery schedule_line if not already present.';
COMMENT ON FUNCTION document.trg_commitment_line_default_schedule() IS 'AFTER INSERT on commitment_line — copies PR schedules on PR→PO conversion, else creates a default delivery schedule_line.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  UPDATE-side refresh — keep the single default schedule in sync
-- ─────────────────────────────────────────────────────────────────────────────
-- Review R2 Fix 4: the AFTER INSERT triggers (§1-3) create the default
-- schedule, but if the user later edits scheduling-driving fields on the
-- line (quantity, dates, unit_price) the schedule rows stay frozen at
-- their original values. That silently de-syncs commitment_schedule on
-- PO approve.
--
-- Strategy: on UPDATE OF the driving columns, refresh in place IFF
--   (a) exactly one current-version schedule exists for this line, AND
--   (b) that schedule was created by the default trigger
--       (metadata->>'source' IN ('trigger_default', 'trigger_copy_from_pr'))
-- Multi-schedule lines (caller used schedule-line.service.ts to split)
-- are left alone — those callers own the schedule plan and must update
-- via the writer service.

CREATE OR REPLACE FUNCTION document.trg_pr_line_refresh_default_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
    v_id    uuid;
BEGIN
    SELECT count(*), max(id::text)::uuid
      INTO v_count, v_id
      FROM document.schedule_line
     WHERE tenant_id          = NEW.tenant_id
       AND source_doc_type    = 'purchase_requisition_line'
       AND source_line_id     = NEW.id
       AND is_current_version = true
       AND terminal_status    IS NULL
       AND metadata->>'source' IN ('trigger_default', 'trigger_copy_from_pr');

    IF v_count <> 1 THEN
        RETURN NEW;
    END IF;

    UPDATE document.schedule_line
       SET scheduled_quantity = NEW.quantity,
           scheduled_date     = COALESCE(NEW.required_by_date, scheduled_date),
           currency_code      = NEW.currency_code,
           updated_at         = now(),
           updated_by         = COALESCE(NEW.updated_by, NEW.created_by),
           row_version        = row_version + 1
     WHERE id = v_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pr_line_refresh_default_schedule ON document.purchase_requisition_line;
CREATE TRIGGER trg_pr_line_refresh_default_schedule
    AFTER UPDATE OF quantity, required_by_date, currency_code
    ON document.purchase_requisition_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_pr_line_refresh_default_schedule();


CREATE OR REPLACE FUNCTION document.trg_commitment_line_refresh_default_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
    v_id    uuid;
BEGIN
    SELECT count(*), max(id::text)::uuid
      INTO v_count, v_id
      FROM document.schedule_line
     WHERE tenant_id          = NEW.tenant_id
       AND source_doc_type    = 'commitment_line'
       AND source_line_id     = NEW.id
       AND is_current_version = true
       AND terminal_status    IS NULL
       AND metadata->>'source' IN ('trigger_default', 'trigger_copy_from_pr');

    IF v_count <> 1 THEN
        RETURN NEW;
    END IF;

    UPDATE document.schedule_line
       SET scheduled_quantity = NEW.quantity,
           scheduled_amount   = NEW.quantity * NEW.unit_price,
           scheduled_date     = COALESCE(NEW.required_by_date, scheduled_date),
           currency_code      = NEW.currency_code,
           updated_at         = now(),
           updated_by         = COALESCE(NEW.updated_by, NEW.created_by),
           row_version        = row_version + 1
     WHERE id = v_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commitment_line_refresh_default_schedule ON document.commitment_line;
CREATE TRIGGER trg_commitment_line_refresh_default_schedule
    AFTER UPDATE OF quantity, unit_price, required_by_date, currency_code
    ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.trg_commitment_line_refresh_default_schedule();


DROP TRIGGER IF EXISTS trg_pi_line_refresh_default_schedule ON document.purchase_invoice_line;
DROP FUNCTION IF EXISTS document.trg_pi_line_refresh_default_schedule();


COMMENT ON FUNCTION document.trg_pr_line_refresh_default_schedule()         IS 'AFTER UPDATE on PR line — refreshes the single trigger-default schedule_line in place and no-ops when multiple schedules or writer-service schedules exist.';
COMMENT ON FUNCTION document.trg_commitment_line_refresh_default_schedule() IS 'AFTER UPDATE on commitment_line — refreshes the single trigger-default schedule_line in place and no-ops when multiple schedules or writer-service schedules exist. User-visible schedule refresh belongs in schedule.* Meta Entity resolvers.';
