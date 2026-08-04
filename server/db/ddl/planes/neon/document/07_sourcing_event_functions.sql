CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_event()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.procurement_organization_profile p WHERE p.tenant_id=NEW.tenant_id AND p.operating_organization_id=NEW.operating_organization_id) THEN
        RAISE EXCEPTION 'Sourcing event requires a procurement operating-organization profile' USING ERRCODE='foreign_key_violation';
    END IF;
    IF NEW.central_buyer_company_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id=NEW.tenant_id AND a.operating_organization_id=NEW.operating_organization_id
           AND a.company_code_id=NEW.central_buyer_company_id AND a.status='active'
           AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)
    ) THEN RAISE EXCEPTION 'Central buyer must actively participate in the procurement organization' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_event()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Sourcing event must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('closed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Closed or cancelled sourcing event is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='draft' AND NEW.status IN('published','cancelled')) OR
        (OLD.status='published' AND NEW.status IN('evaluation','cancelled')) OR
        (OLD.status='evaluation' AND NEW.status IN('awarded','cancelled')) OR
        (OLD.status='awarded' AND NEW.status='closed')
    ) THEN RAISE EXCEPTION 'Invalid sourcing-event transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for sourcing transitions' USING ERRCODE='insufficient_privilege'; END IF;
    IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.evaluation_currency_code IS NULL OR NEW.open_at IS NULL OR NEW.close_at IS NULL THEN RAISE EXCEPTION 'Published event requires evaluation currency and open/close times' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.id AND c.status='active' AND c.participation_role='lead_buyer') THEN RAISE EXCEPTION 'Published event requires one active lead buyer company' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_demand d WHERE d.tenant_id=NEW.tenant_id AND d.sourcing_event_id=NEW.id AND d.status='included') THEN RAISE EXCEPTION 'Published event requires included demand' USING ERRCODE='check_violation'; END IF;
        IF EXISTS(SELECT 1 FROM document.sourcing_event_demand d WHERE d.tenant_id=NEW.tenant_id AND d.sourcing_event_id=NEW.id AND d.status='included' AND d.evaluation_currency_code<>NEW.evaluation_currency_code) THEN RAISE EXCEPTION 'All included demand must use the event evaluation currency' USING ERRCODE='check_violation'; END IF;
        IF NEW.central_buyer_company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.id AND c.company_code_id=NEW.central_buyer_company_id AND c.status='active' AND c.participation_role='lead_buyer') THEN RAISE EXCEPTION 'Central buyer must be the active lead buyer' USING ERRCODE='check_violation'; END IF;
        NEW.published_at:=statement_timestamp(); NEW.published_by:=v_actor;
    END IF;
    IF NEW.status='evaluation' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND clock_timestamp()<NEW.close_at THEN RAISE EXCEPTION 'Evaluation cannot start before the event closes' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NEW.status='awarded' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_award a WHERE a.tenant_id=NEW.tenant_id AND a.sourcing_event_id=NEW.id AND a.status IN('approved','converted')) THEN RAISE EXCEPTION 'Awarded event requires an approved award' USING ERRCODE='check_violation'; END IF;
        NEW.awarded_at:=statement_timestamp(); NEW.awarded_by:=v_actor;
    END IF;
    IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.closed_at:=statement_timestamp(); NEW.closed_by:=v_actor; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_company()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_event document.sourcing_event%ROWTYPE;
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF v_event.status<>'draft' THEN RAISE EXCEPTION 'Event companies are fixed after publication' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.operating_organization_company_assignment a WHERE a.tenant_id=NEW.tenant_id AND a.operating_organization_id=v_event.operating_organization_id AND a.company_code_id=NEW.company_code_id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)) THEN
        RAISE EXCEPTION 'Event company must actively participate in its procurement organization' USING ERRCODE='foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_demand()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_event document.sourcing_event%ROWTYPE; v_line document.purchase_requisition_line%ROWTYPE; v_used_qty numeric(20,6);
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF v_event.status NOT IN('draft','published') THEN RAISE EXCEPTION 'Demand can only be assembled before evaluation' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    SELECT * INTO v_line FROM document.purchase_requisition_line WHERE tenant_id=NEW.tenant_id AND id=NEW.purchase_requisition_line_id;
    IF FOUND AND (v_line.company_code_id<>NEW.demand_company_code_id OR v_line.uom_code<>NEW.uom_code OR v_line.currency_code<>NEW.source_currency_code OR NEW.requested_quantity>v_line.quantity OR NEW.requested_amount>v_line.net_amount) THEN
        RAISE EXCEPTION 'Sourcing demand must remain within its requisition line company, UOM, currency, quantity, and amount' USING ERRCODE='check_violation';
    END IF;
    IF NEW.evaluation_currency_code IS DISTINCT FROM v_event.evaluation_currency_code AND v_event.evaluation_currency_code IS NOT NULL THEN RAISE EXCEPTION 'Demand evaluation currency must match the event' USING ERRCODE='check_violation'; END IF;
    IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.sourcing_event_id AND c.company_code_id=NEW.demand_company_code_id AND c.status='active') THEN RAISE EXCEPTION 'Demand company must actively participate in the event' USING ERRCODE='foreign_key_violation'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':sourcing-demand:'||NEW.purchase_requisition_line_id::text,0));
    SELECT coalesce(sum(d.requested_quantity),0) INTO v_used_qty FROM document.sourcing_event_demand d JOIN document.sourcing_event e ON e.tenant_id=d.tenant_id AND e.id=d.sourcing_event_id WHERE d.tenant_id=NEW.tenant_id AND d.purchase_requisition_line_id=NEW.purchase_requisition_line_id AND d.id<>NEW.id AND d.status<>'withdrawn' AND e.status<>'cancelled';
    IF v_used_qty+NEW.requested_quantity>v_line.quantity THEN RAISE EXCEPTION 'Active sourcing events exceed the requisition-line quantity' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_award()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_event document.sourcing_event%ROWTYPE; v_bad integer;
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF TG_OP='INSERT' AND (NEW.status<>'recommended' OR v_event.status<>'evaluation') THEN RAISE EXCEPTION 'Awards must be recommended during event evaluation' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NEW.currency_code<>v_event.evaluation_currency_code THEN RAISE EXCEPTION 'Award currency must match the event evaluation currency' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM master.supplier s WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.supplier_id AND s.status='active') THEN RAISE EXCEPTION 'Sourcing award requires an active supplier' USING ERRCODE='foreign_key_violation'; END IF;
    IF TG_OP='UPDATE' AND NEW.award_amount IS DISTINCT FROM OLD.award_amount AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Award amount is maintained from active demand allocations' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('rejected','converted','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Finalized sourcing award is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT((OLD.status='recommended' AND NEW.status IN('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status IN('converted','cancelled'))) THEN RAISE EXCEPTION 'Invalid sourcing-award transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for award transitions' USING ERRCODE='insufficient_privilege'; END IF;
    IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.award_amount<=0 OR NOT EXISTS(SELECT 1 FROM document.sourcing_event_award_allocation x WHERE x.tenant_id=NEW.tenant_id AND x.award_id=NEW.id AND x.status='planned') THEN RAISE EXCEPTION 'Approved award requires positive planned demand allocations' USING ERRCODE='check_violation'; END IF;
        NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor;
    END IF;
    IF NEW.status='converted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*) FILTER(WHERE status<>'converted') INTO v_bad FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND award_id=NEW.id AND status<>'cancelled';
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND award_id=NEW.id AND status='converted') OR v_bad>0 THEN RAISE EXCEPTION 'Converted award requires all active allocations converted' USING ERRCODE='check_violation'; END IF;
        IF v_event.buying_model='central_buyer' AND EXISTS(
            SELECT 1 FROM document.sourcing_event_award_allocation x
             WHERE x.tenant_id=NEW.tenant_id AND x.award_id=NEW.id AND x.status='converted'
               AND x.company_code_id<>v_event.central_buyer_company_id
               AND NOT EXISTS(SELECT 1 FROM document.sourcing_event_intercompany_allocation i WHERE i.tenant_id=x.tenant_id AND i.award_allocation_id=x.id AND i.status<>'cancelled')
        ) THEN RAISE EXCEPTION 'Converted central-buyer award requires an intercompany allocation for every beneficiary company' USING ERRCODE='check_violation'; END IF;
        NEW.converted_at:=statement_timestamp(); NEW.converted_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_award_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_award document.sourcing_event_award%ROWTYPE; v_event document.sourcing_event%ROWTYPE; v_demand document.sourcing_event_demand%ROWTYPE; v_commitment document.commitment%ROWTYPE; v_qty numeric(20,6); v_amount numeric(20,4);
BEGIN
    SELECT * INTO v_award FROM document.sourcing_event_award WHERE tenant_id=NEW.tenant_id AND id=NEW.award_id;
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=v_award.sourcing_event_id;
    SELECT * INTO v_demand FROM document.sourcing_event_demand WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_demand_id;
    IF v_award.status NOT IN('recommended','approved') THEN RAISE EXCEPTION 'Award allocations are fixed after award finalization' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF v_demand.sourcing_event_id<>v_award.sourcing_event_id OR v_demand.demand_company_code_id<>NEW.company_code_id OR v_demand.evaluation_currency_code<>NEW.currency_code OR (NEW.awarded_quantity IS NOT NULL AND (v_demand.uom_code<>NEW.uom_code OR NEW.awarded_quantity>v_demand.requested_quantity)) THEN
        RAISE EXCEPTION 'Award allocation must match its event demand, beneficiary company, currency, UOM, and quantity' USING ERRCODE='check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':sourcing-award-demand:'||NEW.sourcing_event_demand_id::text,0));
    SELECT coalesce(sum(x.awarded_quantity),0),coalesce(sum(x.awarded_amount),0) INTO v_qty,v_amount FROM document.sourcing_event_award_allocation x JOIN document.sourcing_event_award a ON a.tenant_id=x.tenant_id AND a.id=x.award_id WHERE x.tenant_id=NEW.tenant_id AND x.sourcing_event_demand_id=NEW.sourcing_event_demand_id AND x.id<>NEW.id AND x.status<>'cancelled' AND a.status NOT IN('rejected','cancelled');
    IF (NEW.awarded_quantity IS NOT NULL AND v_qty+NEW.awarded_quantity>v_demand.requested_quantity) OR v_amount+NEW.awarded_amount>v_demand.evaluation_amount THEN RAISE EXCEPTION 'Active awards exceed demand quantity or evaluation amount' USING ERRCODE='check_violation'; END IF;
    IF NEW.output_commitment_id IS NOT NULL THEN
        SELECT * INTO v_commitment FROM document.commitment WHERE tenant_id=NEW.tenant_id AND id=NEW.output_commitment_id;
        IF FOUND AND (v_commitment.supplier_id<>v_award.supplier_id OR v_commitment.currency_code<>NEW.currency_code OR v_commitment.company_code_id<>CASE WHEN v_event.buying_model='central_buyer' THEN v_event.central_buyer_company_id ELSE NEW.company_code_id END) THEN RAISE EXCEPTION 'Output commitment must match award supplier, currency, and buying company' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_sourcing_award_projections(p_tenant_id uuid,p_award_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_total numeric(20,4); v_event uuid; v_demand record; v_qty numeric(20,6); v_amount numeric(20,4); v_converted integer; v_active integer;
BEGIN
    SELECT coalesce(sum(awarded_amount),0) INTO v_total FROM document.sourcing_event_award_allocation WHERE tenant_id=p_tenant_id AND award_id=p_award_id AND status<>'cancelled';
    UPDATE document.sourcing_event_award SET award_amount=v_total WHERE tenant_id=p_tenant_id AND id=p_award_id AND award_amount IS DISTINCT FROM v_total;
    SELECT sourcing_event_id INTO v_event FROM document.sourcing_event_award WHERE tenant_id=p_tenant_id AND id=p_award_id;
    FOR v_demand IN SELECT id,requested_quantity,evaluation_amount FROM document.sourcing_event_demand WHERE tenant_id=p_tenant_id AND sourcing_event_id=v_event LOOP
        SELECT coalesce(sum(x.awarded_quantity),0),coalesce(sum(x.awarded_amount),0),count(*) FILTER(WHERE x.status='converted'),count(*)
          INTO v_qty,v_amount,v_converted,v_active
          FROM document.sourcing_event_award_allocation x JOIN document.sourcing_event_award a ON a.tenant_id=x.tenant_id AND a.id=x.award_id
         WHERE x.tenant_id=p_tenant_id AND x.sourcing_event_demand_id=v_demand.id AND x.status<>'cancelled' AND a.status NOT IN('rejected','cancelled');
        UPDATE document.sourcing_event_demand SET status=CASE WHEN v_active=0 THEN 'included' WHEN v_converted=v_active AND (v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount) THEN 'converted' WHEN v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount THEN 'awarded' ELSE 'partially_awarded' END
         WHERE tenant_id=p_tenant_id AND id=v_demand.id AND status<>'withdrawn' AND status IS DISTINCT FROM CASE WHEN v_active=0 THEN 'included' WHEN v_converted=v_active AND (v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount) THEN 'converted' WHEN v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount THEN 'awarded' ELSE 'partially_awarded' END;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_sourcing_award()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_new jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
        v_old jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
        v_tenant uuid; v_award uuid;
BEGIN
    v_tenant:=coalesce(nullif(v_new->>'tenant_id','')::uuid,nullif(v_old->>'tenant_id','')::uuid);
    v_award:=coalesce(nullif(v_new->>'award_id','')::uuid,nullif(v_old->>'award_id','')::uuid,nullif(v_new->>'id','')::uuid,nullif(v_old->>'id','')::uuid);
    PERFORM document.refresh_sourcing_award_projections(v_tenant,v_award);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_intercompany()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_alloc document.sourcing_event_award_allocation%ROWTYPE; v_award document.sourcing_event_award%ROWTYPE; v_event document.sourcing_event%ROWTYPE; v_journal document.journal_entry%ROWTYPE;
BEGIN
    SELECT * INTO v_alloc FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND id=NEW.award_allocation_id;
    SELECT * INTO v_award FROM document.sourcing_event_award WHERE tenant_id=NEW.tenant_id AND id=v_alloc.award_id;
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=v_award.sourcing_event_id;
    IF v_event.buying_model<>'central_buyer' OR NEW.source_company_code_id<>v_event.central_buyer_company_id OR NEW.beneficiary_company_code_id<>v_alloc.company_code_id OR NEW.commitment_id<>v_alloc.output_commitment_id OR NEW.allocation_amount<>v_alloc.awarded_amount OR NEW.currency_code<>v_alloc.currency_code THEN
        RAISE EXCEPTION 'Intercompany sourcing allocation must mirror its central-buyer award allocation' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status='posted' THEN
        SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.posting_journal_entry_id;
        IF FOUND AND (v_journal.company_code_id<>NEW.source_company_code_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.sourcing_event_intercompany_allocation' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN RAISE EXCEPTION 'Intercompany journal must be posted for this allocation, source company, and currency' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_intercompany()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Intercompany sourcing allocation must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('posted','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Posted or cancelled intercompany sourcing allocation is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(OLD.status='planned' AND NEW.status IN('posted','cancelled')) THEN RAISE EXCEPTION 'Invalid intercompany sourcing-allocation transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;
