CREATE OR REPLACE FUNCTION master.trg_validate_compensation_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master,document AS $$
DECLARE v_employment master.employment%ROWTYPE; v_group master.pay_group%ROWTYPE; v_structure master.pay_structure%ROWTYPE; v_change document.compensation_change%ROWTYPE;
BEGIN
    SELECT * INTO v_employment FROM master.employment WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_id;
    SELECT * INTO v_group FROM master.pay_group WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;
    IF v_employment.employee_id IS DISTINCT FROM NEW.employee_id OR v_employment.company_code_id IS DISTINCT FROM v_group.company_code_id THEN
        RAISE EXCEPTION 'Compensation employee, employment and pay group must resolve to one company' USING ERRCODE='check_violation';
    END IF;
    IF NEW.currency_code<>v_group.currency_code THEN RAISE EXCEPTION 'Compensation currency must match the pay group' USING ERRCODE='check_violation'; END IF;
    IF NEW.pay_structure_id IS NOT NULL THEN
        SELECT * INTO v_structure FROM master.pay_structure WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_structure_id;
        IF v_structure.currency_code<>NEW.currency_code OR (v_structure.pay_group_id IS NOT NULL AND v_structure.pay_group_id<>NEW.pay_group_id) THEN
            RAISE EXCEPTION 'Compensation pay structure must match pay group and currency' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.source_compensation_change_id IS NOT NULL THEN
        SELECT * INTO v_change FROM document.compensation_change WHERE tenant_id=NEW.tenant_id AND id=NEW.source_compensation_change_id;
        IF v_change.employee_id<>NEW.employee_id OR v_change.effective_date<>NEW.effective_from OR v_change.proposed_pay_group_id<>NEW.pay_group_id OR v_change.proposed_currency_code<>NEW.currency_code OR v_change.proposed_base_amount<>NEW.base_amount OR v_change.proposed_annualized_amount IS DISTINCT FROM NEW.annualized_amount THEN
            RAISE EXCEPTION 'Compensation assignment must materialize its approved change exactly' USING ERRCODE='check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_manage_compensation_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Compensation assignment must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status<>'planned' AND (
        NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.employment_id IS DISTINCT FROM OLD.employment_id OR
        NEW.pay_group_id IS DISTINCT FROM OLD.pay_group_id OR NEW.pay_structure_id IS DISTINCT FROM OLD.pay_structure_id OR
        NEW.currency_code IS DISTINCT FROM OLD.currency_code OR NEW.base_amount IS DISTINCT FROM OLD.base_amount OR
        NEW.annualized_amount IS DISTINCT FROM OLD.annualized_amount OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
        NEW.source_compensation_change_id IS DISTINCT FROM OLD.source_compensation_change_id
    ) THEN RAISE EXCEPTION 'Effective compensation facts are immutable; create a successor assignment' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND NEW.effective_until IS DISTINCT FROM OLD.effective_until AND NOT(
        OLD.status='active' AND NEW.status='superseded' AND OLD.effective_until IS NULL AND NEW.effective_until>=OLD.effective_from
    ) THEN RAISE EXCEPTION 'Compensation end date may only be set while superseding an active assignment' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='planned' AND NEW.status IN('active','cancelled')) OR
        (OLD.status='active' AND NEW.status IN('superseded','cancelled'))
    ) THEN RAISE EXCEPTION 'Invalid compensation assignment transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('superseded','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final compensation assignment is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN NEW;
END;
$$;
