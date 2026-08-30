BEGIN;

DO $$ BEGIN
  IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'BP360 performance indexes require athyper_neon'; END IF;
END $$;

CREATE INDEX IF NOT EXISTS business_partner_identifier_current_cursor_idx
  ON master.business_partner_identifier(tenant_id,business_partner_id,created_at DESC,id DESC)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS business_partner_tax_registration_current_cursor_idx
  ON master.business_partner_tax_registration(tenant_id,business_partner_id,created_at DESC,id DESC)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS contact_person_owner_cursor_idx
  ON master.contact_person(tenant_id,owner_type_id,owner_id,created_at DESC,id DESC)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS address_link_owner_cursor_idx
  ON master.address_link(tenant_id,owner_type_id,owner_id,created_at DESC,id DESC)
  WHERE usage_status='active';

CREATE INDEX IF NOT EXISTS address_event_subject_cursor_idx
  ON master.address_event(tenant_id,subject_address_id,occurred_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS business_partner_request_target_cursor_idx
  ON document.business_partner_request(tenant_id,target_business_partner_id,created_at DESC,id DESC)
  WHERE target_business_partner_id IS NOT NULL;

COMMIT;
