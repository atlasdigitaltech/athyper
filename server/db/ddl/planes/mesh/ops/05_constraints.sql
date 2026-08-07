ALTER TABLE ops.reference_sync_checkpoint
    ADD CONSTRAINT reference_sync_checkpoint_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT reference_sync_checkpoint_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
