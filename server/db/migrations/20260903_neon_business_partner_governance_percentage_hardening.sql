BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_neon'
       OR current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION 'Business Partner governance percentage hardening requires the NEON plane';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.business_partner_governance_relation
         WHERE status = 'active'
         GROUP BY tenant_id, business_partner_id
        HAVING COALESCE(sum(ownership_pct), 0) > 100
            OR COALESCE(sum(voting_pct), 0) > 100
            OR COALESCE(sum(beneficial_ownership_pct), 0) > 100
    ) THEN
        RAISE EXCEPTION 'Active Business Partner governance percentages exceed 100%%; remediate historical rows before migration'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_enforce_business_partner_governance_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_business_partner_id uuid := COALESCE(NEW.business_partner_id, OLD.business_partner_id);
    v_ownership numeric;
    v_voting numeric;
    v_beneficial numeric;
BEGIN
    SELECT COALESCE(sum(ownership_pct), 0),
           COALESCE(sum(voting_pct), 0),
           COALESCE(sum(beneficial_ownership_pct), 0)
      INTO v_ownership, v_voting, v_beneficial
      FROM master.business_partner_governance_relation
     WHERE tenant_id = v_tenant_id
       AND business_partner_id = v_business_partner_id
       AND status = 'active';

    IF v_ownership > 100 OR v_voting > 100 OR v_beneficial > 100 THEN
        RAISE EXCEPTION 'Active Business Partner governance percentages exceed 100%%'
            USING ERRCODE = 'check_violation',
                  DETAIL = format(
                      'tenant_id=%s business_partner_id=%s ownership=%s voting=%s beneficial=%s',
                      v_tenant_id, v_business_partner_id, v_ownership, v_voting, v_beneficial
                  );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER trg_business_partner_governance_totals
AFTER INSERT OR UPDATE OF tenant_id, business_partner_id, ownership_pct,
    voting_pct, beneficial_ownership_pct, status OR DELETE
ON master.business_partner_governance_relation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_business_partner_governance_totals();

COMMIT;
