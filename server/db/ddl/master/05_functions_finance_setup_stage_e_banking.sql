-- Direct House Bank cash-GL validation. Never skips because a materialized view is stale.
CREATE OR REPLACE FUNCTION master.trg_house_config_gl_postable()
RETURNS trigger LANGUAGE plpgsql SET search_path=master,pg_catalog,pg_temp AS $$
DECLARE v_company uuid;v_bank_currency character(3);v_gl_currency character(3);v_gl_metadata jsonb;
BEGIN
  SELECT link.owner_id,account.currency_code INTO v_company,v_bank_currency
    FROM master.bank_account_link link JOIN master.bank_account account
      ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id
   WHERE link.tenant_id=NEW.tenant_id AND link.id=NEW.bank_account_link_id AND link.owner_type='company_code';
  IF v_company IS NULL THEN RAISE EXCEPTION 'House Bank requires a Company-owned Bank Account Link' USING ERRCODE='23503';END IF;
  SELECT account.currency_code,account.metadata INTO v_gl_currency,v_gl_metadata
    FROM master.gl_account account
   WHERE account.tenant_id=NEW.tenant_id AND account.id=NEW.gl_account_id AND account.status='active' AND account.node_type='posting'
     AND account.account_class='asset'
     AND EXISTS(SELECT 1 FROM master.company_code_chart_assignment assignment
       WHERE assignment.tenant_id=account.tenant_id AND assignment.company_code_id=v_company
         AND assignment.chart_of_account_id=account.chart_of_account_id AND assignment.status='active')
     AND NOT EXISTS(SELECT 1 FROM master.company_code_gl_account company_account
       WHERE company_account.tenant_id=account.tenant_id AND company_account.company_code_id=v_company
         AND company_account.gl_account_id=account.id
         AND(company_account.status<>'active' OR NOT company_account.posting_allowed OR company_account.blocked_for_auto));
  IF NOT FOUND THEN RAISE EXCEPTION 'House Bank cash GL must be active, postable and reachable through the Company operating Chart' USING ERRCODE='23503';END IF;
  IF v_gl_currency IS NOT NULL AND v_gl_currency<>v_bank_currency THEN
    RAISE EXCEPTION 'House Bank currency % does not match cash GL currency %',v_bank_currency,v_gl_currency USING ERRCODE='23514';
  END IF;
  IF v_gl_currency IS NULL AND COALESCE((v_gl_metadata->>'multi_currency')::boolean,false)=false AND EXISTS(
    SELECT 1 FROM master.bank_account_house_config config
    JOIN master.bank_account_link link ON link.tenant_id=config.tenant_id AND link.id=config.bank_account_link_id
    JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id
    WHERE config.tenant_id=NEW.tenant_id AND config.gl_account_id=NEW.gl_account_id AND config.id<>NEW.id
      AND config.status='active' AND account.currency_code<>v_bank_currency
  ) THEN RAISE EXCEPTION 'A currency-agnostic cash GL may serve incompatible Bank Account currencies only when metadata.multi_currency=true' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION master.end_bank_account_link(p_tenant_id uuid,p_link_id uuid,p_effective_until date,p_actor_id uuid)
RETURNS master.bank_account_link LANGUAGE plpgsql SECURITY INVOKER
SET search_path=master,shared,control,document,pg_catalog,pg_temp AS $$
DECLARE v_link master.bank_account_link;v_account uuid;
BEGIN
  IF p_tenant_id<>shared.current_tenant_id() THEN RAISE EXCEPTION 'tenant context does not match bank account link command' USING ERRCODE='42501';END IF;
  SELECT * INTO v_link FROM master.bank_account_link WHERE tenant_id=p_tenant_id AND id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank account link not found in active tenant' USING ERRCODE='P0002';END IF;
  IF p_effective_until<=v_link.effective_from THEN RAISE EXCEPTION 'effective_until must be after effective_from' USING ERRCODE='22007';END IF;
  IF v_link.effective_until IS NOT NULL AND p_effective_until>v_link.effective_until THEN RAISE EXCEPTION 'an ended bank account link cannot be extended by the end command' USING ERRCODE='22007';END IF;
  v_account:=v_link.bank_account_id;
  IF EXISTS(SELECT 1 FROM document.payment_entry payment WHERE payment.tenant_id=p_tenant_id AND payment.company_code_id=v_link.owner_id AND payment.bank_account_id=v_account AND payment.value_date>=p_effective_until AND payment.status IN('draft','pending_approval','approved','posted','transmitted','printed')) THEN RAISE EXCEPTION 'Cannot end House Bank link with current or future payments' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM control.payment_method_company_policy policy WHERE policy.tenant_id=p_tenant_id AND policy.bank_account_link_id=p_link_id AND policy.status='active' AND(policy.effective_until IS NULL OR policy.effective_until>p_effective_until)) THEN RAISE EXCEPTION 'Cannot end House Bank link while an active payment policy extends beyond the end date' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM document.bank_statement statement WHERE statement.tenant_id=p_tenant_id AND statement.company_code_id=v_link.owner_id AND statement.bank_account_id=v_account AND statement.status IN('imported','matching') AND statement.period_end_date>=p_effective_until) THEN RAISE EXCEPTION 'Cannot end House Bank link with an open statement at or beyond the end date' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM document.bank_recon_case recon WHERE recon.tenant_id=p_tenant_id AND recon.company_code_id=v_link.owner_id AND recon.bank_account_id=v_account AND recon.status IN('open','matched')) THEN RAISE EXCEPTION 'Cannot end House Bank link with unsigned reconciliation cases' USING ERRCODE='23514';END IF;
  UPDATE master.bank_account_house_config SET status='inactive',status_changed_at=now(),status_changed_by=p_actor_id,updated_at=now(),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND bank_account_link_id=p_link_id AND status='active';
  UPDATE master.bank_account_link SET effective_until=p_effective_until,updated_at=now(),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_link_id RETURNING * INTO v_link;
  RETURN v_link;
END $$;

COMMENT ON FUNCTION master.end_bank_account_link(uuid,uuid,date,uuid) IS
  'Stage E governed temporal end command. Blocks future payments, extending policies, open statements and unsigned reconciliation before atomically ending House Bank usage.';
