-- Repair supplier preference guards after normalized scope cutover.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Supplier preference migration requires athyper_neon'; END IF; END $$;
-- Scope groups are alternatives; kinds within a group intersect, values within
-- a kind are alternatives, and exclusions subtract values from that group.
-- Check each effective-date boundary so expired or future rows are not flattened.
CREATE OR REPLACE FUNCTION control.supplier_preference_scopes_overlap(
    p_tenant_id uuid, p_left_id uuid, p_right_id uuid
) RETURNS boolean LANGUAGE sql VOLATILE
SET search_path=pg_catalog,control
AS $$
WITH bounds AS (
    SELECT greatest(l.effective_from,r.effective_from) lo,
           least(coalesce(l.effective_until,'infinity'::date),coalesce(r.effective_until,'infinity'::date)) hi
    FROM control.supplier_preference_designation l
    JOIN control.supplier_preference_designation r ON r.tenant_id=l.tenant_id
    WHERE l.tenant_id=p_tenant_id AND l.id=p_left_id AND r.id=p_right_id
), scopes AS (
    SELECT s.*,coalesce(s.operating_organization_id::text,s.company_code_id::text,
           s.commodity_category_id::text,s.country_code::text,s.tax_jurisdiction_id::text,
           s.organization_unit_id::text) target
    FROM control.business_partner_decision_scope s
    WHERE s.tenant_id=p_tenant_id AND s.supplier_preference_id IN(p_left_id,p_right_id)
), points AS (
    SELECT lo d FROM bounds WHERE lo<hi
    UNION SELECT effective_from FROM scopes,bounds WHERE effective_from>=lo AND effective_from<hi
    UNION SELECT effective_until FROM scopes,bounds WHERE effective_until>=lo AND effective_until<hi
), active AS (
    SELECT points.d,s.* FROM points JOIN scopes s ON s.effective_from<=points.d
       AND (s.effective_until IS NULL OR s.effective_until>points.d)
), groups AS (
    SELECT DISTINCT d,supplier_preference_id,scope_group FROM active WHERE scope_mode='include'
), pairs AS (
    SELECT l.d,l.scope_group lg,r.scope_group rg FROM groups l JOIN groups r ON r.d=l.d
    WHERE l.supplier_preference_id=p_left_id AND r.supplier_preference_id=p_right_id
), kinds AS (
    SELECT unnest(ARRAY['operating_organization','company_code','commodity_category','country','tax_jurisdiction','organization_unit']) kind
)
SELECT EXISTS (
    SELECT 1 FROM pairs p
    WHERE NOT EXISTS (
      SELECT 1 FROM active a WHERE a.d=p.d AND a.scope_mode='exclude' AND a.scope_kind='global'
        AND ((a.supplier_preference_id=p_left_id AND a.scope_group=p.lg)
          OR (a.supplier_preference_id=p_right_id AND a.scope_group=p.rg))
    ) AND NOT EXISTS (
      SELECT 1 FROM kinds k WHERE
        -- With no finite include list on either side, finite exclusions leave
        -- a shared wildcard. Otherwise at least one included target must survive.
        EXISTS (SELECT 1 FROM active a WHERE a.d=p.d AND a.scope_kind=k.kind AND a.scope_mode='include'
          AND ((a.supplier_preference_id=p_left_id AND a.scope_group=p.lg)
            OR (a.supplier_preference_id=p_right_id AND a.scope_group=p.rg)))
        AND NOT EXISTS (
          SELECT 1 FROM active candidate WHERE candidate.d=p.d AND candidate.scope_kind=k.kind
            AND candidate.scope_mode='include'
            AND ((candidate.supplier_preference_id=p_left_id AND candidate.scope_group=p.lg)
              OR (candidate.supplier_preference_id=p_right_id AND candidate.scope_group=p.rg))
            AND NOT EXISTS (
              SELECT 1 FROM (VALUES(p_left_id,p.lg),(p_right_id,p.rg)) side(id,grp)
              WHERE (EXISTS (SELECT 1 FROM active a WHERE a.d=p.d AND a.supplier_preference_id=side.id AND a.scope_group=side.grp AND a.scope_kind=k.kind AND a.scope_mode='include')
                AND NOT EXISTS (SELECT 1 FROM active a WHERE a.d=p.d AND a.supplier_preference_id=side.id AND a.scope_group=side.grp AND a.scope_kind=k.kind AND a.scope_mode='include' AND a.target=candidate.target))
                OR EXISTS (SELECT 1 FROM active a WHERE a.d=p.d AND a.supplier_preference_id=side.id AND a.scope_group=side.grp AND a.scope_kind=k.kind AND a.scope_mode='exclude' AND a.target=candidate.target)
            )
        )
    )
);
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_supplier_preference_designation()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,control,master
AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'pending' THEN
            RAISE EXCEPTION 'Supplier preference must be created pending before scope and approval'
                USING ERRCODE='check_violation';
        END IF;
    ELSE
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
           OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
           OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
           OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
           OR NEW.rationale IS DISTINCT FROM OLD.rationale
           OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Supplier preference scope and creation evidence are immutable' USING ERRCODE='check_violation';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 THEN
            RAISE EXCEPTION 'Supplier preference row version must advance exactly once' USING ERRCODE='check_violation';
        END IF;
        IF OLD.status='pending' AND NEW.status NOT IN('approved','rejected') THEN
            RAISE EXCEPTION 'Pending supplier preference may only be approved or rejected' USING ERRCODE='check_violation';
        ELSIF OLD.status='approved' AND NEW.status<>'revoked' THEN
            RAISE EXCEPTION 'Approved supplier preference may only be revoked' USING ERRCODE='check_violation';
        ELSIF OLD.status IN('rejected','revoked') THEN
            RAISE EXCEPTION 'Terminal supplier preference is immutable' USING ERRCODE='check_violation';
        END IF;
    END IF;
    -- Serialize decisions for the exact tenant/supplier and validate role ownership.
    PERFORM 1 FROM master.supplier WHERE tenant_id=NEW.tenant_id AND id=NEW.supplier_id
        AND business_partner_id=NEW.business_partner_id AND status<>'archived' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier does not belong to the selected business partner' USING ERRCODE='foreign_key_violation';
    END IF;
    IF NEW.status='approved' THEN
        IF NOT EXISTS (SELECT 1 FROM control.business_partner_decision_scope s
            WHERE s.tenant_id=NEW.tenant_id AND s.supplier_preference_id=NEW.id AND s.scope_mode='include'
              AND daterange(s.effective_from,s.effective_until,'[)') && daterange(NEW.effective_from,NEW.effective_until,'[)')) THEN
            RAISE EXCEPTION 'Supplier preference approval requires effective normalized scope' USING ERRCODE='check_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM control.supplier_preference_designation existing
            WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id
              AND existing.supplier_id=NEW.supplier_id AND existing.status='approved'
              AND control.supplier_preference_scopes_overlap(NEW.tenant_id,NEW.id,existing.id)) THEN
            RAISE EXCEPTION 'Overlapping approved supplier preference scope exists' USING ERRCODE='exclusion_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_supplier_preference_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
DECLARE v_status text;
BEGIN
    IF TG_OP<>'INSERT' THEN
        IF OLD.supplier_preference_id IS NOT NULL THEN
            RAISE EXCEPTION 'Supplier preference scope evidence is immutable' USING ERRCODE='check_violation';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        IF NEW.supplier_preference_id IS NOT NULL THEN
            RAISE EXCEPTION 'Existing scope cannot be reassigned to a supplier preference' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.supplier_preference_id IS NOT NULL THEN
        SELECT status::text INTO v_status FROM control.supplier_preference_designation
         WHERE tenant_id=NEW.tenant_id AND id=NEW.supplier_preference_id FOR UPDATE;
        IF v_status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION 'Scope may only be added to a pending supplier preference' USING ERRCODE='check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_partner_decision_scope_preference_guard ON control.business_partner_decision_scope;
CREATE TRIGGER trg_business_partner_decision_scope_preference_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.business_partner_decision_scope
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_supplier_preference_scope();

COMMIT;
