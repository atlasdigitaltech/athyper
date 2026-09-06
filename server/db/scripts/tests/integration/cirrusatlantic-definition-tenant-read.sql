-- Read-only regression against the CirrusAtlantic 2.1.1 development publication.
-- Run in athyper_neon after native publication; no runtime decisions are written.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL ROLE athyper_runtime;
SET LOCAL app.current_tenant_id='';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM runtime_meta.fn_active_business_partner_definition('studio.business_partner.definition.business_partner.onboarding') a JOIN runtime_meta.applied_release_payload p ON p.id=a.id) THEN RAISE EXCEPTION 'Unscoped payload visible'; END IF;
END $$;
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM runtime_meta.fn_active_business_partner_definition('studio.business_partner.definition.business_partner.onboarding') a JOIN runtime_meta.applied_release_payload p ON p.id=a.id WHERE a.tenant_id='44444444-4444-4444-8444-444444444444' AND a.semantic_version='2.1.1' AND p.payload_json->'requestSchemas' ? 'supplier.company') THEN RAISE EXCEPTION 'Scoped supplier company definition missing'; END IF;
END $$;
SET LOCAL app.current_tenant_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM runtime_meta.fn_active_business_partner_definition('studio.business_partner.definition.business_partner.onboarding') a WHERE a.tenant_id='44444444-4444-4444-8444-444444444444' AND a.semantic_version='2.1.1') THEN RAISE EXCEPTION 'Activated consumer-safe definition missing across tenant boundary'; END IF;
 IF EXISTS(SELECT 1 FROM runtime_meta.fn_active_business_partner_definition('studio.business_partner.definition.business_partner.onboarding') a JOIN runtime_meta.applied_release_payload p ON p.id=a.id WHERE a.tenant_id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Cross-tenant payload visible'; END IF;
END $$;
ROLLBACK;
