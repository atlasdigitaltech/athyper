-- Final guardrail for the 003_control/* seed bundle. Runs after 099_control_entity_module_workspace_integrity_contract.sql.
-- Catches silent-no-op failures: INNER JOIN/NOT EXISTS predicates that drop rows when a
-- dependency is missing, references to entity codes / lifecycle states / event codes /
-- permissions / templates / field groups that don't exist, and visibility-vocabulary
-- drift (hideIn / hide_in / hidden) that hides forever or never depending on renderer.
--
-- Execution mode is GUC-gated:
--   SET app.assert_seed_contracts = 'on'   â†’ hard fail on violations (CI)
--   unset / anything else                  â†’ warning-only (local + emergency reseeds)
-- Strict values: 'on' | 'true' | '1' (case-insensitive).
--
-- Each section is its own DO-block so one drift doesn't tank the rest of the report in warning mode.


-- Â§1 entity_relation.target_entity must resolve to a registered entity_code.
-- Silent fan-out from 043 JOINs when the target isn't in control.entity
-- (e.g. commodity_category, product, item, business_unit).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH orphans AS (
        SELECT DISTINCT er.target_entity
        FROM control.entity_relation er
        LEFT JOIN control.entity e
               ON e.entity_code = er.target_entity
              AND e.tenant_id IS NULL
        WHERE er.tenant_id IS NULL
          AND e.id IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(target_entity, ', ' ORDER BY target_entity), '')
      INTO v_count, v_sample
      FROM (SELECT target_entity FROM orphans ORDER BY target_entity LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§1 entity_relation orphans] % distinct target_entity values not in control.entity. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§1 entity_relation orphans] % distinct target_entity values not in control.entity. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§1 entity_relation] PASSED.';
    END IF;
END $$;


-- Â§P2P.1 Active P2P entity fields must point at real DDL/view columns.
-- 042p retires known drift; this assertion prevents new drift from slipping
-- into list/detail surfaces during full reset.
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
            ('schedule_line'), ('service_sheet'), ('service_sheet_line')
    ),
    drift AS (
        SELECT e.entity_code, ef.name, ef.column_name
        FROM managed_entities me
        JOIN control.entity e ON e.entity_code = me.entity_code AND e.tenant_id IS NULL
        JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
        JOIN control.entity_field ef ON ef.entity_version_id = ev.id
        WHERE ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND ef.is_deprecated = false
          AND COALESCE(ef.column_name, '') <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM information_schema.columns c
              WHERE c.table_schema = e.table_schema
                AND c.table_name = e.table_name
                AND c.column_name = ef.column_name
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s->%s', entity_code, name, column_name), ', '
                    ORDER BY entity_code, name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM drift ORDER BY entity_code, name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.P2P.1 field/DDL drift] % active P2P fields map to missing columns. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.P2P.1 field/DDL drift] % active P2P fields map to missing columns. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.P2P.1 field/DDL drift] PASSED.';
    END IF;
END $$;


-- Â§P2P.2 P2P display_config.list_columns must resolve to active entity_field rows.
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
            ('schedule_line'), ('service_sheet'), ('service_sheet_line')
    ),
    list_cols AS (
        SELECT e.entity_code, item.value AS field_name
        FROM managed_entities me
        JOIN control.entity e ON e.entity_code = me.entity_code AND e.tenant_id IS NULL
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.display_config->'list_columns', '[]'::jsonb)) AS item(value)
    ),
    missing AS (
        SELECT lc.entity_code, lc.field_name
        FROM list_cols lc
        JOIN control.entity e ON e.entity_code = lc.entity_code AND e.tenant_id IS NULL
        JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
        LEFT JOIN control.entity_field ef
               ON ef.entity_version_id = ev.id
              AND ef.name = lc.field_name
               AND ef.is_active = true
               AND COALESCE(ef.runtime_enabled, true) = true
               AND ef.is_deprecated = false
        WHERE ef.id IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, field_name), ', '
                    ORDER BY entity_code, field_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM missing ORDER BY entity_code, field_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.P2P.2 list columns] % P2P list columns do not resolve to active fields. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.P2P.2 list columns] % P2P list columns do not resolve to active fields. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.P2P.2 list columns] PASSED.';
    END IF;
END $$;


-- Â§P2P.3 Core line fields required by the shared P2P drawer/runtime must exist.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH required_fields(entity_code, field_name) AS (
        VALUES
            ('purchase_requisition_line','item_description'),
            ('purchase_requisition_line','uom_code'),
            ('purchase_requisition_line','quantity'),
            ('purchase_requisition_line','unit_price'),
            ('purchase_requisition_line','price_unit'),
            ('purchase_requisition_line','currency_code'),
            ('purchase_requisition_line','net_amount'),
            ('commitment_line','item_description'),
            ('commitment_line','procurement_type'),
            ('commitment_line','line_type'),
            ('commitment_line','commodity_category_id'),
            ('commitment_line','business_intent_id'),
            ('commitment_line','classification_decision'),
            ('commitment_line','asset_class_id'),
            ('commitment_line','uom_code'),
            ('commitment_line','quantity'),
            ('commitment_line','unit_price'),
            ('commitment_line','price_unit'),
            ('commitment_line','currency_code'),
            ('commitment_line','net_amount'),
            ('commitment_line','over_delivery_tolerance'),
            ('commitment_line','under_delivery_tolerance'),
            ('commitment_line','tax_group_id'),
            ('commitment_line','withholding_tax_group_id'),
            ('commitment_line','required_by_date'),
            ('commitment_line','site_id'),
            ('commitment_line','warehouse_id'),
            ('commitment_line','storage_location'),
            ('commitment_line','shipto_address_id'),
            ('commitment_line','billto_address_id'),
            ('commitment_line','billfrom_address_id'),
            ('commitment_line','supplier_id'),
            ('commitment_line','shipfrom_address_id'),
            ('commitment_line','remitto_address_id'),
            ('purchase_invoice_line','item_description'),
            ('purchase_invoice_line','uom_code'),
            ('purchase_invoice_line','quantity'),
            ('purchase_invoice_line','unit_price'),
            ('purchase_invoice_line','price_unit'),
            ('purchase_invoice_line','currency_code'),
            ('purchase_invoice_line','net_amount'),
            ('receipt_line','item_description'),
            ('receipt_line','received_quantity'),
            ('receipt_line','accepted_quantity'),
            ('receipt_line','unit_price'),
            ('receipt_line','net_amount'),
            ('service_sheet_line','item_description'),
            ('service_sheet_line','uom_code'),
            ('service_sheet_line','quantity'),
            ('service_sheet_line','unit_price'),
            ('service_sheet_line','net_amount'),
            ('delivery_note_line','item_description'),
            ('delivery_note_line','shipped_quantity'),
            ('delivery_note_line','accepted_quantity'),
            ('purchase_order_confirmation_line','commitment_line_id'),
            ('purchase_order_confirmation_line','confirmed_quantity'),
            ('purchase_order_confirmation_line','confirmed_unit_price')
    ),
    missing AS (
        SELECT rf.entity_code, rf.field_name
        FROM required_fields rf
        JOIN control.entity e ON e.entity_code = rf.entity_code AND e.tenant_id IS NULL
        JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
        LEFT JOIN control.entity_field ef
               ON ef.entity_version_id = ev.id
              AND ef.name = rf.field_name
               AND ef.is_active = true
               AND COALESCE(ef.runtime_enabled, true) = true
               AND ef.is_deprecated = false
        WHERE ef.id IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, field_name), ', '
                    ORDER BY entity_code, field_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM missing ORDER BY entity_code, field_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.P2P.3 core line fields] % required P2P line fields missing. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.P2P.3 core line fields] % required P2P line fields missing. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.P2P.3 core line fields] PASSED.';
    END IF;
END $$;


-- Â§P2P.4 Purchase Order facade must bind to the commitment lifecycle.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad_bindings AS (
        SELECT el.entity_name, lc.code AS lifecycle_code
        FROM control.entity_lifecycle el
        JOIN control.lifecycle lc ON lc.id = el.lifecycle_id
        WHERE el.tenant_id IS NULL
          AND el.entity_name = 'purchase_order'
          AND lc.code <> 'commitment'
    ),
    missing_binding AS (
        SELECT 'purchase_order'::text AS entity_name, 'missing commitment binding'::text AS lifecycle_code
        WHERE NOT EXISTS (
            SELECT 1
            FROM control.entity_lifecycle el
            JOIN control.lifecycle lc ON lc.id = el.lifecycle_id
            WHERE el.tenant_id IS NULL
              AND el.entity_name = 'purchase_order'
              AND lc.code = 'commitment'
        )
    ),
    violations AS (
        SELECT * FROM bad_bindings
        UNION ALL
        SELECT * FROM missing_binding
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s->%s', entity_name, lifecycle_code), ', '
                    ORDER BY entity_name, lifecycle_code), '')
      INTO v_count, v_sample
      FROM violations;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.P2P.4 PO lifecycle] Purchase Order lifecycle binding is not canonical. Sample: %', v_sample;
        ELSE
            RAISE WARNING  '[100.P2P.4 PO lifecycle] Purchase Order lifecycle binding is not canonical. Sample: %', v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.P2P.4 PO lifecycle] PASSED.';
    END IF;
END $$;


-- Â§2 entity_lifecycle.entity_name must resolve to a registered entity_code
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH orphans AS (
        SELECT DISTINCT el.entity_name
        FROM control.entity_lifecycle el
        LEFT JOIN control.entity e
               ON e.entity_code = el.entity_name
              AND e.tenant_id IS NULL
        WHERE el.tenant_id IS NULL
          AND e.id IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(entity_name, ', ' ORDER BY entity_name), '')
      INTO v_count, v_sample
      FROM (SELECT entity_name FROM orphans ORDER BY entity_name LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§2 entity_lifecycle orphan entities] % distinct entity_name values not in control.entity. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§2 entity_lifecycle orphan entities] % distinct entity_name values not in control.entity. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§2 entity_lifecycle entities] PASSED.';
    END IF;
END $$;


-- Â§3 entity_lifecycle.lifecycle_id must resolve to a registered lifecycle
-- Catches the 045_control_entity_lifecycle_contract.sql "upupr" dead-binding pattern: SELECT by
-- code returns zero rows, INSERT inserts zero rows, no warning. Here we check
-- post-bind: any lifecycle_id that doesn't resolve is a corrupt or stale row.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    SELECT count(*),
           COALESCE(string_agg(
               format('%sâ†’%s', el.entity_name, el.lifecycle_id), ', '
               ORDER BY el.entity_name), '')
      INTO v_count, v_sample
      FROM (
          SELECT el.entity_name, el.lifecycle_id
          FROM control.entity_lifecycle el
          LEFT JOIN control.lifecycle lc ON lc.id = el.lifecycle_id
          WHERE el.tenant_id IS NULL
            AND lc.id IS NULL
          LIMIT 20
      ) el;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§3 entity_lifecycle orphan lifecycle_id] % rows reference missing lifecycle. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§3 entity_lifecycle orphan lifecycle_id] % rows reference missing lifecycle. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§3 entity_lifecycle lifecycle_id] PASSED.';
    END IF;
END $$;


-- Â§4 entity_lifecycle_state_mask.record_status must exist as a lifecycle_state code
-- for some lifecycle bound to that entity. Catches the 'matched' pattern: a PI mask
-- referencing a state the PI lifecycle never declared (mask is dead).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bound_states AS (
        SELECT el.entity_name, ls.code AS state_code
        FROM control.entity_lifecycle el
        JOIN control.lifecycle_state ls ON ls.lifecycle_id = el.lifecycle_id
        WHERE el.tenant_id IS NULL
    ),
    orphans AS (
        SELECT m.entity_name, m.record_status
        FROM control.entity_lifecycle_state_mask m
        LEFT JOIN bound_states bs
               ON bs.entity_name = m.entity_name
              AND bs.state_code  = m.record_status
        WHERE m.tenant_id IS NULL
          AND bs.state_code IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(
               format('%s.%s', entity_name, record_status), ', '
               ORDER BY entity_name, record_status), '')
      INTO v_count, v_sample
      FROM (SELECT entity_name, record_status FROM orphans
            ORDER BY entity_name, record_status LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§4 state_mask orphan status] % masks reference states not declared on any bound lifecycle. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§4 state_mask orphan status] % masks reference states not declared on any bound lifecycle. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§4 state_mask] PASSED.';
    END IF;
END $$;


-- Â§5 lifecycle_transition_hook event_codes must exist in transaction_event_catalog
-- transaction_flow.dispatch hooks carry the event_code in config; without a
-- catalog row the dispatcher silently no-ops. Catches the REVERSAL/RELEASE gap
-- between 070z and 080.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH hook_codes AS (
        SELECT DISTINCT (config ->> 'event_code') AS event_code
        FROM control.lifecycle_transition_hook
        WHERE action = 'transaction_flow.dispatch'
          AND config ? 'event_code'
          AND tenant_id IS NULL
    ),
    orphans AS (
        SELECT hc.event_code
        FROM hook_codes hc
        LEFT JOIN control.transaction_event_catalog tec
               ON tec.code = hc.event_code
        WHERE tec.code IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(event_code, ', ' ORDER BY event_code), '')
      INTO v_count, v_sample
      FROM (SELECT event_code FROM orphans ORDER BY event_code LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§5 hook event_code orphans] % distinct event_codes dispatched by hooks not in transaction_event_catalog. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§5 hook event_code orphans] % distinct event_codes dispatched by hooks not in transaction_event_catalog. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§5 hook event_codes] PASSED.';
    END IF;
END $$;


-- Â§5a Purchase Order facade hooks must resolve through the active commitment
-- lifecycle. Hooks attach to commitment transitions, while the dispatcher
-- continues to pass sourceDocType='purchase_order' to activity/snapshot code.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH expected_activity AS (
        SELECT lt.id AS transition_id
          FROM control.lifecycle lc
          JOIN control.lifecycle_transition lt ON lt.lifecycle_id = lc.id
         WHERE lc.tenant_id IS NULL
           AND lc.code = 'commitment'
           AND lc.is_active = true
           AND lt.tenant_id IS NULL
           AND lt.is_active = true
    ),
    activity_coverage AS (
        SELECT ea.transition_id, count(lth.id) AS hook_count
          FROM expected_activity ea
          LEFT JOIN control.lifecycle_transition_hook lth
            ON lth.transition_id = ea.transition_id
           AND lth.tenant_id IS NULL
           AND lth.action = 'activity_log.write'
           AND lth.timing = 'after'
           AND lth.sort_order = 10
           AND lth.contract_role = 'contract'
           AND lth.safety_level = 'required'
           AND lth.is_active = true
         GROUP BY ea.transition_id
    ),
    notification_coverage AS (
        SELECT ea.transition_id, count(lth.id) AS hook_count
          FROM expected_activity ea
          LEFT JOIN control.lifecycle_transition_hook lth
            ON lth.transition_id = ea.transition_id
           AND lth.tenant_id IS NULL
           AND lth.action = 'notification.publish'
           AND lth.timing = 'after'
           AND lth.sort_order = 60
           AND lth.contract_role = 'extension'
           AND lth.safety_level = 'narrowable'
           AND lth.is_active = true
         GROUP BY ea.transition_id
    ),
    outbox_coverage AS (
        SELECT ea.transition_id, count(lth.id) AS hook_count
          FROM expected_activity ea
          LEFT JOIN control.lifecycle_transition_hook lth
            ON lth.transition_id = ea.transition_id
           AND lth.tenant_id IS NULL
           AND lth.action = 'emit_event'
           AND lth.timing = 'after'
           AND lth.sort_order = 50
           AND lth.contract_role = 'contract'
           AND lth.safety_level = 'required'
           AND lth.is_active = true
         GROUP BY ea.transition_id
    ),
    operation_coverage AS (
        SELECT lt.id AS transition_id, lt.operation_code,
               count(DISTINCT eo.id) AS operation_count,
               count(DISTINCT p.id) AS permission_count
          FROM control.lifecycle lc
          JOIN control.lifecycle_transition lt ON lt.lifecycle_id = lc.id
          LEFT JOIN control.entity_operation eo
            ON eo.tenant_id IS NULL
           AND eo.entity_name = 'purchase_order'
           AND eo.permission_code = lt.operation_code
           AND eo.is_enabled = true
          LEFT JOIN shared.permission p
            ON p.code = lt.operation_code AND p.status = 'active'
         WHERE lc.tenant_id IS NULL AND lc.code = 'commitment' AND lc.is_active = true
           AND lt.tenant_id IS NULL AND lt.is_active = true
         GROUP BY lt.id, lt.operation_code
    ),
    expected_snapshot(from_code, to_code, kind) AS (
        VALUES
            ('draft', 'pending_approval', 'authoring_lock'),
            ('pending_approval', 'approved', 'commitment'),
            ('approved', 'active', 'commitment'),
            ('pending_approval', 'rejected', 'amendment_baseline'),
            ('pending_approval', 'draft', 'amendment_baseline'),
            ('rejected', 'draft', 'amendment_baseline'),
            ('draft', 'cancelled', 'reversal'),
            ('pending_approval', 'cancelled', 'reversal'),
            ('approved', 'cancelled', 'reversal'),
            ('active', 'cancelled', 'reversal'),
            ('partially_fulfilled', 'cancelled', 'reversal'),
            ('approved', 'closed', 'reversal'),
            ('active', 'closed', 'reversal'),
            ('partially_fulfilled', 'closed', 'reversal'),
            ('fully_fulfilled', 'closed', 'fulfillment'),
            ('approved', 'expired', 'reversal'),
            ('active', 'expired', 'reversal')
    ),
    snapshot_coverage AS (
        SELECT es.from_code, es.to_code, es.kind, count(lth.id) AS hook_count
          FROM expected_snapshot es
          LEFT JOIN control.lifecycle lc
            ON lc.tenant_id IS NULL
           AND lc.code = 'commitment'
           AND lc.is_active = true
          LEFT JOIN control.lifecycle_state fs
            ON fs.lifecycle_id = lc.id AND fs.code = es.from_code
          LEFT JOIN control.lifecycle_state ts
            ON ts.lifecycle_id = lc.id AND ts.code = es.to_code
          LEFT JOIN control.lifecycle_transition lt
            ON lt.lifecycle_id = lc.id
           AND lt.from_state_id = fs.id
           AND lt.to_state_id = ts.id
           AND lt.tenant_id IS NULL
           AND lt.is_active = true
          LEFT JOIN control.lifecycle_transition_hook lth
            ON lth.transition_id = lt.id
           AND lth.tenant_id IS NULL
           AND lth.action = 'snapshot.capture'
           AND lth.timing = 'after'
           AND lth.sort_order = 20
           AND lth.contract_role = 'contract'
           AND lth.safety_level = 'required'
           AND lth.is_active = true
           AND lth.config ->> 'gate_event_kind' = es.kind
         GROUP BY es.from_code, es.to_code, es.kind
    ),
    retired_active_hooks AS (
        SELECT lth.id, lth.action
          FROM control.lifecycle lc
          JOIN control.lifecycle_transition lt ON lt.lifecycle_id = lc.id
          JOIN control.lifecycle_transition_hook lth ON lth.transition_id = lt.id
         WHERE lc.tenant_id IS NULL
           AND lc.code = 'purchase_order'
           AND lth.tenant_id IS NULL
           AND lth.action IN ('activity_log.write', 'snapshot.capture', 'emit_event', 'notification.publish')
           AND lth.is_active = true
    ),
    place_order_contract AS (
        SELECT 'approved->active transition must use PO.PLACE_ORDER'::text AS finding
         WHERE 1 <> (
             SELECT count(*)
               FROM control.lifecycle lc
               JOIN control.lifecycle_state fs ON fs.lifecycle_id = lc.id AND fs.code = 'approved'
               JOIN control.lifecycle_state ts ON ts.lifecycle_id = lc.id AND ts.code = 'active'
               JOIN control.lifecycle_transition lt
                 ON lt.lifecycle_id = lc.id
                AND lt.from_state_id = fs.id
                AND lt.to_state_id = ts.id
              WHERE lc.tenant_id IS NULL
                AND lc.code = 'commitment'
                AND lc.is_active = true
                AND lt.tenant_id IS NULL
                AND lt.operation_code = 'PO.PLACE_ORDER'
                AND lt.is_active = true
         )
        UNION ALL
        SELECT 'purchase_order operation PO.PLACE_ORDER must dispatch to place_order'
         WHERE 1 <> (
             SELECT count(*)
               FROM control.entity_operation eo
              WHERE eo.tenant_id IS NULL
                AND eo.entity_name = 'purchase_order'
                AND eo.permission_code = 'PO.PLACE_ORDER'
                AND eo.handler_type = 'MODAL'
                AND eo.handler_target = 'place_order'
                AND eo.is_enabled = true
         )
        UNION ALL
        SELECT 'approved purchase_order must expose HEADER.PLACE_ORDER'
         WHERE 1 <> (
             SELECT count(*)
               FROM control.entity_action_rule ear
              WHERE ear.entity_code = 'purchase_order'
                AND ear.status = 'approved'
                AND ear.action_code = 'HEADER.PLACE_ORDER'
                AND ear.capability = 'requires_permission'
                AND ear.required_permission = 'PO.PLACE_ORDER'
         )
    ),
    findings AS (
        SELECT format('activity transition %s has %s canonical hooks', transition_id, hook_count) AS finding
          FROM activity_coverage WHERE hook_count <> 1
        UNION ALL
        SELECT format('notification transition %s has %s canonical hooks', transition_id, hook_count)
          FROM notification_coverage WHERE hook_count <> 1
        UNION ALL
        SELECT format('outbox transition %s has %s canonical hooks', transition_id, hook_count)
          FROM outbox_coverage WHERE hook_count <> 1
        UNION ALL
        SELECT format('transition %s operation %s resolves to %s operations and %s permissions', transition_id, operation_code, operation_count, permission_count)
          FROM operation_coverage WHERE operation_count <> 1 OR permission_count <> 1
        UNION ALL
        SELECT format('snapshot %s->%s (%s) has %s canonical hooks', from_code, to_code, kind, hook_count)
          FROM snapshot_coverage WHERE hook_count <> 1
        UNION ALL
        SELECT format('retired purchase_order hook %s remains active (%s)', id, action)
          FROM retired_active_hooks
        UNION ALL
        SELECT finding FROM place_order_contract
    )
    SELECT count(*),
           COALESCE(string_agg(finding, '; ' ORDER BY finding), '')
      INTO v_count, v_sample
      FROM (SELECT finding FROM findings ORDER BY finding LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§5a PO lifecycle hooks] % hook wiring defects. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§5a PO lifecycle hooks] % hook wiring defects. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§5a PO lifecycle hooks] PASSED.';
    END IF;
END $$;


-- Â§6 entity_field.group_key must exist in field_group.group_key
-- Catches the 042d PC-tab pattern: rows reference group_keys (source,
-- apportionment, lineage, supersede, system, annotation, asset) that aren't
-- declared in 020. UI renders ungrouped.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH orphans AS (
        SELECT DISTINCT ef.group_key
        FROM control.entity_field ef
        LEFT JOIN control.field_group fg ON fg.group_key = ef.group_key
        WHERE ef.group_key IS NOT NULL
          AND fg.group_key IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(group_key, ', ' ORDER BY group_key), '')
      INTO v_count, v_sample
      FROM (SELECT group_key FROM orphans ORDER BY group_key LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§6 field group orphans] % distinct group_key values referenced by entity_field but not declared in field_group. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§6 field group orphans] % distinct group_key values referenced by entity_field but not declared in field_group. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§6 field group_key] PASSED.';
    END IF;
END $$;


-- Â§7a entity_operation.permission_code must exist in shared.permission OR control.permission_alias.
-- Catches 044 rename-pipeline residue: rows still pointing at codes the rename never touched,
-- or new inserts that wrote legacy vocabulary the registry never adopted.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH orphans AS (
        SELECT eo.entity_name, eo.permission_code
        FROM control.entity_operation eo
        LEFT JOIN shared.permission p          ON p.code = eo.permission_code
        LEFT JOIN control.permission_alias pa  ON pa.alias_code = eo.permission_code
        WHERE eo.tenant_id IS NULL
          AND p.code IS NULL
          AND pa.alias_code IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(
               format('%s/%s', entity_name, permission_code), ', '
               ORDER BY entity_name, permission_code), '')
      INTO v_count, v_sample
      FROM (SELECT entity_name, permission_code FROM orphans
            ORDER BY entity_name, permission_code LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§7a entity_operation orphan permission] % rows reference permission codes not in shared.permission or permission_alias. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§7a entity_operation orphan permission] % rows reference permission codes not in shared.permission or permission_alias. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§7a entity_operation permission] PASSED.';
    END IF;
END $$;


-- Â§7b Operations resolving only via permission_alias â€” warn-only diagnostic.
-- Promotion to strict is driven by permission_alias.hard_fail_after, not this gate.
DO $$
DECLARE
    v_count  bigint;
    v_sample text;
BEGIN
    WITH alias_users AS (
        SELECT eo.entity_name, eo.permission_code, pa.canonical_code
        FROM control.entity_operation eo
        JOIN control.permission_alias pa ON pa.alias_code = eo.permission_code
        LEFT JOIN shared.permission p    ON p.code = eo.permission_code
        WHERE eo.tenant_id IS NULL
          AND p.code IS NULL   -- only alias resolves, not the canonical
    )
    SELECT count(*),
           COALESCE(string_agg(
               format('%s/%sâ†’%s', entity_name, permission_code, canonical_code),
               ', ' ORDER BY entity_name, permission_code), '')
      INTO v_count, v_sample
      FROM (SELECT entity_name, permission_code, canonical_code FROM alias_users
            ORDER BY entity_name, permission_code LIMIT 20) s;

    IF v_count > 0 THEN
        RAISE WARNING '[100.Â§7b entity_operation using alias] % rows still resolve via permission_alias (migration debt). Sample: %', v_count, v_sample;
    ELSE
        RAISE NOTICE  '[100.Â§7b entity_operation alias usage] PASSED (none).';
    END IF;
END $$;


-- Â§8 notification_routing_rule (template_key, channel) must have a template
-- Catches the 083z DN orphan-email-template inverse: a routing rule pointing
-- at a channel without a template means the dispatcher silently fails on that
-- channel.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH routes AS (
        SELECT r.code AS rule_code, r.template_key, unnest(r.channels) AS channel
        FROM control.notification_routing_rule r
        WHERE r.tenant_id IS NULL
          AND r.is_enabled
    ),
    orphans AS (
        SELECT r.rule_code, r.template_key, r.channel
        FROM routes r
        LEFT JOIN control.notification_template t
               ON t.template_key = r.template_key
              AND t.channel      = r.channel
              AND t.tenant_id IS NULL
        WHERE t.id IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(
               format('%s [%s/%s]', rule_code, template_key, channel), ', '
               ORDER BY rule_code), '')
      INTO v_count, v_sample
      FROM (SELECT rule_code, template_key, channel FROM orphans
            ORDER BY rule_code LIMIT 20) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§8 routing rule template coverage] % (rule,template,channel) tuples have no template. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§8 routing rule template coverage] % (rule,template,channel) tuples have no template. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§8 routing rule template coverage] PASSED.';
    END IF;
END $$;


-- Â§9a Same-row visibility collision: a single entity_field row carrying both hideIn
-- AND hide_in is always a bug regardless of which key the renderer reads.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    SELECT count(*),
           COALESCE(string_agg(name, ', ' ORDER BY name), '')
      INTO v_count, v_sample
      FROM (
          SELECT ef.name
          FROM control.entity_field ef
          WHERE ef.visibility IS NOT NULL
            AND ef.visibility ? 'hideIn'
            AND ef.visibility ? 'hide_in'
          ORDER BY ef.name
          LIMIT 20
      ) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§9a visibility collision] % rows carry both hideIn and hide_in. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§9a visibility collision] % rows carry both hideIn and hide_in. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§9a visibility collision] PASSED.';
    END IF;
END $$;


-- Â§9b Dataset-level visibility vocabulary drift (warn-only). Reports the spread of
-- hideIn / hide_in / hidden keys; promote to strict after a canonical key is chosen.
DO $$
DECLARE
    v_camel  bigint;
    v_snake  bigint;
    v_hidden bigint;
    v_forms  smallint;
BEGIN
    SELECT count(*) FILTER (WHERE visibility ? 'hideIn'),
           count(*) FILTER (WHERE visibility ? 'hide_in'),
           count(*) FILTER (WHERE (visibility -> 'hidden') = to_jsonb(true))
      INTO v_camel, v_snake, v_hidden
      FROM control.entity_field
     WHERE visibility IS NOT NULL;

    v_forms := (v_camel > 0)::int + (v_snake > 0)::int + (v_hidden > 0)::int;

    IF v_forms > 1 THEN
        RAISE WARNING '[100.Â§9b visibility vocabulary drift] hideIn=% / hide_in=% / hidden=% rows. Pick a canonical key and promote Â§9b to strict.',
            v_camel, v_snake, v_hidden;
    ELSE
        RAISE NOTICE '[100.Â§9b visibility vocabulary] PASSED (single form in use).';
    END IF;
END $$;


-- Â§10 slug naming assertion is dropped â€” control.entity.slug is hyphenated by
-- entity_slug_fmt_chk; the underscore-only rule applies to entity_code (covered by
-- entity_code_fmt_chk), not slug.


-- Â§11 Every DOCUMENT-class entity has an entity_lifecycle binding.
-- Line entities (entity_code ends in _line) inherit lifecycle from parent and
-- are exempt.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH missing AS (
        SELECT e.entity_code
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.entity_class = 'DOCUMENT'
          AND e.entity_code NOT LIKE '%\_line' ESCAPE '\'
          AND e.entity_code NOT IN ('accounting_distribution','pricing_component','schedule_line','journal_line_reference','payment_entry_allocation')
          AND NOT EXISTS (
              SELECT 1 FROM control.entity_lifecycle el
              WHERE el.tenant_id IS NULL
                AND el.entity_name = e.entity_code
          )
    )
    SELECT count(*),
           COALESCE(string_agg(entity_code, ', ' ORDER BY entity_code), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM missing ORDER BY entity_code LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§11 lifecycle binding] % DOCUMENT-class entities lack entity_lifecycle. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§11 lifecycle binding] % DOCUMENT-class entities lack entity_lifecycle. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§11 lifecycle binding] PASSED.';
    END IF;
END $$;


-- Â§12 Every header entity has entity_numbering_config. Headers are
-- entity_class='DOCUMENT' whose entity_code does not end in _line and is not a
-- polymorphic child (accounting_distribution / pricing_component / schedule_line
-- / journal_line_reference / payment_entry_allocation).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH missing AS (
        SELECT e.entity_code
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.entity_class = 'DOCUMENT'
          AND e.entity_code NOT LIKE '%\_line' ESCAPE '\'
          AND e.entity_code NOT IN ('accounting_distribution','pricing_component','schedule_line','journal_line_reference','payment_entry_allocation')
          AND NOT EXISTS (
              SELECT 1 FROM control.entity_numbering_config nc
              WHERE nc.tenant_id IS NULL
                AND nc.entity_id = e.id
          )
    )
    SELECT count(*),
           COALESCE(string_agg(entity_code, ', ' ORDER BY entity_code), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM missing ORDER BY entity_code LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§12 numbering config] % header entities lack entity_numbering_config. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§12 numbering config] % header entities lack entity_numbering_config. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§12 numbering config] PASSED.';
    END IF;
END $$;


-- Â§13 No line entity has entity_numbering_config. Line numbering is
-- per-parent, not via global numbering config.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT e.entity_code
        FROM control.entity e
        JOIN control.entity_numbering_config nc ON nc.entity_id = e.id AND nc.tenant_id IS NULL
        WHERE e.tenant_id IS NULL
          AND (e.entity_code LIKE '%\_line' ESCAPE '\'
               OR e.entity_code IN ('accounting_distribution','pricing_component','schedule_line','journal_line_reference','payment_entry_allocation'))
    )
    SELECT count(*),
           COALESCE(string_agg(entity_code, ', ' ORDER BY entity_code), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_code LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§13 line numbering] % line entities have entity_numbering_config (should be per-parent). Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§13 line numbering] % line entities have entity_numbering_config (should be per-parent). Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§13 line numbering] PASSED.';
    END IF;
END $$;


-- Â§14 Every entity_operation.handler_target LIKE 'flow:%' resolves to
-- entity_flow.flow_code for the same entity.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT op.entity_name,
               op.permission_code,
               op.handler_target
        FROM control.entity_operation op
        JOIN control.entity e ON e.entity_code = op.entity_name AND e.tenant_id IS NULL
        WHERE op.tenant_id IS NULL
          AND op.handler_type = 'MODAL'
          AND op.handler_target LIKE 'flow:%'
          AND NOT EXISTS (
              SELECT 1
              FROM control.entity_flow ef
              JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.tenant_id IS NULL
              WHERE ev.entity_id = e.id
                AND ef.tenant_id IS NULL
                AND ef.flow_code = substr(op.handler_target, 6)
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s->%s', entity_name, permission_code, handler_target), ', '
                    ORDER BY entity_name, permission_code), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_name, permission_code LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§14 flow-op wiring] % operations reference missing entity_flow.flow_code. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§14 flow-op wiring] % operations reference missing entity_flow.flow_code. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§14 flow-op wiring] PASSED.';
    END IF;
END $$;


-- §14a Lifecycle operations separate their UI flow selector from the server
-- execution command. Both values are asserted because neither may be inferred
-- from the other at runtime.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH expected(entity_name, permission_code, handler_target, execution_target) AS (
        VALUES
          ('purchase_requisition', 'submit',  'flow:submit_for_approval', 'lifecycle:submit'),
          ('receipt',              'submit',  'flow:submit_for_approval', 'lifecycle:submit'),
          ('service_sheet',        'submit',  'flow:submit_for_approval', 'lifecycle:submit'),
          ('purchase_invoice',     'submit',  'flow:submit_for_approval', 'lifecycle:submit'),
          ('purchase_invoice',     'post',    'flow:post_invoice',         'lifecycle:post'),
          ('purchase_invoice',     'reverse', 'flow:reverse_invoice',      'lifecycle:reverse')
    ), bad AS (
        SELECT x.*, eo.handler_target AS actual_handler_target,
               eo.execution_target AS actual_execution_target
          FROM expected x
          LEFT JOIN control.entity_operation eo
            ON eo.tenant_id IS NULL
           AND eo.entity_name = x.entity_name
           AND eo.permission_code = x.permission_code
           AND eo.is_enabled = true
         WHERE eo.id IS NULL
            OR eo.handler_target IS DISTINCT FROM x.handler_target
            OR eo.execution_target IS DISTINCT FROM x.execution_target
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s ui=%s exec=%s', entity_name, permission_code,
                                      COALESCE(actual_handler_target, 'NULL'),
                                      COALESCE(actual_execution_target, 'NULL')), ', '
                    ORDER BY entity_name, permission_code), '')
      INTO v_count, v_sample
      FROM bad;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.§14a lifecycle execution wiring] % operations do not separate UI flow and execution command. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.§14a lifecycle execution wiring] % operations do not separate UI flow and execution command. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.§14a lifecycle execution wiring] PASSED.';
    END IF;
END $$;


-- Â§15 No entity has more than one active lifecycle binding at the platform
-- tier. Guards against 030_ vs 030p_ drift (e.g. purchase_order + commitment
-- duplicates).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH dup AS (
        SELECT el.entity_name, count(*) AS n
        FROM control.entity_lifecycle el
        WHERE el.tenant_id IS NULL
        GROUP BY el.entity_name
        HAVING count(*) > 1
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s(x%s)', entity_name, n), ', ' ORDER BY entity_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM dup ORDER BY entity_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§15 duplicate lifecycle] % entities have >1 platform lifecycle binding. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§15 duplicate lifecycle] % entities have >1 platform lifecycle binding. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§15 duplicate lifecycle] PASSED.';
    END IF;
END $$;


-- Â§16 control.polymorphic_child_binding is empty. The table is retired in
-- favour of control.entity_relation polymorphic descriptors. 049 deletes its
-- own inserts as a tombstone; this guards against reintroduction.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='control' AND table_name='polymorphic_child_binding'
    ) THEN
        EXECUTE 'SELECT count(*) FROM control.polymorphic_child_binding' INTO v_count;
        IF v_count > 0 THEN
            IF v_strict THEN
                RAISE EXCEPTION '[100.Â§16 polymorphic_child_binding tombstone] % rows present; table is retired.', v_count;
            ELSE
                RAISE WARNING  '[100.Â§16 polymorphic_child_binding tombstone] % rows present; table is retired.', v_count;
            END IF;
        ELSE
            RAISE NOTICE '[100.Â§16 polymorphic_child_binding tombstone] PASSED.';
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§16 polymorphic_child_binding tombstone] PASSED (table absent).';
    END IF;
END $$;


-- Â§17 entity_field.reference_config->>'target_entity' must resolve to a
-- registered control.entity.entity_code (platform tier).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH refs AS (
        SELECT e.entity_code AS src_entity,
               ef.name AS field_name,
               (ef.reference_config->>'target_entity') AS target_entity
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity e ON e.id = ev.entity_id AND e.tenant_id IS NULL
        WHERE ef.tenant_id IS NULL
          AND ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND ef.is_deprecated = false
          AND (ef.reference_config->>'target_entity') IS NOT NULL
    ),
    orphans AS (
        SELECT r.src_entity, r.field_name, r.target_entity
        FROM refs r
        WHERE NOT EXISTS (
            SELECT 1 FROM control.entity e2
            WHERE e2.entity_code = r.target_entity AND e2.tenant_id IS NULL
        )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s->%s', src_entity, field_name, target_entity), ', '
                    ORDER BY src_entity, field_name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM orphans ORDER BY src_entity, field_name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§17 reference target] % reference fields point at missing target_entity. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§17 reference target] % reference fields point at missing target_entity. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§17 reference target] PASSED.';
    END IF;
END $$;


-- Â§18 entity_field.ui_type='enum' must carry enum_domain_code or a json_config
-- enum spec. Prevents silent enum fields with no domain vocabulary.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT e.entity_code, ef.name
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity e ON e.id = ev.entity_id AND e.tenant_id IS NULL
        WHERE ef.tenant_id IS NULL
          AND ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND ef.is_deprecated = false
          AND ef.ui_type = 'enum'
          AND COALESCE(ef.enum_domain_code, '') = ''
          AND (ef.json_config->>'enum_domain_code') IS NULL
          AND (ef.json_config->'enum_config') IS NULL
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, name), ', '
                    ORDER BY entity_code, name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_code, name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§18 enum domain] % enum fields lack domain vocabulary. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§18 enum domain] % enum fields lack domain vocabulary. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§18 enum domain] PASSED.';
    END IF;
END $$;


-- Â§19 A computed field cannot carry an editability gate. Contradiction
-- indicates the seed intends the field to be user-editable while also marking
-- it as system-computed.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT e.entity_code, ef.name
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity e ON e.id = ev.entity_id AND e.tenant_id IS NULL
        WHERE ef.tenant_id IS NULL
          AND ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND ef.is_deprecated = false
          AND ef.is_computed = true
          AND ef.editability IS NOT NULL
          AND jsonb_typeof(ef.editability) = 'object'
          AND ef.editability <> '{}'::jsonb
          -- Legitimate: {editableOnCreate:false, editableOnEdit:false} is a lock,
          -- not an edit permission. Filter those out.
          AND NOT (
              COALESCE((ef.editability->>'editableOnCreate')::boolean, false) = false
              AND COALESCE((ef.editability->>'editableOnEdit')::boolean, false) = false
              AND NOT (ef.editability ? 'statuses')
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, name), ', '
                    ORDER BY entity_code, name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_code, name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§19 computed+editable] % computed fields carry editability rules. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§19 computed+editable] % computed fields carry editability rules. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§19 computed+editable] PASSED.';
    END IF;
END $$;


-- Â§20 origin='business' + is_read_only=true + is_computed=false is a
-- contradiction (a business field that is neither editable nor computed is
-- either a stub or drift).
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT e.entity_code, ef.name
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.tenant_id IS NULL
        JOIN control.entity e ON e.id = ev.entity_id AND e.tenant_id IS NULL
        WHERE ef.tenant_id IS NULL
          AND ef.is_active = true
          AND COALESCE(ef.runtime_enabled, true) = true
          AND ef.is_deprecated = false
          AND ef.origin = 'business'
          AND ef.is_read_only = true
          AND ef.is_computed = false
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, name), ', '
                    ORDER BY entity_code, name), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_code, name LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§20 business+readonly+not-computed] % business fields marked read-only without compute. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§20 business+readonly+not-computed] % business fields marked read-only without compute. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§20 business+readonly+not-computed] PASSED.';
    END IF;
END $$;


-- Â§21 Every field_security_policy.field_path must resolve to an active
-- entity_field.name for the referenced entity_id.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count  bigint;
    v_sample text;
BEGIN
    WITH bad AS (
        SELECT e.entity_code, fsp.field_path
        FROM control.field_security_policy fsp
        JOIN control.entity e ON e.id = fsp.entity_id
        WHERE fsp.tenant_id IS NULL
          AND fsp.is_active = true
          -- Nested paths (e.g. 'address.line1') aren't entity_field rows;
          -- only assert on scalar paths.
          AND fsp.field_path NOT LIKE '%.%'
          AND NOT EXISTS (
              SELECT 1
              FROM control.entity_field ef
              JOIN control.entity_version ev ON ev.id = ef.entity_version_id
              WHERE ev.entity_id = e.id
                AND ef.name = fsp.field_path
                AND ef.is_active = true
                AND ef.is_deprecated = false
          )
    )
    SELECT count(*),
           COALESCE(string_agg(format('%s.%s', entity_code, field_path), ', '
                    ORDER BY entity_code, field_path), '')
      INTO v_count, v_sample
      FROM (SELECT * FROM bad ORDER BY entity_code, field_path LIMIT 30) s;

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.Â§21 field-security drift] % field_security_policy rows reference missing entity_field. Sample: %', v_count, v_sample;
        ELSE
            RAISE WARNING  '[100.Â§21 field-security drift] % field_security_policy rows reference missing entity_field. Sample: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.Â§21 field-security drift] PASSED.';
    END IF;
END $$;


-- §22 EARLY_DRAFT identity policy alignment. The scalar strategy is the fast
-- runtime discriminator; identity_config owns the reusable field/template details.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_count integer;
    v_sample text;
BEGIN
    SELECT count(*), COALESCE(string_agg(entity_code, ', ' ORDER BY entity_code), '')
      INTO v_count, v_sample
      FROM control.entity
     WHERE create_mode = 'EARLY_DRAFT'
       AND COALESCE(identity_config #>> '{numbering,enabled}', 'false')::boolean
       AND (
         numbering_strategy IS DISTINCT FROM identity_config #>> '{numbering,strategy}'
         OR COALESCE(identity_config #>> '{numbering,field}', '') = ''
         OR COALESCE(identity_config #>> '{naming,field}', '') = ''
       );

    IF v_count > 0 THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.§22 early-draft identity] % entities have inconsistent identity policy. Entities: %', v_count, v_sample;
        ELSE
            RAISE WARNING '[100.§22 early-draft identity] % entities have inconsistent identity policy. Entities: %', v_count, v_sample;
        END IF;
    ELSE
        RAISE NOTICE '[100.§22 early-draft identity] PASSED.';
    END IF;
END $$;


-- P2P lifecycle reset contract. This deliberately checks the generated
-- control-plane rows rather than the source SQL text, so a full reset and an
-- upgraded install are held to the same executable result.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_findings text;
BEGIN
    WITH findings AS (
        SELECT format('missing/duplicate lifecycle binding for %s (count=%s)', e.entity_name, count(el.id)) AS finding
          FROM (VALUES
            ('purchase_requisition'), ('purchase_order'), ('purchase_order_confirmation'),
            ('delivery_note'), ('receipt'), ('service_sheet'),
            ('purchase_invoice'), ('payment_entry')
          ) AS e(entity_name)
          LEFT JOIN control.entity_lifecycle el
            ON el.entity_name = e.entity_name AND el.tenant_id IS NULL
         GROUP BY e.entity_name
        HAVING count(el.id) <> 1

        UNION ALL

        SELECT format('%s %s->%s is missing required hook %s', lc.code, fs.code, ts.code, req.action)
          FROM control.lifecycle_transition lt
          JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id AND lc.tenant_id IS NULL
          JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
          JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
          CROSS JOIN (VALUES ('activity_log.write'), ('emit_event')) AS req(action)
         WHERE lc.code IN ('purchase_requisition','commitment','purchase_order_confirmation',
                           'delivery_note','receipt','service_sheet','purchase_invoice','payment_entry')
           AND lt.tenant_id IS NULL AND lt.is_active
           AND NOT EXISTS (
             SELECT 1 FROM control.lifecycle_transition_hook h
              WHERE h.transition_id = lt.id AND h.tenant_id IS NULL
                AND h.timing = 'after' AND h.action = req.action AND h.is_active
           )

        UNION ALL

        SELECT 'active hooks remain attached to retired purchase_order lifecycle'
         WHERE EXISTS (
           SELECT 1
             FROM control.lifecycle_transition_hook h
             JOIN control.lifecycle_transition lt ON lt.id = h.transition_id
             JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
            WHERE lc.tenant_id IS NULL AND lc.code = 'purchase_order' AND h.is_active
         )

        UNION ALL

        SELECT 'commitment submit is missing purchase_order_approval workflow.start hook'
         WHERE NOT EXISTS (
           SELECT 1
             FROM control.lifecycle_transition_hook h
             JOIN control.lifecycle_transition lt ON lt.id = h.transition_id
             JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
             JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
             JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
            WHERE lc.code = 'commitment' AND lc.tenant_id IS NULL
              AND fs.code = 'draft' AND ts.code = 'pending_approval'
              AND h.action = 'workflow.start' AND h.timing = 'before' AND h.is_active
              AND h.config->>'workflow_definition_code' = 'purchase_order_approval'
         )

        UNION ALL

        SELECT 'payment submit is missing payment_entry_approval workflow.start hook'
         WHERE NOT EXISTS (
           SELECT 1
             FROM control.lifecycle_transition_hook h
             JOIN control.lifecycle_transition lt ON lt.id = h.transition_id
             JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
             JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
             JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
            WHERE lc.code = 'payment_entry' AND lc.tenant_id IS NULL
              AND fs.code = 'draft' AND ts.code = 'pending_approval'
              AND h.action = 'workflow.start' AND h.timing = 'before' AND h.is_active
              AND h.config->>'workflow_definition_code' = 'payment_entry_approval'
         )

        UNION ALL

        SELECT format('payment %s->%s missing snapshot kind %s', x.from_code, x.to_code, x.kind)
          FROM (VALUES
            ('draft','pending_approval','authoring_lock'),
            ('approved','posted','financial_post'),
            ('transmitted','cleared','financial_post'),
            ('printed','cleared','financial_post'),
            ('posted','reversed','reversal'),
            ('posted','voided','reversal')
          ) AS x(from_code,to_code,kind)
         WHERE NOT EXISTS (
           SELECT 1
             FROM control.lifecycle_transition_hook h
             JOIN control.lifecycle_transition lt ON lt.id = h.transition_id
             JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
             JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
             JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
            WHERE lc.code = 'payment_entry' AND lc.tenant_id IS NULL
              AND fs.code = x.from_code AND ts.code = x.to_code
              AND h.action = 'snapshot.capture' AND h.is_active
              AND h.config->>'gate_event_kind' = x.kind
         )
    )
    SELECT string_agg(finding, E'\n - ' ORDER BY finding) INTO v_findings FROM findings;

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.P2P lifecycle] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.P2P lifecycle] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.P2P lifecycle] PASSED.';
    END IF;
END $$;


-- =============================================================================
-- §23  Effective orchestrated P2P lifecycle control-plane integrity
-- =============================================================================
-- Platform hooks are the canonical capture/dispatch matrix. Tenant hook
-- overrides are resolved before cardinality checks, so CI verifies what each
-- tenant actually executes instead of counting platform and tenant rows twice.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_findings text;
BEGIN
    WITH p2p_codes(code) AS (
        VALUES ('purchase_requisition'), ('purchase_order_confirmation'),
               ('delivery_note'), ('receipt'), ('service_sheet'),
               ('purchase_invoice'), ('payment_entry'), ('commitment')
    ), scoped_transitions AS (
        SELECT lt.id, lt.operation_code,
               lc.code AS lifecycle_code, fs.code AS from_state, ts.code AS to_state
          FROM control.lifecycle_transition lt
          JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
          JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
          JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
          JOIN p2p_codes pc ON pc.code = lc.code
         WHERE lc.tenant_id IS NULL AND lc.is_active
           AND lt.tenant_id IS NULL AND lt.is_active
    ), tenant_scopes AS (
        SELECT NULL::uuid AS tenant_id
        UNION SELECT id FROM master.tenant WHERE status = 'active'
        UNION SELECT tenant_id FROM control.lifecycle_transition_hook WHERE tenant_id IS NOT NULL
        UNION SELECT tenant_id FROM control.lifecycle_hook_override WHERE is_active
        UNION SELECT tenant_id FROM control.entity_operation WHERE tenant_id IS NOT NULL AND is_enabled
    ), platform_matrix AS (
        SELECT st.id AS transition_id,
               bool_or(h.action = 'snapshot.capture' AND h.timing = 'after' AND h.sort_order = 20) AS capture_required,
               bool_or(h.action = 'transaction_flow.dispatch' AND h.timing = 'after' AND h.sort_order = 30) AS dispatch_required
          FROM scoped_transitions st
          LEFT JOIN control.lifecycle_transition_hook h
            ON h.transition_id = st.id AND h.tenant_id IS NULL AND h.is_active
         GROUP BY st.id
    ), effective_hooks AS (
        -- Unmodified platform hooks remain effective for every scope.
        SELECT s.tenant_id AS scope_tenant_id, st.id AS transition_id,
               h.id AS source_hook_id, h.action, h.config, h.timing,
               h.sort_order, h.contract_role, h.safety_level
          FROM tenant_scopes s
          CROSS JOIN scoped_transitions st
          JOIN control.lifecycle_transition_hook h
            ON h.transition_id = st.id AND h.tenant_id IS NULL AND h.is_active
          LEFT JOIN control.lifecycle_hook_override o
            ON s.tenant_id IS NOT NULL AND o.tenant_id = s.tenant_id
           AND o.target_hook_id = h.id AND o.is_active
         WHERE coalesce(o.override_kind, '') NOT IN ('suppress', 'replace')

        UNION ALL

        -- Replacement and additive overrides become concrete effective hooks.
        SELECT s.tenant_id, st.id, h.id, o.replacement_action,
               coalesce(o.replacement_config, h.config), h.timing,
               o.sort_order, h.contract_role, h.safety_level
          FROM tenant_scopes s
          CROSS JOIN scoped_transitions st
          JOIN control.lifecycle_transition_hook h
            ON h.transition_id = st.id AND h.tenant_id IS NULL AND h.is_active
          JOIN control.lifecycle_hook_override o
            ON o.tenant_id = s.tenant_id AND o.target_hook_id = h.id
           AND o.is_active AND o.override_kind IN ('replace', 'add_before', 'add_after')

        UNION ALL

        -- Tenant-owned hooks augment the selected platform lifecycle.
        SELECT s.tenant_id, st.id, h.id, h.action, h.config, h.timing,
               h.sort_order, h.contract_role, h.safety_level
          FROM tenant_scopes s
          CROSS JOIN scoped_transitions st
          JOIN control.lifecycle_transition_hook h
            ON h.transition_id = st.id AND h.tenant_id = s.tenant_id AND h.is_active
    ), required_slots(action, sort_order, contract_role, safety_level) AS (
        VALUES
          ('activity_log.write', 10::smallint, 'contract', 'required'),
          ('emit_event', 50::smallint, 'contract', 'required'),
          ('notification.publish', 60::smallint, 'extension', 'narrowable')
    ), findings AS (
        SELECT format('tenant=%s %s %s->%s slot %s has %s matching hooks and %s total occupants',
                      coalesce(s.tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state, rs.sort_order,
                      count(eh.*) FILTER (WHERE eh.action = rs.action
                        AND eh.contract_role = rs.contract_role AND eh.safety_level = rs.safety_level),
                      count(eh.*)) AS finding
          FROM tenant_scopes s CROSS JOIN scoped_transitions st CROSS JOIN required_slots rs
          LEFT JOIN effective_hooks eh
            ON eh.scope_tenant_id IS NOT DISTINCT FROM s.tenant_id
           AND eh.transition_id = st.id AND eh.timing = 'after' AND eh.sort_order = rs.sort_order
         GROUP BY s.tenant_id, st.id, st.lifecycle_code, st.from_state, st.to_state,
                  rs.action, rs.sort_order, rs.contract_role, rs.safety_level
        HAVING count(eh.*) <> 1
            OR count(eh.*) FILTER (WHERE eh.action = rs.action
                 AND eh.contract_role = rs.contract_role AND eh.safety_level = rs.safety_level) <> 1

        UNION ALL

        SELECT format('tenant=%s %s %s->%s snapshot slot has %s hooks (expected %s)',
                      coalesce(s.tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state, count(eh.*), pm.capture_required::int)
          FROM tenant_scopes s CROSS JOIN scoped_transitions st
          JOIN platform_matrix pm ON pm.transition_id = st.id
          LEFT JOIN effective_hooks eh
            ON eh.scope_tenant_id IS NOT DISTINCT FROM s.tenant_id
           AND eh.transition_id = st.id AND eh.timing = 'after' AND eh.sort_order = 20
           AND eh.action = 'snapshot.capture' AND eh.contract_role = 'contract'
           AND eh.safety_level = 'required'
         GROUP BY s.tenant_id, st.id, st.lifecycle_code, st.from_state, st.to_state, pm.capture_required
        HAVING count(eh.*) <> pm.capture_required::int

        UNION ALL

        SELECT format('tenant=%s %s %s->%s dispatch slot has %s hooks (expected %s)',
                      coalesce(s.tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state, count(eh.*), pm.dispatch_required::int)
          FROM tenant_scopes s CROSS JOIN scoped_transitions st
          JOIN platform_matrix pm ON pm.transition_id = st.id
          LEFT JOIN effective_hooks eh
            ON eh.scope_tenant_id IS NOT DISTINCT FROM s.tenant_id
           AND eh.transition_id = st.id AND eh.timing = 'after' AND eh.sort_order = 30
           AND eh.action = 'transaction_flow.dispatch' AND eh.contract_role = 'contract'
           AND eh.safety_level = 'required'
         GROUP BY s.tenant_id, st.id, st.lifecycle_code, st.from_state, st.to_state, pm.dispatch_required
        HAVING count(eh.*) <> pm.dispatch_required::int

        UNION ALL

        SELECT format('tenant=%s %s %s->%s effective hook action %s is not registered',
                      coalesce(eh.scope_tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state, eh.action)
          FROM effective_hooks eh JOIN scoped_transitions st ON st.id = eh.transition_id
         WHERE NOT EXISTS (
            SELECT 1 FROM control.hook_action_registry r
             WHERE r.action_key = eh.action AND r.is_active
               AND (r.tenant_id IS NULL OR r.tenant_id = eh.scope_tenant_id)
          )

        UNION ALL

        SELECT format('tenant=%s %s %s->%s dispatch pair (%s,%s) has no effective template',
                      coalesce(eh.scope_tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state, eh.config->>'event_code', eh.config->>'flow_code')
          FROM effective_hooks eh JOIN scoped_transitions st ON st.id = eh.transition_id
         WHERE eh.action = 'transaction_flow.dispatch'
           AND NOT EXISTS (
             SELECT 1 FROM control.transaction_flow_template tft
              WHERE tft.event_code = eh.config->>'event_code'
                AND tft.flow_code = eh.config->>'flow_code' AND tft.is_active
                AND (tft.tenant_id IS NULL OR tft.tenant_id = eh.scope_tenant_id)
           )

        UNION ALL

        SELECT format('tenant=%s %s %s->%s workflow.start has no active definition',
                      coalesce(eh.scope_tenant_id::text, 'platform'), st.lifecycle_code,
                      st.from_state, st.to_state)
          FROM effective_hooks eh JOIN scoped_transitions st ON st.id = eh.transition_id
         WHERE eh.action = 'workflow.start'
           AND NOT EXISTS (
             SELECT 1 FROM control.workflow_definition wd
              WHERE wd.is_active
                AND (wd.id::text = eh.config->>'workflow_definition_id'
                  OR wd.code = eh.config->>'workflow_definition_code')
                AND (wd.tenant_id IS NULL OR wd.tenant_id = eh.scope_tenant_id)
           )

        UNION ALL

        SELECT format('active operation %s.%s references missing permission %s',
                      eo.entity_name, eo.permission_code, eo.permission_code)
          FROM control.entity_operation eo
         WHERE eo.is_enabled
           AND NOT EXISTS (
             SELECT 1 FROM shared.permission p
              WHERE p.code = eo.permission_code AND p.is_active
           )

        UNION ALL

        SELECT format('lifecycle command %s.%s resolves to %s transitions (expected 1)',
                      eo.entity_name, eo.execution_target, count(lt.id))
          FROM control.entity_operation eo
          LEFT JOIN LATERAL (
            SELECT el.lifecycle_id
              FROM control.entity_lifecycle el
             WHERE el.entity_name = eo.entity_name
               AND (el.tenant_id IS NULL OR el.tenant_id = eo.tenant_id)
             ORDER BY CASE WHEN el.tenant_id = eo.tenant_id THEN 0 ELSE 1 END,
                      el.priority, el.id
             LIMIT 1
          ) binding ON true
          LEFT JOIN control.lifecycle lc
            ON lc.id = binding.lifecycle_id AND lc.is_active
          LEFT JOIN control.lifecycle_transition lt
            ON lt.lifecycle_id = lc.id AND lt.is_active
           AND lower(lt.operation_code) = split_part(eo.execution_target, ':', 2)
         WHERE eo.is_enabled AND eo.execution_target LIKE 'lifecycle:%'
         GROUP BY eo.id
        HAVING count(lt.id) <> 1

        UNION ALL

        SELECT format('operation/action mismatch for %s.%s in state %s',
                      eo.entity_name, eo.permission_code, fs.code)
          FROM control.entity_operation eo
          JOIN LATERAL (
            SELECT el.lifecycle_id FROM control.entity_lifecycle el
             WHERE el.entity_name = eo.entity_name
               AND (el.tenant_id IS NULL OR el.tenant_id = eo.tenant_id)
             ORDER BY CASE WHEN el.tenant_id = eo.tenant_id THEN 0 ELSE 1 END, el.priority, el.id
             LIMIT 1
          ) binding ON true
          JOIN control.lifecycle_transition lt ON lt.lifecycle_id = binding.lifecycle_id
           AND lt.is_active AND lower(lt.operation_code) = split_part(lower(eo.execution_target), ':', 2)
          JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
         WHERE eo.is_enabled AND eo.execution_target LIKE 'lifecycle:%'
           AND NOT EXISTS (
             SELECT 1 FROM control.entity_action_rule ear
              WHERE ear.entity_code = eo.entity_name AND ear.status = fs.code
                AND ear.action_code = 'HEADER.' || upper(regexp_replace(eo.permission_code, '^.*\.', ''))
                AND ear.capability = 'requires_permission'
                AND ear.required_permission = eo.permission_code
           )

        UNION ALL

        SELECT 'retired purchase_order lifecycle remains active while purchase_order is bound to commitment'
         WHERE EXISTS (
           SELECT 1 FROM control.entity_lifecycle el
           JOIN control.lifecycle effective_lc ON effective_lc.id = el.lifecycle_id
          WHERE el.entity_name = 'purchase_order' AND effective_lc.code = 'commitment' AND effective_lc.is_active
         ) AND EXISTS (
           SELECT 1 FROM control.lifecycle retired_lc
            WHERE retired_lc.code = 'purchase_order' AND retired_lc.is_active
         )
    )
    SELECT string_agg(finding, E'\n - ' ORDER BY finding) INTO v_findings FROM findings;

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.lifecycle control plane] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.lifecycle control plane] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.lifecycle control plane] PASSED.';
    END IF;
END $$;


-- §Entity-class alignment
-- The physical schema is not the logical entity class.  Governed coverage
-- rows must use the same deterministic mapping as 040a; otherwise a replay of
-- the seed can silently turn document children into document headers.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off'))
        IN ('on','true','1');
    v_findings text;
BEGIN
    WITH expected AS (
        SELECT
            e.entity_code,
            e.entity_class,
            CASE
                WHEN e.backing_type IN ('view', 'materialized_view') THEN 'AGGREGATE'
                WHEN e.table_schema = 'ledger' THEN 'LEDGER'
                WHEN e.table_schema = 'log' THEN 'LOG'
                WHEN e.table_schema = 'aggregate' THEN 'AGGREGATE'
                WHEN e.table_schema = 'document'
                 AND (
                    e.table_name IN ('accounting_distribution', 'journal_line_reference', 'payment_entry_allocation')
                    OR e.table_name LIKE '%\_line' ESCAPE '\'
                    OR e.table_name LIKE '%\_lines' ESCAPE '\'
                    OR e.table_name LIKE '%\_item' ESCAPE '\'
                    OR e.table_name LIKE '%\_items' ESCAPE '\'
                    OR e.table_name LIKE '%\_allocation' ESCAPE '\'
                    OR e.table_name LIKE '%\_reference' ESCAPE '\'
                    OR e.table_name LIKE '%\_link' ESCAPE '\'
                    OR e.table_name LIKE '%\_snapshot' ESCAPE '\'
                 ) THEN 'DOCUMENT_RELATION'
                WHEN e.table_schema = 'document' THEN 'DOCUMENT'
                WHEN e.table_schema = 'shared'
                 AND e.table_name ~ '(^workspace$|^module$|permission|persona|(^|_)role$|subscription_plan|enterprise_feature|plan_.*_access$)'
                    THEN 'CONTROL'
                WHEN e.table_schema = 'shared'
                 AND e.table_name ~ '(_link|_links|_member|_members|_mapping|_mappings|_crosswalk|_access)$'
                    THEN 'RELATION'
                WHEN e.table_schema = 'shared' THEN 'REFERENCE'
                WHEN e.table_schema = 'master'
                 AND e.table_name ~ '(_link|_links|_member|_members|_role|_roles|_assignment|_assignments|_mapping|_mappings|_crosswalk|_access|_grant|_grants|_item|_items|_relation|_relations)$'
                    THEN 'RELATION'
                WHEN e.table_schema = 'master'
                 AND e.table_name ~ '(^dimension_|_dimension$|_dimension_)'
                    THEN 'DIMENSION'
                WHEN e.table_schema = 'master' THEN 'MASTER'
                ELSE 'CONTROL'
            END AS expected_class
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
    )
    SELECT string_agg(format('%s expected %s but has %s', entity_code, expected_class, entity_class),
                       E'\n - ' ORDER BY entity_code)
      INTO v_findings
      FROM expected
     WHERE entity_class IS DISTINCT FROM expected_class;

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.entity-class alignment] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.entity-class alignment] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.entity-class alignment] PASSED.';
    END IF;
END $$;

-- Phase 3 semantic metadata contract checks. These validate relationships and
-- physical facts rather than historical row totals, so adding a column or a
-- domain patch does not create a false failure.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_findings text;
BEGIN
    WITH findings AS (
        SELECT format('entity %s has no EFFECTIVE version', e.entity_code) AS finding
        FROM control.entity e
        WHERE e.tenant_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM control.entity_version ev
              WHERE ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
          )
        UNION ALL
        SELECT format('entity %s has multiple EFFECTIVE versions', e.entity_code)
        FROM control.entity e
        JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
        WHERE e.tenant_id IS NULL
        GROUP BY e.entity_code
        HAVING count(*) > 1
        UNION ALL
        SELECT format('effective version %s has no typed contract', ev.id)
        FROM control.entity_version ev
        WHERE ev.status = 'EFFECTIVE'
          AND NOT EXISTS (
              SELECT 1 FROM control.entity_version_contract evc
              WHERE evc.entity_version_id = ev.id
          )
    )
    SELECT string_agg(finding, E'\n - ' ORDER BY finding)
      INTO v_findings
      FROM findings;

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.semantic versions/contracts] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.semantic versions/contracts] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.semantic versions/contracts] PASSED.';
    END IF;
END $$;

DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_findings text;
BEGIN
    WITH findings AS (
        SELECT format('%s.%s maps to missing physical column %s', e.entity_code, ef.name, ef.column_name) AS finding
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.status = 'EFFECTIVE'
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ef.is_active = true
          AND COALESCE(ef.column_name, '') <> ''
          AND e.backing_type IN ('table', 'view', 'materialized_view')
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = e.table_schema
                AND c.table_name = e.table_name
                AND c.column_name = ef.column_name
          )
        UNION ALL
        SELECT format('%s has duplicate active physical column %s (%s logical fields)',
                     duplicate_fields.entity_code,
                     duplicate_fields.column_name,
                     duplicate_fields.field_count)
        FROM (
            SELECT e.entity_code, ev.id AS entity_version_id, ef.column_name,
                   count(*) AS field_count
            FROM control.entity_field ef
            JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.status = 'EFFECTIVE'
            JOIN control.entity e ON e.id = ev.entity_id
            WHERE ef.is_active = true
              AND COALESCE(ef.column_name, '') <> ''
              AND e.backing_type = 'table'
            GROUP BY e.entity_code, ev.id, ef.column_name
            HAVING count(*) > 1
        ) duplicate_fields
        UNION ALL
        SELECT format('%s has multiple active fields with logical name %s', e.entity_code, ef.name)
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id AND ev.status = 'EFFECTIVE'
        JOIN control.entity e ON e.id = ev.entity_id
        WHERE ef.is_active = true
        GROUP BY e.entity_code, ev.id, ef.name
        HAVING count(*) > 1
    )
    SELECT string_agg(finding, E'\n - ' ORDER BY finding)
      INTO v_findings
      FROM findings;

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.semantic fields] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.semantic fields] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.semantic fields] PASSED.';
    END IF;
END $$;

-- Phase 3 ownership boundary: discovery may register physical relations, but
-- it must never grant runtime execution or invent storage identity. Curated
-- 040 rows are the only source allowed to enable runtime behavior.
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
    v_findings text;
BEGIN
    SELECT string_agg(format('%s has discovery defaults that are not inert', e.entity_code), E'\n - ' ORDER BY e.entity_code)
      INTO v_findings
    FROM control.entity e
    WHERE e.tenant_id IS NULL
      AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
      AND (e.runtime_enabled IS DISTINCT FROM false
           OR e.primary_key IS NOT NULL
           OR e.tenant_column IS NOT NULL
           OR e.read_capability IS DISTINCT FROM 'none'
           OR e.write_capability IS DISTINCT FROM 'none');

    IF v_findings IS NOT NULL THEN
        IF v_strict THEN
            RAISE EXCEPTION '[100.seed ownership] findings:%', E'\n - ' || v_findings;
        ELSE
            RAISE WARNING '[100.seed ownership] findings:%', E'\n - ' || v_findings;
        END IF;
    ELSE
        RAISE NOTICE '[100.seed ownership] PASSED.';
    END IF;
END $$;


-- Final notice
DO $$
DECLARE
    v_strict boolean := lower(COALESCE(current_setting('app.assert_seed_contracts', true), 'off')) IN ('on','true','1');
BEGIN
    IF v_strict THEN
        RAISE NOTICE '[100_control_seed_contract_assertions] Completed in STRICT mode â€” any violation above would have raised EXCEPTION.';
    ELSE
        RAISE NOTICE '[100_control_seed_contract_assertions] Completed in WARNING mode. Set app.assert_seed_contracts=on for CI strict.';
    END IF;
END $$;
