ALTER TABLE master.risk_driver_registry
    ADD CONSTRAINT risk_driver_registry_dimension_fk
    FOREIGN KEY (default_dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE SET NULL;

ALTER TABLE master.risk_model_dimension
    ADD CONSTRAINT risk_model_dimension_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version)
    ON DELETE CASCADE;
ALTER TABLE master.risk_model_dimension
    ADD CONSTRAINT risk_model_dimension_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_assessed_by_fk
    FOREIGN KEY (tenant_id, assessed_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_assessment
    ADD CONSTRAINT party_risk_assessment_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_dimension_score
    ADD CONSTRAINT party_risk_dimension_score_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_dimension_score
    ADD CONSTRAINT party_risk_dimension_score_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_source_fk
    FOREIGN KEY (source_code)
    REFERENCES master.risk_source (code)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by)
    REFERENCES master.party_risk_evidence (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_ingested_by_fk
    FOREIGN KEY (tenant_id, ingested_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_evidence
    ADD CONSTRAINT party_risk_evidence_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_dimension_score_fk
    FOREIGN KEY (tenant_id, dimension_score_id)
    REFERENCES master.party_risk_dimension_score (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_evidence_fk
    FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES master.party_risk_evidence (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_dimension_fk
    FOREIGN KEY (dimension_code)
    REFERENCES master.risk_dimension (code)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_registry_fk
    FOREIGN KEY (driver_code)
    REFERENCES master.risk_driver_registry (code)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_driver
    ADD CONSTRAINT party_risk_driver_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_driver_fk
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES master.party_risk_driver (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_assigned_to_fk
    FOREIGN KEY (tenant_id, assigned_to)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE SET NULL;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
ALTER TABLE master.party_risk_mitigation
    ADD CONSTRAINT party_risk_mitigation_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.party_risk_review_event
    ADD CONSTRAINT party_risk_review_event_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE master.party_risk_review_event
    ADD CONSTRAINT party_risk_review_event_actor_fk
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
