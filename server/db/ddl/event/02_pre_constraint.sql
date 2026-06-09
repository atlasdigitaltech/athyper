-- ============================================================================
-- event/02_pre_constraint.sql
-- Concept: Event Pre-Constraints — no functions required
-- Depends on: 04_tables/007_event.sql
-- Idempotent compatibility upgrades for existing databases.
-- ============================================================================

ALTER TABLE event.notification_delivery
    ADD COLUMN IF NOT EXISTS outbox_id uuid;

ALTER TABLE event.notification_delivery
    ALTER COLUMN message_id DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE event.notification_delivery
        ADD CONSTRAINT ndlv_origin_chk
        CHECK (message_id IS NOT NULL OR (channel = 'webhook' AND outbox_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
