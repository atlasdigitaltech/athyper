DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            master.risk_dimension,
            master.risk_driver_registry,
            master.risk_model,
            master.risk_model_dimension,
            master.risk_source
        TO athyperapp;

        GRANT SELECT, INSERT, UPDATE ON
            master.party_risk_assessment,
            master.party_risk_dimension_score,
            master.party_risk_evidence
        TO athyperapp;

        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.party_risk_driver,
            master.party_risk_mitigation
        TO athyperapp;

        GRANT SELECT, INSERT ON
            master.party_risk_review_event
        TO athyperapp;

    END IF;
END;
$$;
