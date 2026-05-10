-- 018b_purchase_invoice_identify_layout_patch.sql
-- Patch: place Supplier and Company Code on the same Identify row.
-- The generic intake renderer honors sort_order + span; no UI-specific logic needed.

WITH layout(field_name, next_sort_order, next_span) AS (
  VALUES
    ('supplier_id',      10, 1),
    ('company_code_id',  20, 1)
)
UPDATE control.entity_flow_field eff
   SET sort_order = layout.next_sort_order,
       span       = layout.next_span
  FROM layout
  JOIN control.entity_field ef
    ON ef.name = layout.field_name
  JOIN control.entity_flow_step efs
    ON true
  JOIN control.entity_flow efw
    ON efw.id = efs.flow_id
  JOIN control.entity_version ev
    ON ev.id = efw.entity_version_id
  JOIN control.entity e
    ON e.id = ev.entity_id
 WHERE eff.entity_field_id = ef.id
   AND eff.flow_step_id = efs.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND efw.tenant_id IS NULL
   AND efw.flow_code IN ('create', 'create_proforma')
   AND efs.step_key = 'identify'
   AND eff.tenant_id IS NULL
   AND (eff.sort_order IS DISTINCT FROM layout.next_sort_order OR eff.span IS DISTINCT FROM layout.next_span);
