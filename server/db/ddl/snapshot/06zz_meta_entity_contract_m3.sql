-- M3 plane descriptors are append-only, like snapshot.entity_compiled.
DROP TRIGGER IF EXISTS trg_epc_immutable ON snapshot.entity_plane_compiled;
CREATE TRIGGER trg_epc_immutable
    BEFORE UPDATE OR DELETE ON snapshot.entity_plane_compiled
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();

