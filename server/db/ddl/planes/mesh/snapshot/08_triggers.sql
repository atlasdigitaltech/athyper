CREATE TRIGGER trg_template_version_00_created_by
BEFORE INSERT ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_set_template_version_created_by();

CREATE TRIGGER trg_template_version_immutable
BEFORE UPDATE OR DELETE ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_template_version_mutation();

CREATE TRIGGER trg_network_account_profile_publication_snapshot_immutable BEFORE UPDATE OR DELETE ON snapshot.network_account_profile_publication FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_network_profile_publication_mutation();
CREATE TRIGGER trg_bank_account_disclosure_snapshot_immutable BEFORE UPDATE OR DELETE ON snapshot.bank_account_disclosure FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_bank_disclosure_mutation();
