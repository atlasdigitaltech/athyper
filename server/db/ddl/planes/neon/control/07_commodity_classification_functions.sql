CREATE OR REPLACE FUNCTION control.trg_validate_commodity_code_classification_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, shared
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM shared.commodity_code
         WHERE domain_code = NEW.primary_commodity_domain_code
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'primary commodity domain % has no active commodity codes',
            NEW.primary_commodity_domain_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.trade_commodity_domain_code IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM shared.commodity_code
             WHERE domain_code = NEW.trade_commodity_domain_code
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'trade commodity domain % has no active commodity codes',
            NEW.trade_commodity_domain_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;
