-- Retire the unused Business Partner profile-delivery acknowledgement bridge.
DROP TABLE IF EXISTS mesh.business_partner_delivery_acknowledgement;
DROP FUNCTION IF EXISTS mesh.trg_delivery_acknowledgement_immutable();
