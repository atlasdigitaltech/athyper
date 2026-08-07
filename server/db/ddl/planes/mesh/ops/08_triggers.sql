CREATE TRIGGER reference_sync_checkpoint_updated_at
    BEFORE UPDATE ON ops.reference_sync_checkpoint
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
