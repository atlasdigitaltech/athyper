ALTER TABLE ops.reference_sync_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.reference_sync_checkpoint FORCE ROW LEVEL SECURITY;
CREATE POLICY reference_sync_checkpoint_admin_access
    ON ops.reference_sync_checkpoint
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
