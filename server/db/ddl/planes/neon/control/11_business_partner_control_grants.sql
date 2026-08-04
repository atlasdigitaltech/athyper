REVOKE ALL ON
    control.business_partner_qualification,
    control.business_partner_block
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.business_partner_qualification,
            control.business_partner_block
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.business_partner_qualification,
            control.business_partner_block
        TO athyperadmin;
    END IF;
END;
$$;
