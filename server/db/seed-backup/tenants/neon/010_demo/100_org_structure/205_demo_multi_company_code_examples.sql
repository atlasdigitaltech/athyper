-- Demonstrates two legal entities with multiple legitimate Company Codes.
-- The new codes have distinct accounting purposes; they are not duplicates.
DO $demo_multi_company_code_examples$
DECLARE v_tenant_id uuid; v_actor uuid; v_athq_le uuid; v_amre_le uuid; v_athq uuid; v_amre uuid; v_athq_shared uuid; v_amre_projects uuid;
  v_meta constant jsonb:='{"_seed":{"pack":"demo.multi-company-code-examples","version":"1.0.0"}}'::jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key='athyper' AND code='athyper';
  SELECT id INTO v_actor FROM master.principal WHERE tenant_id=v_tenant_id AND code='seed.three-plane-provisioner' AND status='active';
  SELECT id INTO v_athq_le FROM master.legal_entity WHERE tenant_id=v_tenant_id AND code='le-athq';
  SELECT id INTO v_amre_le FROM master.legal_entity WHERE tenant_id=v_tenant_id AND code='le-amre';
  SELECT id INTO v_athq FROM master.company_code WHERE tenant_id=v_tenant_id AND code='athq';
  SELECT id INTO v_amre FROM master.company_code WHERE tenant_id=v_tenant_id AND code='amre';
  IF v_tenant_id IS NULL OR v_actor IS NULL OR v_athq_le IS NULL OR v_amre_le IS NULL OR v_athq IS NULL OR v_amre IS NULL THEN RAISE EXCEPTION '[205_demo_multi_company_code_examples] required Demo references missing'; END IF;
  PERFORM set_config('app.current_principal_id',v_actor::text,true);
  INSERT INTO master.company_code (tenant_id,legal_entity_id,code,name,display_name,description,functional_currency,country_code,fiscal_year_start_month,timezone_code,locale_code,metadata,status,created_by)
  VALUES
    (v_tenant_id,v_athq_le,'athq.shared','Athyper Group Shared Services','Athyper Group Shared Services','Separate management-services accounting Company Code under Athyper Group Holdings.','MYR','MY',1,'Asia/Kuala_Lumpur','en-MY',v_meta,'active',v_actor),
    (v_tenant_id,v_amre_le,'amre.projects','Athyper Malaysia Real Estate Projects','Athyper Malaysia Real Estate Projects','Separate project-development accounting Company Code under Athyper Malaysia Real Estate.','MYR','MY',1,'Asia/Kuala_Lumpur','en-MY',v_meta,'active',v_actor)
  ON CONFLICT (tenant_id,code) DO UPDATE SET name=EXCLUDED.name,display_name=EXCLUDED.display_name,description=EXCLUDED.description,metadata=master.company_code.metadata||EXCLUDED.metadata,status='active',updated_at=now(),updated_by=v_actor;
  SELECT id INTO v_athq_shared FROM master.company_code WHERE tenant_id=v_tenant_id AND code='athq.shared';
  SELECT id INTO v_amre_projects FROM master.company_code WHERE tenant_id=v_tenant_id AND code='amre.projects';
  INSERT INTO master.company_code_chart_assignment (tenant_id,company_code_id,chart_of_account_id,assignment_type,is_primary,effective_from,effective_to,metadata,status,created_by)
  SELECT chart.tenant_id,CASE WHEN chart.company_code_id=v_athq THEN v_athq_shared ELSE v_amre_projects END,chart.chart_of_account_id,chart.assignment_type,chart.is_primary,chart.effective_from,chart.effective_to,v_meta,chart.status,v_actor FROM master.company_code_chart_assignment chart WHERE chart.tenant_id=v_tenant_id AND chart.company_code_id IN (v_athq,v_amre)
  ON CONFLICT (tenant_id,company_code_id,chart_of_account_id,assignment_type) DO UPDATE SET is_primary=EXCLUDED.is_primary,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,metadata=master.company_code_chart_assignment.metadata||EXCLUDED.metadata,status=EXCLUDED.status,updated_at=now(),updated_by=v_actor;
  INSERT INTO master.company_code_book_assignment (tenant_id,company_code_id,book_id,alternate_coa_prefix,override_currency_code,effective_from,effective_to,priority,conflict_strategy,metadata,status,created_by)
  SELECT book.tenant_id,CASE WHEN book.company_code_id=v_athq THEN v_athq_shared ELSE v_amre_projects END,book.book_id,book.alternate_coa_prefix,book.override_currency_code,book.effective_from,book.effective_to,book.priority,book.conflict_strategy,v_meta,book.status,v_actor FROM master.company_code_book_assignment book WHERE book.tenant_id=v_tenant_id AND book.company_code_id IN (v_athq,v_amre)
  ON CONFLICT (tenant_id,company_code_id,book_id,effective_from) DO UPDATE SET alternate_coa_prefix=EXCLUDED.alternate_coa_prefix,override_currency_code=EXCLUDED.override_currency_code,effective_to=EXCLUDED.effective_to,priority=EXCLUDED.priority,conflict_strategy=EXCLUDED.conflict_strategy,metadata=master.company_code_book_assignment.metadata||EXCLUDED.metadata,status=EXCLUDED.status,updated_at=now(),updated_by=v_actor;
  INSERT INTO master.fiscal_period (tenant_id,company_code_id,code,name,fiscal_year,period_number,period_type,start_date,end_date,fiscal_calendar_config_id,calendar_version_no,generation_key,generated_at,opened_at,opened_by,soft_closed_at,soft_closed_by,hard_closed_at,hard_closed_by,sort_order,metadata,status,created_by)
  SELECT period.tenant_id,CASE WHEN period.company_code_id=v_athq THEN v_athq_shared ELSE v_amre_projects END,period.code,period.name,period.fiscal_year,period.period_number,period.period_type,period.start_date,period.end_date,period.fiscal_calendar_config_id,period.calendar_version_no,period.generation_key,period.generated_at,period.opened_at,period.opened_by,period.soft_closed_at,period.soft_closed_by,period.hard_closed_at,period.hard_closed_by,period.sort_order,v_meta,period.status,v_actor FROM master.fiscal_period period WHERE period.tenant_id=v_tenant_id AND period.company_code_id IN (v_athq,v_amre)
  ON CONFLICT (tenant_id,company_code_id,code) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,metadata=master.fiscal_period.metadata||EXCLUDED.metadata,updated_at=now(),updated_by=v_actor;
END;
$demo_multi_company_code_examples$;
