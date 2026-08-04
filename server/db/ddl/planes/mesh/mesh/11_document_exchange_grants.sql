REVOKE ALL ON
    mesh.document_envelope,
    mesh.document_payload,
    mesh.document_event,
    mesh.document_acknowledgement
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
    mesh.trg_validate_document_envelope(),
    mesh.trg_guard_document_envelope(),
    mesh.trg_guard_document_payload(),
    mesh.trg_guard_append_only_document_child(),
    mesh.trg_validate_document_child_participant()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON mesh.document_envelope TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON mesh.document_payload TO athyperapp;
        GRANT SELECT, INSERT ON
            mesh.document_event,
            mesh.document_acknowledgement
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            mesh.document_envelope,
            mesh.document_payload,
            mesh.document_event,
            mesh.document_acknowledgement
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            mesh.trg_validate_document_envelope(),
            mesh.trg_guard_document_envelope(),
            mesh.trg_guard_document_payload(),
            mesh.trg_guard_append_only_document_child(),
            mesh.trg_validate_document_child_participant()
        TO athyperadmin;
    END IF;
END;
$$;
