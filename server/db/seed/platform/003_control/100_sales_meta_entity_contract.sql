-- Sales Operating Organization metadata contract.
-- The sales services remain authoritative for dual authorization and output rules.

DO $sales_meta$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
  v_lifecycle uuid;
BEGIN
  UPDATE control.entity
  SET module_id = 'SALES', entity_class = CASE WHEN entity_code IN ('sales_opportunity', 'sales_quotation', 'sales_order') THEN 'DOCUMENT' ELSE 'DOCUMENT_RELATION' END,
      governance_level = 'full', security_tier = 'tenant_critical', mutability = 'controlled',
      label_singular = CASE entity_code
        WHEN 'sales_opportunity' THEN 'Sales Opportunity'
        WHEN 'sales_opportunity_company' THEN 'Opportunity Company'
        WHEN 'sales_quotation' THEN 'Sales Quotation'
        WHEN 'sales_quotation_company' THEN 'Quotation Company'
        WHEN 'sales_quotation_allocation' THEN 'Quotation Allocation'
        WHEN 'sales_order' THEN 'Sales Order'
        WHEN 'sales_order_intercompany_fulfillment' THEN 'Intercompany Fulfillment'
      END,
      label_plural = CASE entity_code
        WHEN 'sales_opportunity' THEN 'Sales Opportunities'
        WHEN 'sales_opportunity_company' THEN 'Opportunity Companies'
        WHEN 'sales_quotation' THEN 'Sales Quotations'
        WHEN 'sales_quotation_company' THEN 'Quotation Companies'
        WHEN 'sales_quotation_allocation' THEN 'Quotation Allocations'
        WHEN 'sales_order' THEN 'Sales Orders'
        WHEN 'sales_order_intercompany_fulfillment' THEN 'Intercompany Fulfillments'
      END,
      icon_key = CASE WHEN entity_code = 'sales_opportunity' THEN 'target' ELSE 'list-tree' END,
      color_token = 'blue', create_mode = 'FORM_ONLY',
      data_policy = '{"tenant_isolated":true,"domain":"sales","authorization_service":"sales-authorization"}'::jsonb,
      feature_flags = '{"sales":true,"operating_organization_owned":true,"company_code_outputs":true}'::jsonb,
      status = 'ACTIVE', updated_at = now(), updated_by = v_su
  WHERE table_schema = 'document' AND entity_code IN (
    'sales_opportunity', 'sales_opportunity_company', 'sales_quotation', 'sales_quotation_company',
    'sales_quotation_allocation', 'sales_order', 'sales_order_intercompany_fulfillment'
  );

  SELECT id INTO v_lifecycle FROM control.lifecycle WHERE tenant_id IS NULL AND code = 'lc_master_doc';
  IF v_lifecycle IS NOT NULL THEN
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
    SELECT NULL, entity_code, v_lifecycle, 100, v_su
    FROM (VALUES
      ('sales_opportunity'), ('sales_opportunity_company'), ('sales_quotation'), ('sales_quotation_company'),
      ('sales_quotation_allocation'), ('sales_order'), ('sales_order_intercompany_fulfillment')
    ) AS entities(entity_code)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;
  END IF;

  INSERT INTO control.entity_relation
    (entity_version_id, name, relation_kind, target_entity, resolution_kind, fk_field,
     source_type_field, source_type_value, source_id_field, source_line_field, runtime_role,
     on_delete, record_filter, created_by)
  SELECT ev.id, r.name, r.kind, r.target_entity, 'fk', r.fk_field, NULL, NULL, NULL, NULL,
         r.runtime_role, r.on_delete, '{}'::jsonb, v_su
  FROM (VALUES
    ('sales_opportunity', 'operating_organization', 'belongs_to', 'operating_organization', 'operating_organization_id', 'owner', 'restrict'),
    ('sales_opportunity', 'customer', 'belongs_to', 'customer', 'customer_id', 'customer', 'restrict'),
    ('sales_opportunity_company', 'opportunity', 'belongs_to', 'sales_opportunity', 'opportunity_id', 'opportunity', 'cascade'),
    ('sales_opportunity_company', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'participant', 'restrict'),
    ('sales_quotation', 'opportunity', 'belongs_to', 'sales_opportunity', 'opportunity_id', 'source_opportunity', 'restrict'),
    ('sales_quotation', 'operating_organization', 'belongs_to', 'operating_organization', 'operating_organization_id', 'owner', 'restrict'),
    ('sales_quotation_company', 'quotation', 'belongs_to', 'sales_quotation', 'quotation_id', 'quotation', 'cascade'),
    ('sales_quotation_company', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'participant', 'restrict'),
    ('sales_quotation_allocation', 'quotation', 'belongs_to', 'sales_quotation', 'quotation_id', 'quotation', 'cascade'),
    ('sales_quotation_allocation', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'legal_output', 'restrict'),
    ('sales_order', 'quotation', 'belongs_to', 'sales_quotation', 'quotation_id', 'source_quotation', 'restrict'),
    ('sales_order', 'company_code', 'belongs_to', 'company_code', 'company_code_id', 'legal_owner', 'restrict'),
    ('sales_order_intercompany_fulfillment', 'sales_order', 'belongs_to', 'sales_order', 'sales_order_id', 'order', 'cascade')
  ) AS r(entity_code, name, kind, target_entity, fk_field, runtime_role, on_delete)
  JOIN control.entity e ON e.entity_code = r.entity_code AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
  ON CONFLICT DO NOTHING;

  INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement, handler_type, handler_target,
     execution_target, is_record_required, sort_order, created_by)
  SELECT NULL, o.entity_name, p.code, o.surface, o.placement, o.handler_type, o.handler_target,
         o.execution_target, o.is_record_required, o.sort_order, v_su
  FROM (VALUES
    ('sales_opportunity', 'SALES.OPPORTUNITY.CREATE', 'LIST', 'PRIMARY', 'NAVIGATE', '/app/sales_opportunity/new', NULL, false, 10),
    ('sales_quotation', 'SALES.QUOTATION.CREATE', 'DETAIL', 'PRIMARY', 'API', NULL, 'sales:create-quotation', true, 20),
    ('sales_quotation', 'SALES.QUOTATION.CREATE', 'DETAIL', 'PRIMARY', 'API', NULL, 'sales:allocate-quotation', true, 30),
    ('sales_quotation', 'SALES.ORDER.CREATE', 'DETAIL', 'OVERFLOW', 'API', NULL, 'sales:convert-quotation', true, 40)
  ) AS o(entity_name, permission_code, surface, placement, handler_type, handler_target, execution_target, is_record_required, sort_order)
  JOIN shared.permission p ON p.code = o.permission_code AND p.status = 'active'
  ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;
END;
$sales_meta$;
