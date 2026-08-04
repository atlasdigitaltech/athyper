DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.sourcing_event,
            document.sourcing_event_company,
            document.sourcing_event_demand,
            document.sourcing_event_award,
            document.sourcing_event_award_allocation,
            document.sourcing_event_intercompany_allocation
        TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.sourcing_event,
            document.sourcing_event_company,
            document.sourcing_event_demand,
            document.sourcing_event_award,
            document.sourcing_event_award_allocation,
            document.sourcing_event_intercompany_allocation
        TO athyperadmin;
    END IF;
END;
$$;
