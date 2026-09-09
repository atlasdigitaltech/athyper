CREATE OR REPLACE FUNCTION mesh.read_eligible_bank_disclosure_source_v2(
  p_owner_tenant_id uuid,
  p_owner_account_id uuid,
  p_bank_account_id uuid,
  p_relationship_id uuid,
  p_purpose text
) RETURNS TABLE(
  buyer_tenant_id uuid,
  buyer_account_id uuid,
  supplier_tenant_id uuid,
  supplier_account_id uuid,
  owner_status text,
  recipient_status text,
  account_holder_name text,
  account_id_type text,
  account_last4 text,
  currency_code text,
  bank_name text,
  bank_country_code text,
  bic text,
  account_fingerprint text,
  protected_value_token text,
  clearing_scheme text,
  branch_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mesh, shared
AS $function$
  SELECT relationship.buyer_tenant_id,
         relationship.buyer_account_id,
         relationship.supplier_tenant_id,
         relationship.supplier_account_id,
         owner_account.status::text,
         recipient_account.status::text,
         bank_account.account_holder_name,
         bank_account.account_id_type::text,
         bank_account.account_last4,
         bank_account.currency_code::text,
         COALESCE(bank_account.bank_name_override, bank_party.name),
         COALESCE(bank_account.bank_country_override, bank_party.country_code)::text,
         COALESCE(bank_account.bic_override, bank_party.bic),
         bank_account.identifier_fingerprint::text,
         bank_account.protected_value_token,
         bank_account.metadata->>'clearingScheme',
         bank_account.metadata->>'branchCode'
    FROM mesh.network_relationship AS relationship
    JOIN mesh.network_account AS owner_account
      ON owner_account.tenant_id = p_owner_tenant_id
     AND owner_account.id = p_owner_account_id
    JOIN mesh.network_account AS recipient_account
      ON recipient_account.id = CASE
        WHEN p_purpose = 'settlement' THEN relationship.buyer_account_id
        ELSE relationship.supplier_account_id
      END
    JOIN mesh.bank_account AS bank_account
      ON bank_account.tenant_id = p_owner_tenant_id
     AND bank_account.id = p_bank_account_id
     AND bank_account.network_account_id = owner_account.id
    LEFT JOIN shared.v_bank_directory AS bank_party
      ON bank_party.id = bank_account.bank_institution_id AND bank_party.branch_id IS NOT DISTINCT FROM bank_account.bank_branch_id
    JOIN mesh.bank_account_link AS bank_link
      ON bank_link.tenant_id = bank_account.tenant_id
     AND bank_link.network_account_id = owner_account.id
     AND bank_link.bank_account_id = bank_account.id
     AND bank_link.purpose = p_purpose
     AND bank_link.effective_from <= CURRENT_DATE
     AND (bank_link.effective_until IS NULL OR bank_link.effective_until > CURRENT_DATE)
   WHERE p_owner_tenant_id = shared.current_tenant_id()
     AND p_purpose IN ('settlement', 'refund')
     AND relationship.id = p_relationship_id
     AND relationship.status = 'active'
     AND owner_account.status = 'active'
     AND recipient_account.status = 'active'
     AND bank_account.status = 'active'
     AND bank_account.is_verified
     AND (
       (p_purpose = 'settlement'
        AND relationship.supplier_tenant_id = p_owner_tenant_id
        AND relationship.supplier_account_id = owner_account.id
        AND recipient_account.tenant_id = relationship.buyer_tenant_id)
       OR
       (p_purpose = 'refund'
        AND relationship.buyer_tenant_id = p_owner_tenant_id
        AND relationship.buyer_account_id = owner_account.id
        AND recipient_account.tenant_id = relationship.supplier_tenant_id)
     )
     AND (relationship.effective_from IS NULL OR relationship.effective_from <= CURRENT_DATE)
     AND (relationship.effective_until IS NULL OR relationship.effective_until > CURRENT_DATE)
   FOR UPDATE OF relationship, bank_account;
$function$;
REVOKE ALL ON FUNCTION mesh.read_eligible_bank_disclosure_source_v2(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION mesh.read_eligible_bank_disclosure_source_v2(uuid,uuid,uuid,uuid,text) TO athyperapp; END IF; END $$;
