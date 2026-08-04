-- ============================================================================
-- snapshot/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_content_item_version_immutable BEFORE DELETE OR UPDATE ON snapshot.content_item_version FOR EACH ROW EXECUTE FUNCTION snapshot.trg_content_item_version_immutable();

CREATE TRIGGER trg_document_snapshot_immutable BEFORE DELETE OR UPDATE ON snapshot.document_snapshot FOR EACH ROW EXECUTE FUNCTION snapshot.trg_document_snapshot_immutable();

CREATE TRIGGER trg_document_snapshot_immutable BEFORE DELETE OR UPDATE ON snapshot.document_snapshot_default FOR EACH ROW EXECUTE FUNCTION snapshot.trg_document_snapshot_immutable();

CREATE TRIGGER trg_ec_immutable BEFORE DELETE OR UPDATE ON snapshot.entity_compiled FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();

CREATE TRIGGER trg_eco_immutable BEFORE DELETE OR UPDATE ON snapshot.entity_compiled_overlay FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();

CREATE TRIGGER trg_epc_immutable BEFORE DELETE OR UPDATE ON snapshot.entity_plane_compiled FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();

CREATE TRIGGER trg_template_version_immutable BEFORE DELETE OR UPDATE ON snapshot.template_version FOR EACH ROW EXECUTE FUNCTION snapshot.trg_template_version_immutable();

CREATE TRIGGER trg_template_version_validate_variables BEFORE INSERT OR UPDATE OF variables_schema ON snapshot.template_version FOR EACH ROW EXECUTE FUNCTION document.trg_validate_variables_schema();
