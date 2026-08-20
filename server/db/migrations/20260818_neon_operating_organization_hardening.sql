-- Harden Neon operating-organization hierarchy and company assignments.
-- Apply once to the Neon plane database as the schema owner.
--
-- This migration intentionally refuses to guess how invalid legacy data should
-- be repaired. Resolve any reported rows before retrying the transaction.

BEGIN;

LOCK TABLE master.operating_organization IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE master.operating_organization_company_assignment IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE master.procurement_organization_profile IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE master.sales_organization_profile IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment
         WHERE participation_role NOT IN ('lead', 'participant')
    ) THEN
        RAISE EXCEPTION
            'Operating-organization assignments contain unsupported participation roles; expected lead or participant';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment AS left_assignment
          JOIN master.operating_organization_company_assignment AS right_assignment
            ON right_assignment.tenant_id = left_assignment.tenant_id
           AND right_assignment.operating_organization_id = left_assignment.operating_organization_id
           AND right_assignment.company_code_id = left_assignment.company_code_id
           AND right_assignment.participation_role = left_assignment.participation_role
           AND right_assignment.id > left_assignment.id
           AND daterange(
                 right_assignment.effective_from,
                 COALESCE(right_assignment.effective_until, 'infinity'::date),
                 '[)'
               ) && daterange(
                 left_assignment.effective_from,
                 COALESCE(left_assignment.effective_until, 'infinity'::date),
                 '[)'
               )
         WHERE left_assignment.status = 'active'
           AND right_assignment.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Active operating-organization company assignments contain overlapping effective periods';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.procurement_organization_profile AS profile
         WHERE profile.lead_company_code_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM master.operating_organization_company_assignment AS assignment
                WHERE assignment.tenant_id = profile.tenant_id
                  AND assignment.operating_organization_id = profile.operating_organization_id
                  AND assignment.company_code_id = profile.lead_company_code_id
                  AND assignment.status = 'active'
                  AND assignment.effective_from <= CURRENT_DATE
                  AND (assignment.effective_until IS NULL OR assignment.effective_until > CURRENT_DATE)
           )
    ) OR EXISTS (
        SELECT 1
          FROM master.sales_organization_profile AS profile
          CROSS JOIN LATERAL unnest(ARRAY[
              profile.booking_company_code_id,
              profile.invoicing_company_code_id
          ]) AS default_company(company_code_id)
         WHERE default_company.company_code_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM master.operating_organization_company_assignment AS assignment
                WHERE assignment.tenant_id = profile.tenant_id
                  AND assignment.operating_organization_id = profile.operating_organization_id
                  AND assignment.company_code_id = default_company.company_code_id
                  AND assignment.status = 'active'
                  AND assignment.effective_from <= CURRENT_DATE
                  AND (assignment.effective_until IS NULL OR assignment.effective_until > CURRENT_DATE)
           )
    ) THEN
        RAISE EXCEPTION
            'An operating-organization profile default company is not an effective member';
    END IF;
END;
$$;

DO $$
DECLARE
    v_has_cycle boolean;
    v_max_depth integer;
BEGIN
    WITH RECURSIVE hierarchy AS (
        SELECT organization.tenant_id,
               organization.id AS origin_id,
               organization.parent_operating_organization_id AS parent_id,
               ARRAY[organization.id] AS visited,
               1 AS depth,
               false AS has_cycle
          FROM master.operating_organization AS organization
        UNION ALL
        SELECT parent.tenant_id,
               hierarchy.origin_id,
               parent.parent_operating_organization_id,
               hierarchy.visited || parent.id,
               hierarchy.depth + 1,
               parent.id = ANY(hierarchy.visited)
          FROM hierarchy
          JOIN master.operating_organization AS parent
            ON parent.tenant_id = hierarchy.tenant_id
           AND parent.id = hierarchy.parent_id
         WHERE hierarchy.parent_id IS NOT NULL
           AND NOT hierarchy.has_cycle
    )
    SELECT COALESCE(bool_or(has_cycle), false), COALESCE(max(depth), 0)
      INTO v_has_cycle, v_max_depth
      FROM hierarchy;

    IF v_has_cycle THEN
        RAISE EXCEPTION 'Operating-organization hierarchy contains a cycle';
    END IF;
    IF v_max_depth > 12 THEN
        RAISE EXCEPTION
            'Operating-organization hierarchy depth % exceeds maximum depth 12', v_max_depth;
    END IF;
END;
$$;

ALTER TABLE master.operating_organization_company_assignment
    DROP CONSTRAINT IF EXISTS operating_organization_company_assignment_role_chk;
