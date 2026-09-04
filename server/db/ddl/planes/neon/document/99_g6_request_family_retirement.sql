-- Canonical clean-build closeout. No legacy request-family object survives.
ALTER TABLE document.business_partner_invitation DROP COLUMN IF EXISTS business_partner_request_id CASCADE;
ALTER TABLE document.business_partner_invitation_recovery DROP COLUMN IF EXISTS request_id CASCADE;
ALTER TABLE document.mesh_business_partner_acceptance_event DROP COLUMN IF EXISTS business_partner_request_id CASCADE;
DROP VIEW IF EXISTS document.supplier_registration_invitation CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_contact_channel CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_contact_person CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_address CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_identifier CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_tax_registration CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_classification CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_certification CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_materialization_item CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_validation CASCADE;
DROP TABLE IF EXISTS document.business_partner_request_evidence CASCADE;
DROP TABLE IF EXISTS document.business_partner_request CASCADE;
DROP FUNCTION IF EXISTS document.command_backfill_business_partner_request_cases(uuid,text,bigint,text,uuid,text,uuid,bigint,text,text,uuid,uuid);
DROP FUNCTION IF EXISTS document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS document.trg_guard_business_partner_request_payload_boundary();
DROP FUNCTION IF EXISTS document.trg_guard_business_partner_request_extension();
DROP FUNCTION IF EXISTS document.trg_guard_business_partner_request();
DROP FUNCTION IF EXISTS document.trg_guard_business_partner_request_registration();
DROP FUNCTION IF EXISTS document.trg_guard_business_partner_request_evidence();

