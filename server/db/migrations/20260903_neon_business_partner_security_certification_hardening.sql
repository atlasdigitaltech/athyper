BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_neon' THEN
        RAISE EXCEPTION 'S5 Business Partner security hardening must target athyper_neon';
    END IF;
END;
$$;

ALTER FUNCTION control.command_business_partner_decision(
    uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid
) SET plpgsql.variable_conflict = 'use_column';

-- Align the normalized Business Partner trigger with the S4 alias cache,
-- whose own trigger exclusively owns aliases after normalization.
DROP TRIGGER IF EXISTS trg_business_partner_05_normalize ON master.business_partner;
CREATE TRIGGER trg_business_partner_05_normalize
BEFORE INSERT OR UPDATE OF
    code,name,display_name,legal_name,legal_form,
    registration_country_code,website_url,description
ON master.business_partner
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_counterparty();

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_mutation_evidence_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF document.fn_business_partner_payload_has_restricted_key(NEW.evidence) THEN
        RAISE EXCEPTION 'Business Partner mutation evidence contains protected identity data'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_partner_mutation_evidence_payload
    ON control.business_partner_mutation_evidence;
CREATE TRIGGER trg_business_partner_mutation_evidence_payload
BEFORE INSERT ON control.business_partner_mutation_evidence
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_business_partner_mutation_evidence_payload();

REVOKE ALL ON FUNCTION control.trg_guard_business_partner_mutation_evidence_payload()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        REVOKE ALL ON FUNCTION control.trg_guard_business_partner_mutation_evidence_payload()
        FROM athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        REVOKE ALL ON FUNCTION control.trg_guard_business_partner_mutation_evidence_payload()
        FROM athyperadmin;
    END IF;
END;
$$;

COMMIT;
