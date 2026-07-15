-- Asserts module/workspace linkage integrity for entity metadata.
-- Must run after entity rows are seeded.

DO $$
DECLARE
    v_missing_module int;
    v_missing_workspace int;
    v_missing_module_entities text;
    v_missing_workspace_entities text;
BEGIN
    SELECT COUNT(*)
      INTO v_missing_module
      FROM control.entity e
      LEFT JOIN shared.module m ON m.id::text = e.module_id
     WHERE m.id IS NULL;

    SELECT COALESCE(string_agg(e.entity_code, ', ' ORDER BY e.entity_code), 'N/A')
      INTO v_missing_module_entities
      FROM (
          SELECT e.entity_code
          FROM control.entity e
          LEFT JOIN shared.module m ON m.id::text = e.module_id
          WHERE m.id IS NULL
          LIMIT 20
      ) e;

    IF v_missing_module > 0 THEN
        RAISE EXCEPTION '[099_entity_module_workspace_integrity] Found % control.entity rows where module_id does not resolve to shared.module.id. Sample entities: %',
            v_missing_module, v_missing_module_entities;
    END IF;

    SELECT COUNT(*)
      INTO v_missing_workspace
      FROM control.entity e
      JOIN shared.module m ON m.id::text = e.module_id
      LEFT JOIN shared.workspace w ON w.id = m.workspace_id
     WHERE w.id IS NULL;

    SELECT COALESCE(string_agg(e.entity_code, ', ' ORDER BY e.entity_code), 'N/A')
      INTO v_missing_workspace_entities
      FROM (
          SELECT e.entity_code
          FROM control.entity e
          JOIN shared.module m ON m.id::text = e.module_id
          LEFT JOIN shared.workspace w ON w.id = m.workspace_id
          WHERE w.id IS NULL
          LIMIT 20
      ) e;

    IF v_missing_workspace > 0 THEN
        RAISE EXCEPTION '[099_entity_module_workspace_integrity] Found % control.entity rows linked to shared.module rows without workspace_id. Sample entities: %',
            v_missing_workspace, v_missing_workspace_entities;
    END IF;

    RAISE NOTICE '[099_entity_module_workspace_integrity] PASSED: module/workspace linkage is consistent for control.entity.';
END $$;

