CREATE TRIGGER mfa_credential_projection_updated_at
    BEFORE UPDATE ON runtime_meta.mfa_credential_projection
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
