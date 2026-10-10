-- The former Business Partner definition artifact is retired. Native Entity
-- descriptors remain the shared runtime contract.
DROP TRIGGER IF EXISTS runtime_business_partner_definition_head_guard
  ON runtime_meta.release_activation_head;
DROP FUNCTION IF EXISTS runtime_meta.trg_guard_business_partner_definition_head();
DROP FUNCTION IF EXISTS runtime_meta.fn_active_business_partner_definition(text);
