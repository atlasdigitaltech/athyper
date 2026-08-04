CREATE TRIGGER trg_template_version_00_created_by
BEFORE INSERT ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_set_template_version_created_by();

CREATE TRIGGER trg_template_version_immutable
BEFORE UPDATE OR DELETE ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_template_version_mutation();
