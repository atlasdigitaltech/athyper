-- 016b_purchase_invoice_flow_help_patch.sql
-- Patch: update invoice_type help_text in control.entity_flow_field.
-- Removes stale "More…" reference now that the toggle is hidden for ≤10 options.

UPDATE control.entity_flow_field eff
   SET help_text = 'Classifies the commercial purpose of this invoice (Standard, Credit Note, Debit Note, Advance, Retention Release, Final, or Self-Billed).'
  FROM control.entity_field ef
 WHERE eff.entity_field_id = ef.id
   AND ef.name             = 'invoice_type'
   AND ef.tenant_id        IS NULL
   AND eff.tenant_id       IS NULL
   AND eff.help_text        = 'Invoice type. Five primary choices visible; use More… for Debit Note or Self-Billed.';
