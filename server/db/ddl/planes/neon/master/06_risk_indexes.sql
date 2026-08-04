CREATE INDEX risk_dimension_category_idx
    ON master.risk_dimension (category, ordinal)
    WHERE status = 'active';

CREATE INDEX risk_driver_registry_dimension_idx
    ON master.risk_driver_registry (default_dimension_code)
    WHERE default_dimension_code IS NOT NULL;

CREATE INDEX risk_model_context_effective_idx
    ON master.risk_model (applicable_context, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX risk_model_dimension_order_idx
    ON master.risk_model_dimension (model_code, model_version, ordinal);

CREATE INDEX party_risk_assessment_business_partner_idx
    ON master.party_risk_assessment (
        tenant_id, business_partner_id, assessment_context
    );
CREATE UNIQUE INDEX party_risk_assessment_approved_context_uq
    ON master.party_risk_assessment (
        tenant_id, subject_type, subject_id, assessment_context
    )
    WHERE status = 'approved';
CREATE INDEX party_risk_assessment_review_due_idx
    ON master.party_risk_assessment (tenant_id, next_review_at)
    WHERE status = 'approved' AND next_review_at IS NOT NULL;

CREATE INDEX party_risk_dimension_score_assessment_idx
    ON master.party_risk_dimension_score (tenant_id, assessment_id);

CREATE INDEX party_risk_evidence_business_partner_idx
    ON master.party_risk_evidence (tenant_id, business_partner_id, status);
CREATE INDEX party_risk_evidence_subject_idx
    ON master.party_risk_evidence (tenant_id, subject_type, subject_id);
CREATE INDEX party_risk_evidence_source_date_idx
    ON master.party_risk_evidence (
        tenant_id, source_code, evidence_date DESC
    );
CREATE UNIQUE INDEX party_risk_evidence_source_reference_uq
    ON master.party_risk_evidence (
        tenant_id, business_partner_id, source_code, source_reference
    )
    WHERE source_reference IS NOT NULL AND status <> 'superseded';

CREATE INDEX party_risk_driver_assessment_idx
    ON master.party_risk_driver (tenant_id, assessment_id);
CREATE INDEX party_risk_driver_dimension_score_idx
    ON master.party_risk_driver (tenant_id, dimension_score_id)
    WHERE dimension_score_id IS NOT NULL;
CREATE INDEX party_risk_driver_evidence_idx
    ON master.party_risk_driver (tenant_id, evidence_id)
    WHERE evidence_id IS NOT NULL;

CREATE INDEX party_risk_mitigation_business_partner_idx
    ON master.party_risk_mitigation (tenant_id, business_partner_id, status);
CREATE INDEX party_risk_mitigation_assessment_idx
    ON master.party_risk_mitigation (tenant_id, assessment_id)
    WHERE assessment_id IS NOT NULL;
CREATE INDEX party_risk_mitigation_overdue_idx
    ON master.party_risk_mitigation (tenant_id, due_date)
    WHERE status IN ('approved', 'in_progress') AND due_date IS NOT NULL;

CREATE INDEX party_risk_review_event_assessment_idx
    ON master.party_risk_review_event (
        tenant_id, assessment_id, created_at DESC
    );
CREATE INDEX party_risk_review_event_tenant_idx
    ON master.party_risk_review_event (tenant_id, created_at DESC);
