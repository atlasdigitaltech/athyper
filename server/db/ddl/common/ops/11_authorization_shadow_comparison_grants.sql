REVOKE ALL ON ops.authorization_shadow_comparison FROM PUBLIC;
REVOKE ALL ON ops.authorization_shadow_qualification_v FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.trg_guard_authorization_shadow_comparison() FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT INSERT ON ops.authorization_shadow_comparison TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT SELECT,INSERT ON ops.authorization_shadow_comparison TO athyperadmin;
        GRANT SELECT ON ops.authorization_shadow_qualification_v TO athyperadmin;
        GRANT EXECUTE ON FUNCTION ops.trg_guard_authorization_shadow_comparison() TO athyperadmin;
    END IF;
END $$;

