-- Pre-quarantine seed-drift lint (Batch 5A).
--
-- 042p Â§3 (line 287) auto-quarantines entity_field rows whose column_name is
-- missing from information_schema.columns (sets is_active=false,
-- is_deprecated=true). The post-quarantine 100_ assertions (Â§P2P.1/Â§P2P.2)
-- filter on is_active=true, so any drift silently disappears before CI can see
-- it. This file runs BEFORE 042p Â§3 quarantine (alphabetic ordering: 042o < 042p)
-- and enforces the drift contract on all seeded rows, regardless of quarantine
-- state.
--
-- Execution mode is GUC-gated to match 100_control_seed_contract_assertions.sql:
--   SET app.assert_seed_contracts = 'on'   -> hard fail on violations (CI)
--   unset / anything else                  -> warning-only (local + emergency)
-- Strict values: 'on' | 'true' | '1' (case-insensitive).
--
-- Each section is its own DO-block so one drift doesn't tank the rest of the
-- report in warning mode.
--
-- Sections:
--   L1  entity_field.column_name          -> information_schema.columns  (P2P-scoped)
--   L2  display_config.list_columns[]     -> information_schema.columns  (P2P-scoped)
--   L3  display_config.title/subtitle/    -> information_schema.columns  (P2P-scoped)
--       details/create field arrays
--   L4  entity_relation.fk_field          -> information_schema.columns  (universal)
--   L5  entity_relation polymorphic       -> information_schema.columns  (universal)
--       source_type_field / source_id_field / source_line_field
--   L6  entity_flow_field.entity_field_id -> version-consistent          (universal)
--   L7  entity_field_surface.entity_field_id -> entity-consistent        (universal)
--
-- L1/L2/L3 mirror 100_control_seed_contract_assertions.sql Â§P2P.1/Â§P2P.2's
-- managed_entities scope. Non-P2P entities carry pre-existing drift that is
-- tracked for a separate cleanup batch (business_partner, customer, etc.);
-- widening the pre-quarantine gate before that cleanup would block resets.


-- Â§L1 entity_field.column_name must exist in information_schema.columns.
-- Scoped to the same 21 P2P entities as 100_ Â§P2P.1.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH managed_entities(entity_code) AS (
        VALUES
            ('accounting_distribution'), ('commitment'), ('commitment_line'),
            ('delivery_note'), ('delivery_note_line'), ('payment_entry'),
            ('payment_entry_allocation'), ('pricing_component'), ('purchase_invoice'),
            ('purchase_invoice_line'), ('purchase_order'), ('purchase_order_confirmation'),
            ('purchase_order_confirmation_line'), ('purchase_requisition'),
            ('purchase_requisition_line'), ('receipt'), ('receipt_line'),
            ('schedule_line'), ('service_sheet'), ('service_sheet_line'),
            ('journal_entry'), ('journal_line'), ('journal_line_reference')
    ),
    drift AS (
        SELECT e.entity_code, ef.name, ef.column_name
        FROM managed_entities me
        JOIN control.entity e ON e.entity_code = me.entity_code AND e.tenant_id IS NULL
        JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL
        JOIN control.entity_field ef ON ef.entity_version_id = ev.id
        WHERE ef.tenant_id IS NULL
          AND ef.is_deprecated = false
          AND COALESCE(ef.column_name, '') <> ''
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = e.table_schema
                AND c.table_name   = e.table_name
                AND c.column_name  = ef.column_name
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s->%s', entity_code, name, column_name), ', '
                    ORDER BY entity_code, name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L1 pre-quarantine column drift] % entity_field rows point at missing DDL columns. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L1 pre-quarantine column drift] % entity_field rows point at missing DDL columns. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L1 pre-quarantine column drift] PASSED.';
    END IF;
END $$;


-- Â§L2 display_config.list_columns[] must resolve to a physical column.
-- Scoped to the same P2P entities as Â§L1.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH managed_entities(entity_code) AS (
        VALUES
            ('accounting_distribution'), ('commitment'), ('commitment_line'),
            ('delivery_note'), ('delivery_note_line'), ('payment_entry'),
            ('payment_entry_allocation'), ('pricing_component'), ('purchase_invoice'),
            ('purchase_invoice_line'), ('purchase_order'), ('purchase_order_confirmation'),
            ('purchase_order_confirmation_line'), ('purchase_requisition'),
            ('purchase_requisition_line'), ('receipt'), ('receipt_line'),
            ('schedule_line'), ('service_sheet'), ('service_sheet_line'),
            ('journal_entry'), ('journal_line'), ('journal_line_reference')
    ),
    list_cols AS (
        SELECT e.entity_code, e.table_schema, e.table_name, item.value AS field_name
        FROM managed_entities me
        JOIN control.entity e ON e.entity_code = me.entity_code AND e.tenant_id IS NULL
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(e.display_config->'list_columns', '[]'::jsonb)
        ) AS item(value)
    ),
    drift AS (
        SELECT entity_code, field_name
        FROM list_cols lc
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = lc.table_schema
              AND c.table_name   = lc.table_name
              AND c.column_name  = lc.field_name
        )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, field_name), ', '
                    ORDER BY entity_code, field_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, field_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L2 list_columns drift] % display_config.list_columns entries do not match a physical column. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L2 list_columns drift] % display_config.list_columns entries do not match a physical column. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L2 list_columns drift] PASSED.';
    END IF;
