-- ============================================================================
-- document/06y_schedule_line_triggers.sql
-- Concept: Phase 2 tail — fulfillment cache sync for document.schedule_line.
--          Triggers fire on downstream line writes (receipt_line,
--          service_sheet_line) and re-aggregate schedule_line.fulfilled_quantity
--          + fulfillment_status per the contract in docs/architecture/p2p.md §5.
-- Depends on: 01v_tables_schedule_line.sql, 01j_tables_p2p.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  document.fn_schedule_line_recompute_commitment_line
-- ─────────────────────────────────────────────────────────────────────────────
-- Re-aggregates fulfillment from receipt_line + service_sheet_line for a
-- specific commitment_line and allocates the total sequentially across
-- current-version commitment_line schedule_lines owned by that line.
--
-- Allocation rule (review finding P1 fix):
--   Walk schedules in scheduled_date ASC (then schedule_no ASC). Each
--   schedule consumes up to scheduled_quantity from the line-total pool,
--   passing the residue to the next schedule. So:
--     - 1 schedule line × scheduled=300, received=250 → fulfilled=250
--     - 3 schedule lines × scheduled=100 each (Jan / Feb / Mar), received=250
--       → Jan fulfilled=100, Feb fulfilled=100, Mar fulfilled=50
--   This respects the CHECK constraint fulfilled_quantity <= scheduled_quantity
--   per row, and over-receipt is surfaced as a NOTICE rather than aborting.
--
-- Quantity source:
--   receipt_line.accepted_quantity        (NOT received_quantity — rejected
--                                          and damaged qty must NOT count
--                                          as fulfilled)
--   service_sheet_line.quantity           (services have no accept/reject split)
--
-- Phase 1 line cleanup removed receipt_line.status and service_sheet_line.status.
-- Fulfillment is derived from the current downstream line quantities.

CREATE OR REPLACE FUNCTION document.fn_schedule_line_recompute_commitment_line(
    p_commitment_line_id uuid,
    p_tenant_id          uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_total      numeric(18,4);
    v_remaining  numeric(18,4);
    v_schedule   record;
    v_assigned   numeric(18,4);
BEGIN
    -- Aggregate fulfilled quantity from downstream consumers
    SELECT
        COALESCE((
            SELECT SUM(rcpl.accepted_quantity)
              FROM document.receipt_line rcpl
             WHERE rcpl.commitment_line_id = p_commitment_line_id
               AND rcpl.tenant_id          = p_tenant_id
        ), 0)
      + COALESCE((
            SELECT SUM(sshl.quantity)
              FROM document.service_sheet_line sshl
             WHERE sshl.commitment_line_id = p_commitment_line_id
               AND sshl.tenant_id          = p_tenant_id
        ), 0)
    INTO v_total;

    v_remaining := GREATEST(v_total, 0);

    -- Walk current schedules in due-date order and consume sequentially.
    -- FOR UPDATE locks each row to prevent concurrent recomputes from
    -- racing on the same commitment_line.
    FOR v_schedule IN
        SELECT id, scheduled_quantity
          FROM document.schedule_line
         WHERE source_doc_type    = 'commitment_line'
           AND source_line_id     = p_commitment_line_id
           AND tenant_id          = p_tenant_id
           AND is_current_version = true
           AND terminal_status    IS NULL
         ORDER BY scheduled_date ASC, schedule_no ASC
         FOR UPDATE
    LOOP
        v_assigned := LEAST(v_remaining, v_schedule.scheduled_quantity);
        v_assigned := GREATEST(v_assigned, 0);

        UPDATE document.schedule_line
           SET fulfilled_quantity = v_assigned,
               fulfillment_status = CASE
                   WHEN v_assigned <= 0                                      THEN 'open'
                   WHEN v_assigned >= scheduled_quantity                     THEN 'fulfilled'
                   ELSE                                                           'partial'
               END,
               updated_at         = now(),
               updated_by         = COALESCE(updated_by, created_by),
               row_version        = row_version + 1
         WHERE id = v_schedule.id;

        v_remaining := v_remaining - v_assigned;
    END LOOP;

    -- Over-receipt is a real business condition (e.g. supplier shipped
    -- extra) — surface via NOTICE so it shows up in DB logs without
    -- aborting the upstream receipt write.
    IF v_remaining > 0 THEN
        RAISE NOTICE 'schedule_line over-receipt on commitment_line %: % surplus units after sequential allocation',
            p_commitment_line_id, v_remaining;
    END IF;
END;
$$;

COMMENT ON FUNCTION document.fn_schedule_line_recompute_commitment_line(uuid, uuid) IS
    'Recomputes fulfilled_quantity + fulfillment_status for current-version '
    'commitment_line schedules owned by p_commitment_line_id. Aggregates '
    'receipt_line.accepted_quantity + service_sheet_line.quantity and allocates '
    'sequentially by scheduled_date ASC. '
    'Over-receipt surfaces as a NOTICE without aborting.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Trigger function — receipt_line fan-out
-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER INSERT/UPDATE/DELETE on receipt_line. Looks up the affected
-- commitment_line(s) and delegates the recompute. Handles the OLD/NEW change
-- of commitment_line_id (rare but possible during line corrections).

CREATE OR REPLACE FUNCTION document.trg_schedule_line_fulfilled_from_rcpl()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Recompute against the NEW commitment_line on INSERT/UPDATE
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.commitment_line_id IS NOT NULL THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            NEW.commitment_line_id,
            NEW.tenant_id
        );
    END IF;

    -- Also recompute the OLD commitment_line on UPDATE (if it changed) or DELETE
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.commitment_line_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.commitment_line_id IS DISTINCT FROM NEW.commitment_line_id)
    THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            OLD.commitment_line_id,
            OLD.tenant_id
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_line_fulfilled_from_rcpl ON document.receipt_line;
CREATE TRIGGER trg_schedule_line_fulfilled_from_rcpl
    AFTER INSERT
       OR UPDATE OF received_quantity, accepted_quantity, rejected_quantity,
                    commitment_line_id
       OR DELETE
    ON document.receipt_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_schedule_line_fulfilled_from_rcpl();


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Trigger function — service_sheet_line fan-out
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION document.trg_schedule_line_fulfilled_from_sshl()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.commitment_line_id IS NOT NULL THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            NEW.commitment_line_id,
            NEW.tenant_id
        );
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.commitment_line_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.commitment_line_id IS DISTINCT FROM NEW.commitment_line_id)
    THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            OLD.commitment_line_id,
            OLD.tenant_id
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_line_fulfilled_from_sshl ON document.service_sheet_line;
CREATE TRIGGER trg_schedule_line_fulfilled_from_sshl
    AFTER INSERT OR UPDATE OF quantity, commitment_line_id OR DELETE
    ON document.service_sheet_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_schedule_line_fulfilled_from_sshl();


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  updated_at trigger on schedule_line (same as other document tables)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_schl_updated_at ON document.schedule_line;
CREATE TRIGGER trg_schl_updated_at BEFORE UPDATE ON document.schedule_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
