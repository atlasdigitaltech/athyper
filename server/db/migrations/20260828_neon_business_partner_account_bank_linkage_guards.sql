-- WP15 correction: install mutation guards present in clean-build DDL.
BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'WP15 NEON account/bank linkage guards must target athyper_neon'; END IF; END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_mesh_business_partner_account_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MESH Business Partner account links cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.profile_projection_id,NEW.source_tenant_id,NEW.source_network_account_id,NEW.recipient_network_account_id,NEW.network_relationship_id,NEW.business_partner_id,NEW.proposed_role,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.profile_projection_id,OLD.source_tenant_id,OLD.source_network_account_id,OLD.recipient_network_account_id,OLD.network_relationship_id,OLD.business_partner_id,OLD.proposed_role,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'MESH Business Partner account link coordinates are immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.decision_fingerprint IS NOT NULL AND (NEW.decision_fingerprint,NEW.reviewed_at,NEW.reviewed_by,NEW.approved_at,NEW.approved_by,NEW.external_reference_id) IS DISTINCT FROM (OLD.decision_fingerprint,OLD.reviewed_at,OLD.reviewed_by,OLD.approved_at,OLD.approved_by,OLD.external_reference_id) THEN RAISE EXCEPTION 'MESH Business Partner account link decision evidence is immutable' USING ERRCODE='check_violation'; END IF;
 NEW.row_version:=OLD.row_version+1; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_mesh_bank_account_projection() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MESH bank projection history cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.account_link_id,NEW.source_tenant_id,NEW.source_network_account_id,NEW.recipient_network_account_id,NEW.network_relationship_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.account_link_id,OLD.source_tenant_id,OLD.source_network_account_id,OLD.recipient_network_account_id,OLD.network_relationship_id) THEN RAISE EXCEPTION 'MESH bank projection coordinates are immutable' USING ERRCODE='check_violation'; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_bank_verification() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner bank verification cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.bank_projection_id,NEW.business_partner_id,NEW.supplier_company_profile_id,NEW.company_code_id,NEW.prior_bank_account_link_id,NEW.expected_account_fingerprint,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.bank_projection_id,OLD.business_partner_id,OLD.supplier_company_profile_id,OLD.company_code_id,OLD.prior_bank_account_link_id,OLD.expected_account_fingerprint,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Business Partner bank verification coordinates are immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.decision_fingerprint IS NOT NULL AND (NEW.candidate_bank_account_link_id,NEW.verification_method,NEW.verification_evidence,NEW.decision_fingerprint,NEW.verified_at,NEW.verified_by,NEW.rejected_at,NEW.rejected_by,NEW.rejection_reason) IS DISTINCT FROM (OLD.candidate_bank_account_link_id,OLD.verification_method,OLD.verification_evidence,OLD.decision_fingerprint,OLD.verified_at,OLD.verified_by,OLD.rejected_at,OLD.rejected_by,OLD.rejection_reason) THEN RAISE EXCEPTION 'Business Partner bank verification decision evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.applied_at IS NOT NULL AND (NEW.application_fingerprint,NEW.applied_at,NEW.applied_by) IS DISTINCT FROM (OLD.application_fingerprint,OLD.applied_at,OLD.applied_by) THEN RAISE EXCEPTION 'Business Partner bank application evidence is immutable' USING ERRCODE='check_violation'; END IF;
 NEW.row_version:=OLD.row_version+1; RETURN NEW; END $$;

CREATE TRIGGER trg_mesh_bp_account_link_guard BEFORE UPDATE OR DELETE ON control.mesh_business_partner_account_link FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_business_partner_account_link();
CREATE TRIGGER trg_mesh_bp_account_link_updated BEFORE UPDATE ON control.mesh_business_partner_account_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_mesh_bank_account_projection_guard BEFORE UPDATE OR DELETE ON control.mesh_bank_account_projection FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mesh_bank_account_projection();
CREATE TRIGGER trg_business_partner_bank_verification_guard BEFORE UPDATE OR DELETE ON document.business_partner_bank_verification FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_bank_verification();
CREATE TRIGGER trg_business_partner_bank_verification_updated BEFORE UPDATE ON document.business_partner_bank_verification FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

REVOKE ALL ON FUNCTION control.trg_guard_mesh_business_partner_account_link(),control.trg_guard_mesh_bank_account_projection(),document.trg_guard_business_partner_bank_verification() FROM PUBLIC;
COMMIT;