END $$;


-- Â§L3 display_config title/subtitle/details/create field arrays must resolve to
-- a physical column. Covers title_field, title_fields, subtitle_fields,
-- details_fields, create_fields. Scoped to the same P2P entities as Â§L1.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH managed_entities(entity_code) AS (
        VALUES
            ('accounting_distribution'), ('commitment'), ('commitment_line'),
            ('delivery_note'), ('delivery_note_line'), ('payment_entry'),
            ('payment_entry_allocation'), ('pricing_component'), ('purchase_invoice'),
            ('purchase_invoice_line'), ('purchase_order'), ('purchase_order_confirmation'),
            ('purchase_order_confirmation_line'), ('purchase_requisition'),
            ('purchase_requisition_line'), ('receipt'), ('receipt_line'),
            ('schedule_line'), ('service_sheet'), ('service_sheet_line'),
            ('journal_entry'), ('journal_line'), ('journal_line_reference')
    ),
    scoped AS (
        SELECT e.entity_code, e.table_schema, e.table_name, e.display_config
        FROM managed_entities me
        JOIN control.entity e ON e.entity_code = me.entity_code AND e.tenant_id IS NULL
    ),
    cfg_fields AS (
        -- Scalar title_field
        SELECT s.entity_code, s.table_schema, s.table_name,
               'title_field'::text AS source,
               (s.display_config->>'title_field')::text AS field_name
        FROM scoped s
        WHERE (s.display_config->>'title_field') IS NOT NULL

        UNION ALL

        SELECT s.entity_code, s.table_schema, s.table_name,
               'title_fields', item.value
        FROM scoped s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(s.display_config->'title_fields', '[]'::jsonb)
        ) AS item(value)

        UNION ALL

        SELECT s.entity_code, s.table_schema, s.table_name,
               'subtitle_fields', item.value
        FROM scoped s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(s.display_config->'subtitle_fields', '[]'::jsonb)
        ) AS item(value)

        UNION ALL

        SELECT s.entity_code, s.table_schema, s.table_name,
               'details_fields', item.value
        FROM scoped s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(s.display_config->'details_fields', '[]'::jsonb)
        ) AS item(value)

        UNION ALL

        SELECT s.entity_code, s.table_schema, s.table_name,
               'create_fields', item.value
        FROM scoped s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(s.display_config->'create_fields', '[]'::jsonb)
        ) AS item(value)
    ),
    drift AS (
        SELECT entity_code, source, field_name
        FROM cfg_fields cf
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = cf.table_schema
              AND c.table_name   = cf.table_name
              AND c.column_name  = cf.field_name
        )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s[%s]', entity_code, source, field_name), ', '
                    ORDER BY entity_code, source, field_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, source, field_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L3 header field arrays drift] % title/subtitle/details/create fields do not match a physical column. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L3 header field arrays drift] % title/subtitle/details/create fields do not match a physical column. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L3 header field arrays drift] PASSED.';
    END IF;
END $$;


-- Â§L4 entity_relation.fk_field must exist as a physical column on the correct
-- side of the relation:
--   belongs_to: fk_field lives on SOURCE (source.fk_field -> target.target_key)
--   has_many:   fk_field lives on TARGET (source.target_key <- target.fk_field)
--   m2m:        skipped (fk_field is nullable per DDL CHECK)
-- Only checks resolution_kind='fk' (polymorphic is L5, array_fk is L4a).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH drift AS (
        SELECT src.entity_code AS source_entity,
               er.name AS relation_name,
               er.relation_kind,
               er.fk_field,
               CASE er.relation_kind
                 WHEN 'belongs_to' THEN src.entity_code
                 WHEN 'has_many'   THEN tgt.entity_code
               END AS bearer_entity
        FROM control.entity_relation er
        JOIN control.entity_version ev
             ON ev.id = er.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity src
             ON src.id = ev.entity_id AND src.tenant_id IS NULL
        LEFT JOIN control.entity tgt
             ON tgt.entity_code = er.target_entity AND tgt.tenant_id IS NULL
        WHERE er.tenant_id IS NULL
          AND er.resolution_kind = 'fk'
          AND COALESCE(er.fk_field, '') <> ''
          AND er.relation_kind IN ('belongs_to','has_many')
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = CASE er.relation_kind
                                       WHEN 'belongs_to' THEN src.table_schema
                                       WHEN 'has_many'   THEN tgt.table_schema
                                     END
                AND c.table_name   = CASE er.relation_kind
                                       WHEN 'belongs_to' THEN src.table_name
                                       WHEN 'has_many'   THEN tgt.table_name
                                     END
                AND c.column_name  = er.fk_field
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s(%s fk=%s on %s)', source_entity, relation_name, relation_kind, fk_field, bearer_entity), ', '
                    ORDER BY source_entity, relation_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY source_entity, relation_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L4 relation fk_field drift] % entity_relation rows reference missing FK columns. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L4 relation fk_field drift] % entity_relation rows reference missing FK columns. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L4 relation fk_field drift] PASSED.';
    END IF;
