-- ============================================================================
-- event/03g_authorization_change_capture_constraints.sql
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE event.authorization_change_transaction
        ADD CONSTRAINT authorization_change_transaction_clock_fk
        FOREIGN KEY (source_database_id)
        REFERENCES event.authorization_capture_clock (source_database_id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE event.authorization_change_event
        ADD CONSTRAINT authorization_change_event_transaction_fk
        FOREIGN KEY (source_database_id, source_txid)
        REFERENCES event.authorization_change_transaction (
            source_database_id, source_txid
        )
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE event.authorization_projection_checkpoint
        ADD CONSTRAINT authorization_projection_checkpoint_run_fk
        FOREIGN KEY (migration_run_id)
        REFERENCES control.authorization_migration_run (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE event.authorization_snapshot_marker
        ADD CONSTRAINT authorization_snapshot_marker_run_fk
        FOREIGN KEY (migration_run_id)
        REFERENCES control.authorization_migration_run (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE event.authorization_snapshot_marker
        ADD CONSTRAINT authorization_snapshot_marker_clock_fk
        FOREIGN KEY (source_database_id)
        REFERENCES event.authorization_capture_clock (source_database_id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

