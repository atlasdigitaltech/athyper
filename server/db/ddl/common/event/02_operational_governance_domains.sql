DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event' AND t.typname = 'notification_status_d'
  ) THEN
    CREATE DOMAIN event.notification_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event' AND t.typname = 'delivery_status_d'
  ) THEN
    CREATE DOMAIN event.delivery_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event' AND t.typname = 'outbox_status_d'
  ) THEN
    CREATE DOMAIN event.outbox_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event' AND t.typname = 'consent_action_d'
  ) THEN
    CREATE DOMAIN event.consent_action_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'event' AND t.typname = 'command_execution_status_d'
  ) THEN
    CREATE DOMAIN event.command_execution_status_d AS text;
  END IF;
END $$;

ALTER DOMAIN event.notification_status_d DROP CONSTRAINT IF EXISTS notification_status_d_check;
ALTER DOMAIN event.notification_status_d ADD CONSTRAINT notification_status_d_check
    CHECK (VALUE IN ('pending', 'processing', 'sent', 'partially_sent', 'failed', 'cancelled'));
ALTER DOMAIN event.delivery_status_d DROP CONSTRAINT IF EXISTS delivery_status_d_check;
ALTER DOMAIN event.delivery_status_d ADD CONSTRAINT delivery_status_d_check
    CHECK (VALUE IN ('pending', 'claimed', 'sent', 'delivered', 'failed', 'cancelled'));
ALTER DOMAIN event.outbox_status_d DROP CONSTRAINT IF EXISTS outbox_status_d_check;
ALTER DOMAIN event.outbox_status_d ADD CONSTRAINT outbox_status_d_check
    CHECK (VALUE IN ('pending','processing','completed','failed','dead_letter','claimed','published'));
ALTER DOMAIN event.consent_action_d DROP CONSTRAINT IF EXISTS consent_action_d_check;
ALTER DOMAIN event.consent_action_d ADD CONSTRAINT consent_action_d_check
    CHECK (VALUE IN ('granted', 'revoked', 'expired', 'suppressed'));
ALTER DOMAIN event.command_execution_status_d DROP CONSTRAINT IF EXISTS command_execution_status_d_check;
ALTER DOMAIN event.command_execution_status_d ADD CONSTRAINT command_execution_status_d_check
    CHECK (VALUE IN (
        'received', 'processing', 'succeeded', 'failed', 'cancelled', 'expired'
    ));
