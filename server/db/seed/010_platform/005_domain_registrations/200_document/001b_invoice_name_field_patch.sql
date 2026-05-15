-- 001b_invoice_name_field_patch.sql
-- Renames the description field label from "Description" → "Invoice Name"
-- and tightens max_length from 500 → 200 for the purchase_invoice entity.

UPDATE control.entity_field ef
   SET label      = 'Invoice Name',
       constraints = '{"max_length":200}'::jsonb
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.name               = 'description'
   AND e.table_schema        = 'document'
   AND e.table_name          = 'purchase_invoice'
   AND e.tenant_id           IS NULL;
