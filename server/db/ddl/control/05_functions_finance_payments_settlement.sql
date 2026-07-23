-- Finance Setup Phase 2, Stage D: deterministic interface routing and policy guards.

CREATE OR REPLACE FUNCTION control.guard_payment_interface_binding_conflict()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='active' AND EXISTS (
        SELECT 1 FROM control.payment_method_interface_binding existing
         WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id
           AND existing.payment_method_id=NEW.payment_method_id AND existing.status='active'
           AND existing.priority=NEW.priority
           AND (existing.company_code_id IS NULL)=(NEW.company_code_id IS NULL)
           AND (existing.bank_account_link_id IS NULL)=(NEW.bank_account_link_id IS NULL)
           AND (existing.currency_code IS NULL)=(NEW.currency_code IS NULL)
           AND (existing.counterparty_country_code IS NULL)=(NEW.counterparty_country_code IS NULL)
           AND (existing.payment_network IS NULL)=(NEW.payment_network IS NULL)
           AND existing.direction=NEW.direction
           AND (existing.company_code_id IS NULL OR existing.company_code_id=NEW.company_code_id)
           AND (existing.bank_account_link_id IS NULL OR existing.bank_account_link_id=NEW.bank_account_link_id)
           AND (existing.currency_code IS NULL OR existing.currency_code=NEW.currency_code)
           AND (existing.counterparty_country_code IS NULL OR existing.counterparty_country_code=NEW.counterparty_country_code)
           AND (existing.payment_network IS NULL OR existing.payment_network=NEW.payment_network)
           AND daterange(existing.effective_from,COALESCE(existing.effective_until,'9999-12-31'::date),'[)')
               && daterange(NEW.effective_from,COALESCE(NEW.effective_until,'9999-12-31'::date),'[)')
    ) THEN
        RAISE EXCEPTION 'Ambiguous interface binding: equal specificity and priority overlap for the same payment context'
            USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.guard_payment_interface_house_bank()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.bank_account_link_id IS NULL THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM master.bank_account_link
     WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_link_id AND owner_type='company_code';
    IF v_owner IS NULL OR (NEW.company_code_id IS NOT NULL AND v_owner<>NEW.company_code_id) THEN
        RAISE EXCEPTION 'Interface binding House Bank must be Company-owned and match the binding Company'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.guard_payment_settlement_book()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status<>'active' THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment assignment
        JOIN master.ledger_book book ON book.tenant_id=assignment.tenant_id AND book.id=assignment.book_id
         WHERE assignment.tenant_id=NEW.tenant_id AND assignment.company_code_id=NEW.company_code_id
           AND book.code=NEW.book_code AND assignment.status='active' AND book.status='active'
           AND assignment.effective_from<=NEW.effective_from
           AND (assignment.effective_to IS NULL OR assignment.effective_to>=NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'Settlement book % is not active and assigned to the Company at the rule start date',NEW.book_code
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.resolve_bank_interface_trace(
    p_tenant_id uuid,p_payment_method_id uuid,p_as_of_date date,
    p_direction text DEFAULT 'OUTBOUND',p_company_code_id uuid DEFAULT NULL,
    p_bank_account_link_id uuid DEFAULT NULL,p_currency_code character(3) DEFAULT NULL,
    p_counterparty_country_code character(2) DEFAULT NULL,p_payment_network text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=control,master,pg_temp AS $$
DECLARE v_candidates jsonb; v_winner jsonb; v_top_count integer;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);
    WITH evaluated AS (
      SELECT b.id,b.bank_interface_profile_id,ip.code AS profile_code,ip.name AS profile_name,
             ip.interface_type,ip.file_format_code,ip.provider_code,b.priority,
             ARRAY[
               (b.company_code_id IS NOT NULL)::int,(b.bank_account_link_id IS NOT NULL)::int,
               (b.currency_code IS NOT NULL)::int,(b.counterparty_country_code IS NOT NULL)::int,
               (b.payment_network IS NOT NULL)::int,(b.direction=p_direction)::int
             ] AS specificity,
             CASE WHEN b.direction NOT IN (p_direction,'BOTH') THEN 'direction_mismatch'
                  WHEN b.company_code_id IS NOT NULL AND b.company_code_id IS DISTINCT FROM p_company_code_id THEN 'company_mismatch'
                  WHEN b.bank_account_link_id IS NOT NULL AND b.bank_account_link_id IS DISTINCT FROM p_bank_account_link_id THEN 'house_bank_mismatch'
                  WHEN b.currency_code IS NOT NULL AND b.currency_code IS DISTINCT FROM p_currency_code THEN 'currency_mismatch'
                  WHEN b.counterparty_country_code IS NOT NULL AND b.counterparty_country_code IS DISTINCT FROM p_counterparty_country_code THEN 'country_mismatch'
                  WHEN b.payment_network IS NOT NULL AND b.payment_network IS DISTINCT FROM p_payment_network THEN 'network_mismatch'
                  ELSE NULL END AS rejection_reason
        FROM control.payment_method_interface_binding b
        JOIN control.bank_interface_profile ip ON ip.tenant_id=b.tenant_id AND ip.id=b.bank_interface_profile_id AND ip.status='active'
       WHERE b.tenant_id=p_tenant_id AND b.payment_method_id=p_payment_method_id AND b.status='active'
         AND b.effective_from<=p_as_of_date AND (b.effective_until IS NULL OR b.effective_until>p_as_of_date)
    ), ranked AS (
      SELECT *,dense_rank() OVER(ORDER BY specificity DESC,priority DESC) AS resolution_rank
        FROM evaluated WHERE rejection_reason IS NULL
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'bindingId',e.id,'profileId',e.bank_interface_profile_id,'profileCode',e.profile_code,
             'interfaceType',e.interface_type,'specificity',e.specificity,'priority',e.priority,
             'matched',e.rejection_reason IS NULL,'reason',e.rejection_reason)
             ORDER BY e.specificity DESC,e.priority DESC,e.id),'[]'::jsonb),
           (SELECT to_jsonb(r) FROM ranked r WHERE r.resolution_rank=1 ORDER BY r.id LIMIT 1),
           (SELECT count(*) FROM ranked r WHERE r.resolution_rank=1)
      INTO v_candidates,v_winner,v_top_count FROM evaluated e;

    RETURN jsonb_build_object('found',v_top_count=1,'ambiguous',v_top_count>1,
      'asOfDate',p_as_of_date,'winner',CASE WHEN v_top_count=1 THEN v_winner ELSE NULL END,
      'candidates',v_candidates,'explanation',CASE WHEN v_top_count>1 THEN 'Equal-specificity and equal-priority bindings matched' WHEN v_top_count=0 THEN 'No active binding matched' ELSE 'Resolved deterministically by specificity then priority' END);
END $$;

COMMENT ON FUNCTION control.resolve_bank_interface_trace IS
  'Stage D deterministic, as-of interface resolver. Returns all candidates, rejection reasons, ambiguity, and the unique winner.';
