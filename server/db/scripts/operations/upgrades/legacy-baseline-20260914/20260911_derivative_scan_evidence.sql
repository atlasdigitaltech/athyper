BEGIN;
SET LOCAL lock_timeout='5s';

-- Derivatives (previews/thumbnails) were never scanned before being marked ready. This adds a
-- quarantined status plus explicit scan evidence so admission can reject un-scanned output and a
-- backfill job can find existing ready derivatives that predate the check.
ALTER DOMAIN document.attachment_derivative_status_d DROP CONSTRAINT IF EXISTS attachment_derivative_status_d_check;
ALTER DOMAIN document.attachment_derivative_status_d ADD CONSTRAINT attachment_derivative_status_d_check
    CHECK (VALUE IN ('pending', 'processing', 'ready', 'quarantined', 'skipped', 'failed', 'deleted'));

ALTER TABLE document.attachment_derivative
    ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
    ADD COLUMN IF NOT EXISTS scan_status text;

ALTER TABLE document.attachment_derivative
    DROP CONSTRAINT IF EXISTS attachment_derivative_scan_status_chk;
ALTER TABLE document.attachment_derivative
    ADD CONSTRAINT attachment_derivative_scan_status_chk
        CHECK (scan_status IS NULL OR scan_status IN ('clean', 'quarantined'));

CREATE INDEX IF NOT EXISTS attachment_derivative_scan_pending_idx
    ON document.attachment_derivative (tenant_id, id)
    WHERE status = 'ready' AND scanned_at IS NULL;

COMMIT;
