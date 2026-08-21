-- Mesh-only certification validation resolves exclusively through trusted schemas.
ALTER FUNCTION mesh.trg_validate_certification_type_scope()
    SET search_path = pg_catalog, mesh, master, shared;
