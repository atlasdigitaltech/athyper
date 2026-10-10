-- Retire the unused MESH-to-NEON Business Partner profile delivery bridge.
-- The masked bank-disclosure inbox is intentionally retained: it is a separate
-- recipient-security boundary, not part of the profile delivery capability.
DROP TABLE IF EXISTS document.mesh_profile_change_case;
DROP TABLE IF EXISTS document.mesh_business_partner_acceptance_event;
DROP TABLE IF EXISTS document.mesh_business_partner_acceptance;
DROP TABLE IF EXISTS document.mesh_business_partner_match;
DROP TABLE IF EXISTS document.mesh_profile_change_resolution;
DROP TABLE IF EXISTS control.mesh_bank_account_projection;
DROP TABLE IF EXISTS control.mesh_business_partner_account_link;
DROP TABLE IF EXISTS control.mesh_business_partner_profile_projection;
DROP TABLE IF EXISTS snapshot.mesh_business_partner_profile_received;
DROP TABLE IF EXISTS control.mesh_business_partner_profile_processing_attempt;
DROP TABLE IF EXISTS control.mesh_business_partner_profile_inbox;

DROP FUNCTION IF EXISTS master.command_materialize_mesh_profile_change_case(uuid,uuid,bigint,text,uuid,uuid);
DROP FUNCTION IF EXISTS document.trg_mesh_profile_resolution_immutable();
DROP FUNCTION IF EXISTS control.trg_guard_mesh_business_partner_profile_evidence();
DROP FUNCTION IF EXISTS control.trg_guard_mesh_business_partner_profile_projection();
DROP FUNCTION IF EXISTS control.trg_guard_mesh_business_partner_account_link();
DROP FUNCTION IF EXISTS control.trg_guard_mesh_bank_account_projection();
DROP FUNCTION IF EXISTS snapshot.trg_guard_mesh_business_partner_profile_received();
DROP FUNCTION IF EXISTS snapshot.mesh_business_partner_profile_payload_is_safe(jsonb);
