-- Read-only verification after db:provision:neon:business-partner-fixtures.
DO $$
DECLARE failures integer;
BEGIN
  SELECT count(*) INTO failures
  FROM master.business_partner b JOIN master.tenant t ON t.id=b.tenant_id
  WHERE t.code IN ('athyper','cirrusatlantic')
    AND b.metadata->'_seed'->>'pack'='development.business-partner-two-tenant.v2'
    AND (
      b.updated_at IS NULL OR b.website_url IS NULL
      OR NOT EXISTS (SELECT 1 FROM master.address_link l JOIN master.address a ON a.tenant_id=l.tenant_id AND a.id=l.address_id WHERE l.tenant_id=b.tenant_id AND l.owner_id=b.id AND a.country_code=b.registration_country_code)
      OR NOT EXISTS (SELECT 1 FROM master.contact_person p WHERE p.tenant_id=b.tenant_id AND p.owner_id=b.id)
      OR NOT EXISTS (SELECT 1 FROM master.business_partner_identifier i WHERE i.tenant_id=b.tenant_id AND i.business_partner_id=b.id AND i.issuing_country_code=b.registration_country_code)
      OR NOT EXISTS (SELECT 1 FROM master.business_partner_tax_registration r JOIN master.tax_jurisdiction j ON j.tenant_id=r.tenant_id AND j.id=r.jurisdiction_id WHERE r.tenant_id=b.tenant_id AND r.business_partner_id=b.id AND j.country_code=b.registration_country_code)
    );
  IF failures<>0 THEN RAISE EXCEPTION 'Incomplete country identity: %',failures; END IF;

  SELECT count(*) INTO failures
  FROM master.business_partner b
  JOIN master.business_partner_operating_organization_assignment a ON a.tenant_id=b.tenant_id AND a.business_partner_id=b.id AND a.partner_role='supplier' AND a.status='active'
  JOIN master.operating_organization_company_assignment c ON c.tenant_id=a.tenant_id AND c.operating_organization_id=a.operating_organization_id AND c.status='active'
  JOIN master.supplier s ON s.tenant_id=b.tenant_id AND s.business_partner_id=b.id
  WHERE b.metadata->'_seed'->>'pack'='development.business-partner-two-tenant.v2'
    AND c.effective_from<=CURRENT_DATE AND (c.effective_until IS NULL OR c.effective_until>CURRENT_DATE)
    AND NOT EXISTS (
      SELECT 1 FROM master.company_code_supplier_profile p
      JOIN master.bank_account_link l ON l.tenant_id=p.tenant_id AND l.id=p.preferred_remittance_bank_link_id
      JOIN master.bank_account k ON k.tenant_id=l.tenant_id AND k.id=l.bank_account_id
      WHERE p.tenant_id=b.tenant_id AND p.supplier_id=s.id AND p.company_code_id=c.company_code_id
        AND p.payment_term_id IS NOT NULL AND l.owner_id=b.id AND l.company_code_id=p.company_code_id
        AND k.bank_country_override=b.registration_country_code
        AND k.currency_code=p.currency_code
        AND p.currency_code=CASE b.registration_country_code WHEN 'MY' THEN 'MYR' WHEN 'DE' THEN 'EUR' WHEN 'SG' THEN 'SGD' WHEN 'GB' THEN 'GBP' WHEN 'SA' THEN 'SAR' END
    );
  IF failures<>0 THEN RAISE EXCEPTION 'Incomplete company/currency/bank coverage: %',failures; END IF;

  SELECT count(*) INTO failures FROM master.business_partner b
  WHERE b.metadata->'_seed'->>'pack'='development.business-partner-two-tenant.v2'
    AND b.status='draft' AND EXISTS (SELECT 1 FROM control.business_partner_qualification q WHERE q.tenant_id=b.tenant_id AND q.business_partner_id=b.id AND q.decision='approved');
  IF failures<>0 THEN RAISE EXCEPTION 'Draft fixture was approved: %',failures; END IF;

  SELECT count(*) INTO failures FROM master.business_partner b
  WHERE b.metadata->'_seed'->>'pack'='development.business-partner-two-tenant.v2'
    AND b.status='active' AND b.code NOT LIKE '%HIDDEN'
    AND NOT EXISTS (SELECT 1 FROM control.supplier_preference_designation p
      JOIN control.business_partner_decision_scope s ON s.tenant_id=p.tenant_id AND s.supplier_preference_id=p.id
      WHERE p.tenant_id=b.tenant_id AND p.business_partner_id=b.id AND s.scope_kind='operating_organization');
  IF failures<>0 THEN RAISE EXCEPTION 'Missing normalized preference coverage: %',failures; END IF;

  SELECT count(DISTINCT t.code) INTO failures FROM master.business_partner b JOIN master.tenant t ON t.id=b.tenant_id
  WHERE b.code IN ('ATH-BP-SA','CATL-BP-SA') AND b.registration_country_code='SA' AND t.code IN ('athyper','cirrusatlantic');
  IF failures<>2 THEN RAISE EXCEPTION 'Saudi fixture missing in a tenant'; END IF;
END $$;

SELECT t.code tenant,b.registration_country_code country,count(*) partners
FROM master.business_partner b JOIN master.tenant t ON t.id=b.tenant_id
WHERE b.metadata->'_seed'->>'pack'='development.business-partner-two-tenant.v2'
GROUP BY t.code,b.registration_country_code ORDER BY t.code,b.registration_country_code;
