-- ============================================================================
-- event/06_triggers.sql
-- Concept: Event Triggers — outbox-to-webhook routing and orchestration triggers
-- Depends on: 04_tables/007_event.sql and sub-tables, 08_functions/007_event.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================


-- ============================================================================
-- A. UPDATED_AT STAMPS (mutable tables only)
-- ============================================================================

-- notification_message
DROP TRIGGER IF EXISTS trg_nmsg_updated_at ON event.notification_message;
CREATE TRIGGER trg_nmsg_updated_at
    BEFORE UPDATE ON event.notification_message
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- notification_delivery (partitioned — fires on all children via parent trigger)
DROP TRIGGER IF EXISTS trg_ndlv_updated_at ON event.notification_delivery;
CREATE TRIGGER trg_ndlv_updated_at
    BEFORE UPDATE ON event.notification_delivery
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- digest_staging: no updated_at column — simple work queue, no trigger needed.


-- ============================================================================
-- B. LOOKUP VALIDATION TRIGGERS
-- ============================================================================

-- notification_message.priority
DROP TRIGGER IF EXISTS trg_nmsg_priority_lookup ON event.notification_message;
CREATE TRIGGER trg_nmsg_priority_lookup
    BEFORE INSERT OR UPDATE OF priority ON event.notification_message
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.priority', 'priority');

-- notification_delivery.channel
DROP TRIGGER IF EXISTS trg_ndlv_channel_lookup ON event.notification_delivery;
CREATE TRIGGER trg_ndlv_channel_lookup
    BEFORE INSERT OR UPDATE OF channel ON event.notification_delivery
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.channel', 'channel');

-- digest_staging.channel
DROP TRIGGER IF EXISTS trg_ds_channel_lookup ON event.digest_staging;
CREATE TRIGGER trg_ds_channel_lookup
    BEFORE INSERT OR UPDATE OF channel ON event.digest_staging
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.channel', 'channel');

-- digest_staging.priority
DROP TRIGGER IF EXISTS trg_ds_priority_lookup ON event.digest_staging;
CREATE TRIGGER trg_ds_priority_lookup
    BEFORE INSERT OR UPDATE OF priority ON event.digest_staging
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.priority', 'priority');

-- digest_staging.frequency
DROP TRIGGER IF EXISTS trg_ds_frequency_lookup ON event.digest_staging;
CREATE TRIGGER trg_ds_frequency_lookup
    BEFORE INSERT OR UPDATE OF frequency ON event.digest_staging
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.digest_frequency', 'frequency');


-- ============================================================================
-- C. MESSAGE COUNTER CONSISTENCY GUARD
-- ============================================================================
-- Prevents delivered_count + failed_count from exceeding recipient_count.
-- Runs on UPDATE only (counters are incremented by delivery worker).

CREATE OR REPLACE FUNCTION event.trg_guard_notification_message_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = event
AS $$
BEGIN
    IF NEW.delivered_count + NEW.failed_count > NEW.recipient_count THEN
        RAISE EXCEPTION
            'event.notification_message: delivered_count (%) + failed_count (%) '
            'cannot exceed recipient_count (%).',
            NEW.delivered_count, NEW.failed_count, NEW.recipient_count
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nmsg_counts_guard ON event.notification_message;
CREATE TRIGGER trg_nmsg_counts_guard
    BEFORE UPDATE OF delivered_count, failed_count, recipient_count
    ON event.notification_message
    FOR EACH ROW EXECUTE FUNCTION event.trg_guard_notification_message_counts();
