CREATE OR REPLACE FUNCTION master.trg_validate_project_wbs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, document
AS $$
DECLARE
    v_parent master.project_wbs%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.parent_wbs_id IS DISTINCT FROM OLD.parent_wbs_id
       AND EXISTS (
           SELECT 1 FROM master.project_wbs c
            WHERE c.tenant_id = OLD.tenant_id
              AND c.project_id = OLD.project_id
              AND c.parent_wbs_id = OLD.id
       ) THEN
        RAISE EXCEPTION 'Reparenting a WBS with children is not allowed'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_wbs_id IS NULL THEN
        IF NEW.level_no <> 1 THEN
            RAISE EXCEPTION 'Root WBS level must be 1' USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_parent
          FROM master.project_wbs
         WHERE tenant_id = NEW.tenant_id
           AND project_id = NEW.project_id
           AND id = NEW.parent_wbs_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'WBS parent does not belong to the project'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_parent.is_postable THEN
            RAISE EXCEPTION 'A postable WBS cannot receive child WBS elements'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.level_no := v_parent.level_no + 1;
    END IF;

    IF NEW.parent_wbs_id IS NOT NULL AND EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT w.id, w.parent_wbs_id
              FROM master.project_wbs w
             WHERE w.tenant_id = NEW.tenant_id
               AND w.project_id = NEW.project_id
               AND w.id = NEW.parent_wbs_id
            UNION ALL
            SELECT w.id, w.parent_wbs_id
              FROM master.project_wbs w
              JOIN ancestors a ON a.parent_wbs_id = w.id
             WHERE w.tenant_id = NEW.tenant_id
               AND w.project_id = NEW.project_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'WBS hierarchy cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NOT OLD.is_postable
       AND NEW.is_postable
       AND EXISTS (
           SELECT 1 FROM master.project_wbs c
            WHERE c.tenant_id = NEW.tenant_id
              AND c.project_id = NEW.project_id
              AND c.parent_wbs_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'A WBS with children cannot become postable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_project_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_company uuid;
    v_uom text;
    v_project_company uuid;
BEGIN
    SELECT company_code_id INTO v_project_company
      FROM master.project
     WHERE tenant_id = NEW.tenant_id AND id = NEW.project_id;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id, base_uom_code INTO v_company, v_uom
          FROM master.item
         WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;
        IF FOUND AND (v_company <> v_project_company OR v_uom <> NEW.uom_code) THEN
            RAISE EXCEPTION 'Project item must match the project company and item base UOM'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
