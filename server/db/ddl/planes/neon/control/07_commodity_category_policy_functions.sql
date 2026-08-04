CREATE OR REPLACE FUNCTION control.trg_guard_commodity_category_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated commodity policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.commodity_category_id IS DISTINCT FROM OLD.commodity_category_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR to_jsonb(NEW)->>'company_code_supplier_profile_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'company_code_supplier_profile_id'
       OR to_jsonb(NEW)->>'company_code_customer_profile_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'company_code_customer_profile_id'
       OR to_jsonb(NEW)->>'business_intent_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'business_intent_id'
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Commodity policy identity, scope, effective start and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_commodity_category_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_profile_id uuid;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.commodity_category
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.commodity_category_id
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'An active commodity policy requires an active category'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN (
        'commodity_category_buy_policy',
        'commodity_category_sell_policy'
    ) AND NOT EXISTS (
        SELECT 1 FROM master.business_intent
         WHERE tenant_id = NEW.tenant_id
           AND id = (to_jsonb(NEW)->>'business_intent_id')::uuid
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'An active commodity intent policy requires an active business intent'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'commodity_category_buy_policy' THEN
        v_profile_id := NULLIF(
            to_jsonb(NEW)->>'company_code_supplier_profile_id', ''
        )::uuid;
        IF v_profile_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM master.company_code_supplier_profile
             WHERE tenant_id = NEW.tenant_id
               AND company_code_id = NEW.company_code_id
               AND id = v_profile_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'An active buy policy requires an active supplier-company profile'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'commodity_category_sell_policy' THEN
        v_profile_id := NULLIF(
            to_jsonb(NEW)->>'company_code_customer_profile_id', ''
        )::uuid;
        IF v_profile_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM master.company_code_customer_profile
             WHERE tenant_id = NEW.tenant_id
               AND company_code_id = NEW.company_code_id
               AND id = v_profile_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'An active sell policy requires an active customer-company profile'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
