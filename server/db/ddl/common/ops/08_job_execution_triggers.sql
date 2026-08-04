CREATE TRIGGER job_execution_updated_at
    BEFORE UPDATE ON ops.job_execution
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
