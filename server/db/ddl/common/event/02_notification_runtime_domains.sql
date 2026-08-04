-- Reconcile the core operational status vocabulary with the active workers.
-- This file can execute after bootstrap replay, where the base
-- event domains may not yet exist (for example after stale tracking
-- recovery), so create them defensively when missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event'
      AND t.typname = 'notification_status_d'
  ) THEN
    CREATE DOMAIN event.notification_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event'
      AND t.typname = 'delivery_status_d'
  ) THEN
    CREATE DOMAIN event.delivery_status_d AS text;
  END IF;
END $$;

ALTER DOMAIN event.notification_status_d DROP CONSTRAINT IF EXISTS notification_status_d_check;
ALTER DOMAIN event.notification_status_d ADD CONSTRAINT notification_status_d_check
    CHECK (VALUE IN ('pending','planning','processing','delivering','sent','completed','partially_sent','partial','failed','cancelled'));
ALTER DOMAIN event.delivery_status_d DROP CONSTRAINT IF EXISTS delivery_status_d_check;
ALTER DOMAIN event.delivery_status_d ADD CONSTRAINT delivery_status_d_check
    CHECK (VALUE IN ('pending','queued','claimed','sending','sent','delivered','bounced','failed','cancelled'));
