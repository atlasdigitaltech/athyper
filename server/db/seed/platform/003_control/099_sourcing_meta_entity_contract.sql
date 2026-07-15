-- ============================================================================
-- Sourcing Meta Entity / Control Contract
-- Depends on: 040-045 control seeds and sourcing DDL.
-- Domain authorization remains in sourcing-authorization.service.ts.
-- ============================================================================

DO $sourcing_meta$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_lifecycle uuid;
BEGIN
    -- 1. Enrich the generated entity catalogue with stable UI and governance
    -- metadata. Fields remain generated from the physical sourcing DDL.
    UPDATE control.entity
    SET module_id = 'SOURCE',
        entity_class = CASE
            WHEN entity_code = 'sourcing_event' THEN 'DOCUMENT'
            ELSE 'DOCUMENT_RELATION'
        END,
        governance_level = 'full',
        security_tier = 'tenant_critical',
        mutability = 'controlled',
        label_singular = CASE entity_code
            WHEN 'sourcing_event' THEN 'Sourcing Event'
            WHEN 'sourcing_event_company' THEN 'Sourcing Event Company'
            WHEN 'sourcing_event_demand' THEN 'Sourcing Event Demand'
            WHEN 'sourcing_event_award' THEN 'Sourcing Event Award'
            WHEN 'sourcing_event_award_allocation' THEN 'Award Allocation'
            WHEN 'sourcing_event_intercompany_allocation' THEN 'Intercompany Allocation'
        END,
        label_plural = CASE entity_code
            WHEN 'sourcing_event' THEN 'Sourcing Events'
            WHEN 'sourcing_event_company' THEN 'Sourcing Event Companies'
            WHEN 'sourcing_event_demand' THEN 'Sourcing Event Demands'
            WHEN 'sourcing_event_award' THEN 'Sourcing Event Awards'
            WHEN 'sourcing_event_award_allocation' THEN 'Award Allocations'
            WHEN 'sourcing_event_intercompany_allocation' THEN 'Intercompany Allocations'
        END,
        icon_key = CASE WHEN entity_code = 'sourcing_event' THEN 'file-badge' ELSE 'list-tree' END,
        color_token = 'orange',
        display_config = CASE entity_code
            WHEN 'sourcing_event' THEN '{"detail_renderer":"document","title_field":"name","subtitle_field":"code","list_columns":["code","name","event_type","buying_model","status"]}'::jsonb
            WHEN 'sourcing_event_company' THEN '{"line_editor":true,"parent_entity":"sourcing_event","parent_fk":"sourcing_event_id"}'::jsonb
            WHEN 'sourcing_event_demand' THEN '{"line_editor":true,"parent_entity":"sourcing_event","parent_fk":"sourcing_event_id"}'::jsonb
            WHEN 'sourcing_event_award' THEN '{"line_editor":true,"parent_entity":"sourcing_event","parent_fk":"sourcing_event_id"}'::jsonb
            WHEN 'sourcing_event_intercompany_allocation' THEN '{"line_editor":true,"parent_entity":"sourcing_event_award_allocation","parent_fk":"award_allocation_id"}'::jsonb
            ELSE '{"line_editor":true,"parent_entity":"sourcing_event_award","parent_fk":"award_id"}'::jsonb
        END,
        feature_flags = '{"sourcing":true,"operating_organization_owned":true,"company_code_outputs":true}'::jsonb,
        create_mode = 'FORM_ONLY',
        numbering_strategy = CASE WHEN entity_code = 'sourcing_event' THEN 'auto_or_manual' ELSE 'none' END,
        data_policy = '{"tenant_isolated":true,"domain":"procurement","authorization_service":"sourcing-authorization"}'::jsonb,
        status = 'ACTIVE',
        updated_at = now(),
        updated_by = v_su
    WHERE table_schema = 'document'
      AND entity_code IN (
        'sourcing_event', 'sourcing_event_company', 'sourcing_event_demand',
        'sourcing_event_award', 'sourcing_event_award_allocation', 'sourcing_event_intercompany_allocation'
      );

    -- 2. Bind the standard document lifecycle to the orchestration header.
    SELECT id INTO v_lifecycle
    FROM control.lifecycle
    WHERE tenant_id IS NULL AND code = 'lc_master_doc';

    IF v_lifecycle IS NOT NULL THEN
        INSERT INTO control.entity_lifecycle
            (tenant_id, entity_name, lifecycle_id, priority, created_by)
        VALUES
            (NULL, 'sourcing_event', v_lifecycle, 100, v_su),
            (NULL, 'sourcing_event_company', v_lifecycle, 100, v_su),
            (NULL, 'sourcing_event_demand', v_lifecycle, 100, v_su),
            (NULL, 'sourcing_event_award', v_lifecycle, 100, v_su),
            (NULL, 'sourcing_event_award_allocation', v_lifecycle, 100, v_su),
            (NULL, 'sourcing_event_intercompany_allocation', v_lifecycle, 100, v_su)
        ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;
    END IF;

    -- 3. Explicit control relations. Entity fields themselves are generated
    -- from information_schema by the preceding control seed.
    INSERT INTO control.entity_relation
        (entity_version_id, name, relation_kind, target_entity, resolution_kind,
         fk_field, source_type_field, source_type_value, source_id_field,
         source_line_field, runtime_role, on_delete, record_filter, created_by)
    SELECT ev.id, r.name, r.kind, r.target_entity, 'fk', r.fk_field,
           NULL, NULL, NULL, NULL, r.runtime_role, r.on_delete, '{}'::jsonb, v_su
    FROM (VALUES
        ('sourcing_event', 'operating_organization', 'belongs_to', 'operating_organization', 'operating_organization_id', 'owner', 'restrict'),
        ('sourcing_event', 'central_buyer_company', 'belongs_to', 'company_code', 'central_buyer_company_id', 'central_buyer', 'restrict'),
        ('sourcing_event_company', 'sourcing_event', 'belongs_to', 'sourcing_event', 'sourcing_event_id', 'event', 'cascade'),
        ('sourcing_event_company', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'participant', 'restrict'),
        ('sourcing_event_demand', 'sourcing_event', 'belongs_to', 'sourcing_event', 'sourcing_event_id', 'event', 'cascade'),
        ('sourcing_event_demand', 'purchase_requisition_line', 'belongs_to', 'purchase_requisition_line', 'purchase_requisition_line_id', 'source_demand', 'restrict'),
        ('sourcing_event_demand', 'demand_company_code', 'belongs_to', 'company_code', 'demand_company_code_id', 'demand_scope', 'restrict'),
        ('sourcing_event_award', 'sourcing_event', 'belongs_to', 'sourcing_event', 'sourcing_event_id', 'event', 'cascade'),
        ('sourcing_event_award_allocation', 'award', 'belongs_to', 'sourcing_event_award', 'award_id', 'award', 'cascade'),
        ('sourcing_event_award_allocation', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'legal_output', 'restrict'),
        ('sourcing_event_intercompany_allocation', 'award_allocation', 'belongs_to', 'sourcing_event_award_allocation', 'award_allocation_id', 'allocation', 'cascade'),
        ('sourcing_event_intercompany_allocation', 'source_company_code', 'belongs_to', 'company_code', 'source_company_code_id', 'source_legal_entity', 'restrict'),
        ('sourcing_event_intercompany_allocation', 'beneficiary_company_code', 'belongs_to', 'company_code', 'beneficiary_company_code_id', 'beneficiary_legal_entity', 'restrict'),
        ('sourcing_event_intercompany_allocation', 'commitment', 'belongs_to', 'commitment', 'commitment_id', 'central_commitment', 'restrict')
    ) AS r(entity_code, name, kind, target_entity, fk_field, runtime_role, on_delete)
    JOIN control.entity e ON e.entity_code = r.entity_code AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    -- 4. CRUD metadata uses permission rows when available. The sourcing
    -- authorization service remains the second, mandatory business gate.
    INSERT INTO control.entity_operation
        (tenant_id, entity_name, permission_code, surface, placement,
         handler_type, handler_target, execution_target, is_record_required,
         sort_order, created_by)
    SELECT NULL, o.entity_name, p.code, o.surface, o.placement,
           o.handler_type, o.handler_target, o.execution_target,
           o.is_record_required, o.sort_order, v_su
    FROM (VALUES
        ('sourcing_event', 'SOURCE.EVENT.CREATE', 'LIST', 'PRIMARY', 'NAVIGATE', '/app/sourcing_event/new', NULL, false, 10),
        ('sourcing_event', 'SOURCE.EVENT.CREATE', 'DETAIL', 'PRIMARY', 'API', NULL, 'sourcing:create', true, 20),
        ('sourcing_event', 'SOURCE.DEMAND.AGGREGATE', 'DETAIL', 'PRIMARY', 'API', NULL, 'sourcing:aggregate-demand', true, 30),
        ('sourcing_event', 'SOURCE.EVENT.EVALUATE', 'DETAIL', 'PRIMARY', 'API', NULL, 'sourcing:evaluate-award', true, 40),
        ('sourcing_event', 'SOURCE.EVENT.EVALUATE', 'DETAIL', 'OVERFLOW', 'API', NULL, 'sourcing:allocate-award', true, 50)
    ) AS o(entity_name, permission_code, surface, placement, handler_type, handler_target, execution_target, is_record_required, sort_order)
    JOIN shared.permission p ON p.code = o.permission_code AND p.status = 'active'
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    RAISE NOTICE '[099_sourcing_meta_entity_contract] Registered sourcing entities, relations, lifecycle, and operations';
END;
$sourcing_meta$;
