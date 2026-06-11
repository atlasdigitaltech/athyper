-- ============================================================================
-- document/01z_drop_is_on_hold.sql
-- Phase: Hold Model A — single source of truth is purchase_invoice.status='on_hold'.
-- Restoration state moves to purchase_invoice.metadata.hold.previous_status.
-- Depends on: 01e_tables_invoice.sql, 01z_row_version.sql, 04_indexes.sql
-- ============================================================================

-- Step 1: Drift backfill. Any row where is_on_hold=true but status<>'on_hold' is
--         reconciled into the on_hold status. The prior status is captured into
--         metadata.hold.previous_status so a future release can restore it.
DO $$
DECLARE
    drift_count integer;
BEGIN
    -- Skip the entire block if the column has already been dropped (re-runs).
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'document'
           AND table_name   = 'purchase_invoice'
           AND column_name  = 'is_on_hold'
    ) THEN
        RAISE NOTICE 'is_on_hold already dropped — skipping backfill.';
        RETURN;
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM document.purchase_invoice '
            'WHERE is_on_hold = true AND status <> ''on_hold'''
       INTO drift_count;

    IF drift_count > 0 THEN
        RAISE NOTICE 'is_on_hold drift: % rows where is_on_hold=true and status<>on_hold. '
                     'Capturing prior status into metadata.hold and switching to on_hold.', drift_count;
        EXECUTE $upd$
            UPDATE document.purchase_invoice
               SET metadata          = jsonb_set(
                                         COALESCE(metadata, '{}'::jsonb),
                                         '{hold}',
                                         jsonb_build_object(
                                           'previous_status', status,
                                           'held_at',         COALESCE(status_changed_at, now()),
                                           'held_by',         status_changed_by,
                                           'backfilled',      true
                                         ),
                                         true),
                   status            = 'on_hold',
                   status_changed_at = COALESCE(status_changed_at, now())
             WHERE is_on_hold = true AND status <> 'on_hold'
        $upd$;
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM document.purchase_invoice '
            'WHERE status = ''on_hold'' AND is_on_hold = false'
       INTO drift_count;

    IF drift_count > 0 THEN
        RAISE NOTICE 'Inverse drift: % rows status=on_hold but is_on_hold=false. '
                     'No action — status is authoritative under Model A.', drift_count;
    END IF;
END $$;

-- Step 2: Drop the partial index that references is_on_hold (from 04_indexes.sql).
--         Cannot drop the column while the index references it.
DROP INDEX IF EXISTS document.pi_on_hold_idx;

-- Step 3: Drop the column. Idempotent — DROP COLUMN IF EXISTS is a no-op when
--         the column has already been removed.
ALTER TABLE document.purchase_invoice
    DROP COLUMN IF EXISTS is_on_hold;

-- Step 4: Replace the dropped index with a status-driven equivalent so on-hold
--         lookups remain cheap (matches the original pi_on_hold_idx filter).
CREATE INDEX IF NOT EXISTS pi_status_on_hold_idx
    ON document.purchase_invoice (tenant_id)
    WHERE status = 'on_hold';
