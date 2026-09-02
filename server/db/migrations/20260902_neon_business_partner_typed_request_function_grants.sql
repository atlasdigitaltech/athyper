-- S1: align upgraded databases with the canonical typed-request function boundary.
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_neon' THEN
        RAISE EXCEPTION 'Business Partner typed request grants must target athyper_neon';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION document.fn_business_partner_payload_has_restricted_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_guard_business_partner_request_payload_boundary() FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_guard_business_partner_request_extension() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT EXECUTE ON FUNCTION document.fn_business_partner_payload_has_restricted_key(jsonb) TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_payload_boundary() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_extension() TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT EXECUTE ON FUNCTION document.fn_business_partner_payload_has_restricted_key(jsonb) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_payload_boundary() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_extension() TO athyperadmin;
    END IF;
END;
$$;

COMMIT;
