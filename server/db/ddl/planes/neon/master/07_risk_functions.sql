CREATE OR REPLACE FUNCTION master.trg_risk_subject_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_business_partner_id uuid;
BEGIN
    IF NEW.subject_type = 'business_partner' THEN
        IF NEW.subject_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject business_partner requires subject_id = business_partner_id'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF NEW.subject_type = 'supplier' THEN
        SELECT business_partner_id
          INTO v_business_partner_id
          FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.subject_id;
        IF NOT FOUND OR v_business_partner_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject supplier % is missing or belongs to another business partner',
                NEW.subject_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF NEW.subject_type = 'customer' THEN
        SELECT business_partner_id
          INTO v_business_partner_id
          FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.subject_id;
        IF NOT FOUND OR v_business_partner_id IS DISTINCT FROM NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject customer % is missing or belongs to another business partner',
                NEW.subject_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_risk_subject_binding() IS
  'Validates business-partner, supplier, and customer polymorphic subject bindings. Project engagement resolution remains capability-owned until its canonical aggregate is extracted.';

CREATE OR REPLACE FUNCTION master.trg_risk_model_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_weight numeric;
BEGIN
    IF OLD.status = 'active'
       AND (
           OLD.code IS DISTINCT FROM NEW.code
           OR OLD.version IS DISTINCT FROM NEW.version
           OR OLD.name IS DISTINCT FROM NEW.name
           OR OLD.description IS DISTINCT FROM NEW.description
           OR OLD.applicable_context IS DISTINCT FROM NEW.applicable_context
           OR OLD.scoring_algorithm IS DISTINCT FROM NEW.scoring_algorithm
           OR OLD.risk_band_thresholds IS DISTINCT FROM NEW.risk_band_thresholds
           OR OLD.config IS DISTINCT FROM NEW.config
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       ) THEN
        RAISE EXCEPTION
            'active risk model %.% is immutable; publish a new version',
            OLD.code, OLD.version
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status <> 'active' AND NEW.status = 'active' THEN
        SELECT COALESCE(sum(weight), 0)
          INTO v_weight
          FROM master.risk_model_dimension
         WHERE model_code = NEW.code
           AND model_version = NEW.version;
        IF v_weight <> 1.0000 THEN
            RAISE EXCEPTION
                'risk model %.% cannot be activated: weights total %, expected 1.0000',
                NEW.code, NEW.version, v_weight
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_risk_model_weight_sum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_model_code text := COALESCE(NEW.model_code, OLD.model_code);
    v_model_version text := COALESCE(NEW.model_version, OLD.model_version);
    v_status text;
    v_weight numeric;
BEGIN
    SELECT status
      INTO v_status
      FROM master.risk_model
     WHERE code = v_model_code
       AND version = v_model_version;

    IF NOT FOUND OR v_status <> 'active' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(sum(weight), 0)
      INTO v_weight
      FROM master.risk_model_dimension
     WHERE model_code = v_model_code
       AND model_version = v_model_version;

    IF v_weight <> 1.0000 THEN
        RAISE EXCEPTION
            'active risk model %.% dimension weights must total 1.0000; found %',
            v_model_code, v_model_version, v_weight
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_risk_model_dimension_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    SELECT status
      INTO v_status
      FROM master.risk_model
     WHERE code = OLD.model_code
       AND version = OLD.model_version;

    IF v_status = 'active' THEN
        RAISE EXCEPTION
            'dimensions of active risk model %.% are immutable',
            OLD.model_code, OLD.model_version
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_assessment_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF OLD.status = 'approved' AND (
        OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        OR OLD.subject_type IS DISTINCT FROM NEW.subject_type
        OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
        OR OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id
        OR OLD.assessment_context IS DISTINCT FROM NEW.assessment_context
        OR OLD.model_code IS DISTINCT FROM NEW.model_code
        OR OLD.model_version IS DISTINCT FROM NEW.model_version
        OR OLD.overall_score IS DISTINCT FROM NEW.overall_score
    ) THEN
        RAISE EXCEPTION
            'approved party risk assessment is structurally immutable; supersede it'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'approved'
       AND OLD.risk_band IS DISTINCT FROM NEW.risk_band
       AND (
           NOT NEW.is_override
           OR NEW.override_reason IS NULL
           OR NEW.override_score IS NULL
       ) THEN
        RAISE EXCEPTION
            'changing an approved risk band requires override reason and score'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    IF (
        OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        OR OLD.subject_type IS DISTINCT FROM NEW.subject_type
        OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
        OR OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id
        OR OLD.source_code IS DISTINCT FROM NEW.source_code
        OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
        OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type
        OR OLD.evidence_date IS DISTINCT FROM NEW.evidence_date
        OR OLD.received_at IS DISTINCT FROM NEW.received_at
        OR OLD.valid_from IS DISTINCT FROM NEW.valid_from
        OR OLD.ingested_by IS DISTINCT FROM NEW.ingested_by
        OR OLD.ingested_via IS DISTINCT FROM NEW.ingested_via
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.created_by IS DISTINCT FROM NEW.created_by
    ) THEN
        RAISE EXCEPTION
            'party risk evidence identity and source fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.raw_payload IS NOT NULL
       AND OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
        RAISE EXCEPTION
            'party risk evidence raw_payload is immutable once written'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_driver_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_score_assessment_id uuid;
    v_score_dimension_code text;
    v_assessment_business_partner_id uuid;
    v_evidence_business_partner_id uuid;
BEGIN
    IF NEW.dimension_score_id IS NOT NULL THEN
        SELECT assessment_id, dimension_code
          INTO v_score_assessment_id, v_score_dimension_code
          FROM master.party_risk_dimension_score
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.dimension_score_id;

        IF NOT FOUND
           OR v_score_assessment_id IS DISTINCT FROM NEW.assessment_id
           OR v_score_dimension_code IS DISTINCT FROM NEW.dimension_code THEN
            RAISE EXCEPTION
                'risk driver dimension score does not match its assessment and dimension'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.evidence_id IS NOT NULL THEN
        SELECT business_partner_id
          INTO v_assessment_business_partner_id
          FROM master.party_risk_assessment
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.assessment_id;

        SELECT business_partner_id
          INTO v_evidence_business_partner_id
          FROM master.party_risk_evidence
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.evidence_id;

        IF v_evidence_business_partner_id IS DISTINCT FROM
           v_assessment_business_partner_id THEN
            RAISE EXCEPTION
                'risk driver evidence belongs to another business partner'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_mitigation_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_assessment_business_partner_id uuid;
    v_driver_assessment_id uuid;
BEGIN
    IF NEW.assessment_id IS NOT NULL THEN
        SELECT business_partner_id
          INTO v_assessment_business_partner_id
          FROM master.party_risk_assessment
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.assessment_id;
        IF v_assessment_business_partner_id IS DISTINCT FROM
           NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk mitigation assessment belongs to another business partner'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
        SELECT assessment_id
          INTO v_driver_assessment_id
          FROM master.party_risk_driver
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.driver_id;
        IF NOT FOUND
           OR (
               NEW.assessment_id IS NOT NULL
               AND v_driver_assessment_id IS DISTINCT FROM NEW.assessment_id
           ) THEN
            RAISE EXCEPTION
                'risk mitigation driver does not match its assessment'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_party_risk_review_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'party risk review events are append-only'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;
