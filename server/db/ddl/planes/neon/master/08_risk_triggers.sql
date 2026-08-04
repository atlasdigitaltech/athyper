CREATE TRIGGER trg_risk_model_immutable
BEFORE UPDATE ON master.risk_model
FOR EACH ROW
EXECUTE FUNCTION master.trg_risk_model_immutable();

CREATE TRIGGER trg_risk_model_dimension_immutable
BEFORE UPDATE OR DELETE ON master.risk_model_dimension
FOR EACH ROW
EXECUTE FUNCTION master.trg_risk_model_dimension_immutable();

CREATE CONSTRAINT TRIGGER trg_risk_model_weight_sum
AFTER INSERT OR UPDATE OR DELETE ON master.risk_model_dimension
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION master.trg_risk_model_weight_sum();

CREATE TRIGGER trg_party_risk_assessment_subject
BEFORE INSERT OR UPDATE OF
    tenant_id, subject_type, subject_id, business_partner_id
ON master.party_risk_assessment
FOR EACH ROW
EXECUTE FUNCTION master.trg_risk_subject_binding();

CREATE TRIGGER trg_party_risk_assessment_immutable
BEFORE UPDATE ON master.party_risk_assessment
FOR EACH ROW
EXECUTE FUNCTION master.trg_party_risk_assessment_immutable();

CREATE TRIGGER trg_party_risk_evidence_subject
BEFORE INSERT OR UPDATE OF
    tenant_id, subject_type, subject_id, business_partner_id
ON master.party_risk_evidence
FOR EACH ROW
EXECUTE FUNCTION master.trg_risk_subject_binding();

CREATE TRIGGER trg_party_risk_evidence_immutable
BEFORE UPDATE ON master.party_risk_evidence
FOR EACH ROW
EXECUTE FUNCTION master.trg_party_risk_evidence_immutable();

CREATE TRIGGER trg_party_risk_driver_consistency
BEFORE INSERT OR UPDATE OF
    tenant_id, assessment_id, dimension_score_id, evidence_id, dimension_code
ON master.party_risk_driver
FOR EACH ROW
EXECUTE FUNCTION master.trg_party_risk_driver_consistency();

CREATE TRIGGER trg_party_risk_mitigation_consistency
BEFORE INSERT OR UPDATE OF
    tenant_id, business_partner_id, assessment_id, driver_id
ON master.party_risk_mitigation
FOR EACH ROW
EXECUTE FUNCTION master.trg_party_risk_mitigation_consistency();

CREATE TRIGGER trg_party_risk_review_event_immutable
BEFORE UPDATE OR DELETE ON master.party_risk_review_event
FOR EACH ROW
EXECUTE FUNCTION master.trg_party_risk_review_event_immutable();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'party_risk_assessment',
        'party_risk_evidence',
        'party_risk_mitigation'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            'trg_' || v_table || '_updated_at',
            v_table
        );
    END LOOP;
END;
$$;