END $$;


-- Â§L5 Polymorphic entity_relation source_type_field / source_id_field /
-- source_line_field must exist as physical columns on the TARGET entity's
-- table (the polymorphic child that carries the source_* columns).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH poly AS (
        SELECT er.name AS relation_name,
               tgt.entity_code AS target_entity,
               tgt.table_schema AS tgt_schema,
               tgt.table_name AS tgt_table,
               er.source_type_field,
               er.source_id_field,
               er.source_line_field
        FROM control.entity_relation er
        JOIN control.entity_version ev
             ON ev.id = er.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity tgt
             ON tgt.entity_code = er.target_entity AND tgt.tenant_id IS NULL
        WHERE er.tenant_id IS NULL
          AND er.resolution_kind = 'polymorphic'
    ),
    drift AS (
        SELECT relation_name, target_entity, 'source_type_field'::text AS fld, source_type_field AS col
        FROM poly
        WHERE source_type_field IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = tgt_schema AND c.table_name = tgt_table
                AND c.column_name = source_type_field
          )
        UNION ALL
        SELECT relation_name, target_entity, 'source_id_field', source_id_field
        FROM poly
        WHERE source_id_field IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = tgt_schema AND c.table_name = tgt_table
                AND c.column_name = source_id_field
          )
        UNION ALL
        SELECT relation_name, target_entity, 'source_line_field', source_line_field
        FROM poly
        WHERE source_line_field IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = tgt_schema AND c.table_name = tgt_table
                AND c.column_name = source_line_field
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s->%s(%s=%s)', relation_name, target_entity, fld, col), ', '
                    ORDER BY relation_name, target_entity, fld), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY relation_name, target_entity, fld LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L5 polymorphic relation drift] % source_* columns missing on target tables. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L5 polymorphic relation drift] % source_* columns missing on target tables. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L5 polymorphic relation drift] PASSED.';
    END IF;
END $$;


-- Â§L6 entity_flow_field.entity_field_id must reference an entity_field row
-- that belongs to the SAME entity_version as the flow. Cross-version binding
-- is drift â€” a flow step attached to a field from another entity or version.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH drift AS (
        SELECT ent.entity_code, eflow.flow_code
        FROM control.entity_flow_field eff
        JOIN control.entity_flow_step efs ON efs.id = eff.flow_step_id
        JOIN control.entity_flow eflow ON eflow.id = efs.flow_id
        JOIN control.entity_version ev ON ev.id = eflow.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity ent ON ent.id = ev.entity_id AND ent.tenant_id IS NULL
        JOIN control.entity_field field ON field.id = eff.entity_field_id
        WHERE eff.tenant_id IS NULL
          AND field.entity_version_id <> eflow.entity_version_id
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, flow_code), ', '
                    ORDER BY entity_code, flow_code), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, flow_code LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L6 flow-field version drift] % entity_flow_field rows reference entity_field from a different entity_version. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L6 flow-field version drift] % entity_flow_field rows reference entity_field from a different entity_version. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L6 flow-field version drift] PASSED.';
    END IF;
END $$;


-- Â§L7 entity_field_surface.entity_field_id must reference an entity_field
-- whose entity_version belongs to the same entity as the surface. Guards
-- against wiring a surface for entity A to a field descriptor from entity B.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH drift AS (
        SELECT ent.entity_code, s.kind AS surface_kind
        FROM control.entity_field_surface efs
        JOIN control.entity_surface s ON s.id = efs.entity_surface_id
        JOIN control.entity ent ON ent.id = s.entity_id AND ent.tenant_id IS NULL
        JOIN control.entity_field field ON field.id = efs.entity_field_id
        JOIN control.entity_version ev ON ev.id = field.entity_version_id AND ev.tenant_id IS NULL
        WHERE efs.tenant_id IS NULL
          AND ev.entity_id <> s.entity_id
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, surface_kind), ', '
                    ORDER BY entity_code, surface_kind), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, surface_kind LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[042o.L7 surface-field cross-entity drift] % entity_field_surface rows reference entity_field from a different entity. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[042o.L7 surface-field cross-entity drift] % entity_field_surface rows reference entity_field from a different entity. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[042o.L7 surface-field cross-entity drift] PASSED.';
    END IF;
END $$;


-- Final notice
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
BEGIN
    IF v_strict THEN
        RAISE NOTICE '[042o pre-quarantine lint] Completed in STRICT mode.';
    ELSE
        RAISE NOTICE '[042o pre-quarantine lint] Completed in WARNING mode. Set app.assert_seed_contracts=on for CI strict.';
    END IF;
END $$;

