-- Runtime access is intentionally broad during Finance Setup Phase 2; RLS keeps
-- all mutations inside the active tenant. Phase 3 adds scope permissions.
GRANT SELECT, INSERT, UPDATE, DELETE ON control.posting_role_alias TO athyperapp;
GRANT SELECT, INSERT, UPDATE, DELETE ON control.posting_role_account_map TO athyperapp;

DO $$ BEGIN
    ALTER FUNCTION control.canonical_posting_role_code(uuid, text) OWNER TO athyperadmin;
    ALTER FUNCTION control.trg_validate_posting_role_account_map() OWNER TO athyperadmin;
    ALTER FUNCTION control.resolve_posting_role_account_trace(uuid, text, uuid, text, date) OWNER TO athyperadmin;
    ALTER FUNCTION control.resolve_posting_role_account(uuid, text, uuid, text, date) OWNER TO athyperadmin;
END $$;

REVOKE ALL ON FUNCTION control.canonical_posting_role_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION control.resolve_posting_role_account_trace(uuid, text, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION control.resolve_posting_role_account(uuid, text, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.canonical_posting_role_code(uuid, text) TO athyperapp;
GRANT EXECUTE ON FUNCTION control.resolve_posting_role_account_trace(uuid, text, uuid, text, date) TO athyperapp;
GRANT EXECUTE ON FUNCTION control.resolve_posting_role_account(uuid, text, uuid, text, date) TO athyperapp;

