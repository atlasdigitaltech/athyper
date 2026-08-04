ALTER TABLE master.party_risk_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_assessment FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_dimension_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_dimension_score FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_driver ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_driver FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_mitigation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_mitigation FORCE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_review_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.party_risk_review_event FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'party_risk_assessment',
        'party_risk_dimension_score',
        'party_risk_evidence',
        'party_risk_driver',
        'party_risk_mitigation',
        'party_risk_review_event'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I '
            'FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I '
            'FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;