ALTER TABLE master.operating_organization_company_assignment
    ADD CONSTRAINT operating_organization_company_assignment_role_chk
    CHECK (participation_role IN ('lead', 'participant'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'master.operating_organization_company_assignment'::regclass
           AND conname = 'operating_organization_company_assignment_no_overlap_excl'
    ) THEN
        ALTER TABLE master.operating_organization_company_assignment
            ADD CONSTRAINT operating_organization_company_assignment_no_overlap_excl
            EXCLUDE USING gist (
                tenant_id WITH =,
                operating_organization_id WITH =,
                company_code_id WITH =,
                participation_role WITH =,
                daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
            ) WHERE (status = 'active');
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS operating_organization_company_active_org_idx
    ON master.operating_organization_company_assignment
       (tenant_id, operating_organization_id, effective_from, effective_until, company_code_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS operating_organization_company_active_company_idx
    ON master.operating_organization_company_assignment
       (tenant_id, company_code_id, effective_from, effective_until, operating_organization_id)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION master.trg_guard_organization_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_id uuid := nullif(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
    v_cycle boolean;
    v_depth integer;
    v_max_depth integer := CASE
        WHEN array_length(TG_ARGV, 1) > 1 THEN TG_ARGV[1]::integer
        ELSE NULL
    END;
BEGIN
    IF v_parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format(
        'WITH RECURSIVE ancestors AS (
             SELECT id, %1$I AS parent_id, 1 AS depth, ARRAY[id] AS visited
               FROM master.%2$I
              WHERE tenant_id = $1 AND id = $2
             UNION ALL
             SELECT parent.id, parent.%1$I, ancestors.depth + 1, ancestors.visited || parent.id
               FROM master.%2$I AS parent
               JOIN ancestors ON parent.id = ancestors.parent_id
              WHERE parent.tenant_id = $1
                AND NOT parent.id = ANY(ancestors.visited)
         )
         SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = $3),
                COALESCE(MAX(depth), 0)
           FROM ancestors',
        TG_ARGV[0], TG_TABLE_NAME
    )
    INTO v_cycle, v_depth
    USING NEW.tenant_id, v_parent_id, NEW.id;

    IF v_cycle THEN
        RAISE EXCEPTION '%.% hierarchy cycle detected',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_max_depth IS NOT NULL AND v_depth >= v_max_depth THEN
        RAISE EXCEPTION '%.% hierarchy exceeds maximum depth %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_max_depth
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_operating_organization_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_domain master.operating_organization_domain_d;
    v_company_ids uuid[];
    v_company_id uuid;
BEGIN
    SELECT organization.domain
      INTO v_domain
      FROM master.operating_organization AS organization
     WHERE organization.tenant_id = NEW.tenant_id
       AND organization.id = NEW.operating_organization_id;

    IF v_domain IS NULL THEN
        RAISE EXCEPTION 'Operating organization does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF TG_TABLE_NAME = 'procurement_organization_profile'
       AND v_domain NOT IN ('procurement', 'both') THEN
        RAISE EXCEPTION 'Procurement profile requires procurement or both domain'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'sales_organization_profile'
       AND v_domain NOT IN ('sales', 'both') THEN
        RAISE EXCEPTION 'Sales profile requires sales or both domain'
            USING ERRCODE = 'check_violation';
    END IF;

    v_company_ids := CASE TG_TABLE_NAME
        WHEN 'procurement_organization_profile' THEN ARRAY[
            nullif(to_jsonb(NEW) ->> 'lead_company_code_id', '')::uuid
        ]
        WHEN 'sales_organization_profile' THEN ARRAY[
            nullif(to_jsonb(NEW) ->> 'booking_company_code_id', '')::uuid,
            nullif(to_jsonb(NEW) ->> 'invoicing_company_code_id', '')::uuid
        ]
        ELSE ARRAY[]::uuid[]
    END;

    FOREACH v_company_id IN ARRAY v_company_ids LOOP
        IF v_company_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM master.operating_organization_company_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.operating_organization_id = NEW.operating_organization_id
               AND assignment.company_code_id = v_company_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= CURRENT_DATE
               AND (assignment.effective_until IS NULL OR assignment.effective_until > CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION 'Operating organization profile default company is not an effective member'
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operating_organization_hierarchy_cycle
    ON master.operating_organization;
CREATE TRIGGER trg_operating_organization_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_operating_organization_id ON master.operating_organization
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_organization_hierarchy_cycle(
    'parent_operating_organization_id', '12'
);

DROP TRIGGER IF EXISTS trg_procurement_organization_profile_domain
    ON master.procurement_organization_profile;
CREATE TRIGGER trg_procurement_organization_profile_domain
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, lead_company_code_id
ON master.procurement_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile();

DROP TRIGGER IF EXISTS trg_sales_organization_profile_domain
    ON master.sales_organization_profile;
CREATE TRIGGER trg_sales_organization_profile_domain
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id,
    booking_company_code_id, invoicing_company_code_id
ON master.sales_organization_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_operating_organization_profile();

COMMIT;
