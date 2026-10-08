-- Existing tenant entitlement evaluator required by shared permission resolution.
GRANT EXECUTE ON FUNCTION control.effective_tenant_entitlement(uuid,timestamptz,text) TO athyper_publication_service;
