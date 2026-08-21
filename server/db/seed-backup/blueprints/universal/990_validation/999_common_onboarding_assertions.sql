-- Final read-only tenant onboarding guard against the current Neon DDL contract.
-- This assertion payload creates no data and must run after all Wave 5 packs.
DO $assert$
DECLARE
  v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid;
  v_missing text;
BEGIN
  IF current_setting('app.database_plane',true)<>'neon' OR v_tid IS NULL THEN
    RAISE EXCEPTION '[common_onboarding_assertions] Neon tenant scope required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[common_onboarding_assertions] active tenant missing';
  END IF;

  SELECT string_agg(company.code,',' ORDER BY company.code) INTO v_missing
  FROM master.company_code company
  LEFT JOIN master.legal_entity legal
    ON legal.tenant_id=company.tenant_id AND legal.id=company.legal_entity_id AND legal.status='active'
  WHERE company.tenant_id=v_tid AND company.status='active'
    AND (legal.id IS NULL OR company.country_code IS NULL OR company.functional_currency IS NULL);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '[common_onboarding_assertions] company legal/country/currency identity incomplete: %',v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM master.org_unit WHERE tenant_id=v_tid AND code='organization' AND status='active')
     OR NOT EXISTS (SELECT 1 FROM master.org_unit WHERE tenant_id=v_tid AND code='operations' AND status='active') THEN
    RAISE EXCEPTION '[common_onboarding_assertions] universal organization hierarchy missing';
  END IF;

  SELECT string_agg(company.code,',' ORDER BY company.code) INTO v_missing
  FROM master.company_code company
  WHERE company.tenant_id=v_tid AND company.status='active' AND (
    NOT EXISTS (SELECT 1 FROM master.cost_center center WHERE center.tenant_id=v_tid
      AND center.company_code_id=company.id AND center.code=company.code||'-cc-ops-gen'
      AND center.status='active' AND center.is_posting_allowed)
    OR NOT EXISTS (SELECT 1 FROM master.profit_center center WHERE center.tenant_id=v_tid
      AND center.company_code_id=company.id AND center.code=company.code||'-pc-ext-gen'
      AND center.status='active' AND center.is_posting_allowed)
    OR NOT EXISTS (SELECT 1 FROM master.company_code_book_assignment assignment
      WHERE assignment.tenant_id=v_tid AND assignment.company_code_id=company.id AND assignment.status='active')
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '[common_onboarding_assertions] company organization/book foundation missing: %',v_missing;
  END IF;

  IF (SELECT count(*) FROM master.asset_class WHERE tenant_id=v_tid AND status='active'
      AND metadata->'_seed'->>'pack'='340_asset')<>16 THEN
    RAISE EXCEPTION '[common_onboarding_assertions] expected 16 universal asset classes';
  END IF;
  IF EXISTS (SELECT 1 FROM master.company_code_book_assignment assignment
    JOIN master.ledger_book book ON book.tenant_id=assignment.tenant_id AND book.id=assignment.book_id
    WHERE assignment.tenant_id=v_tid AND assignment.status='active' AND book.status='active'
      AND NOT EXISTS (SELECT 1 FROM control.asset_class_book_policy policy
        WHERE policy.tenant_id=v_tid AND policy.company_code_id=assignment.company_code_id
          AND policy.ledger_book_id=assignment.book_id AND policy.status='active')) THEN
    RAISE EXCEPTION '[common_onboarding_assertions] assigned ledger book missing effective asset policy';
  END IF;

  IF (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id=v_tid
      AND jurisdiction_type='country' AND status='active')<14 THEN
    RAISE EXCEPTION '[common_onboarding_assertions] country jurisdiction catalog incomplete';
  END IF;
  IF (SELECT count(DISTINCT from_currency) FROM master.fx_rate WHERE tenant_id=v_tid
      AND to_currency='MYR' AND status='active')<150 THEN
    RAISE EXCEPTION '[common_onboarding_assertions] FX-to-MYR catalog incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM master.chart_of_account chart
    JOIN master.gl_account account ON account.tenant_id=chart.tenant_id
      AND account.chart_of_account_id=chart.id AND account.node_type='posting' AND account.status='active'
    WHERE chart.tenant_id=v_tid AND chart.status='active') THEN
    RAISE EXCEPTION '[common_onboarding_assertions] no active chart with posting accounts';
  END IF;
  SELECT string_agg(company.code,',' ORDER BY company.code) INTO v_missing
  FROM master.company_code company
  WHERE company.tenant_id=v_tid AND company.status='active'
    AND NOT EXISTS (SELECT 1 FROM master.company_code_chart_assignment assignment
      JOIN master.chart_of_account chart ON chart.tenant_id=assignment.tenant_id AND chart.id=assignment.chart_of_account_id
      WHERE assignment.tenant_id=v_tid AND assignment.company_code_id=company.id
        AND assignment.assignment_type='operating' AND assignment.status='active' AND chart.status='active');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '[common_onboarding_assertions] operating chart assignment missing: %',v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM master.payment_term WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[common_onboarding_assertions] payment terms missing';
  END IF;
  IF EXISTS (SELECT 1 FROM control.tax_group WHERE tenant_id=v_tid AND status='active' AND jurisdiction_id IS NULL) THEN
    RAISE EXCEPTION '[common_onboarding_assertions] active tax group lacks jurisdiction';
  END IF;
  RAISE NOTICE '[common_onboarding_assertions] tenant % passed current-DDL onboarding assertions',v_tid;
END $assert$;
