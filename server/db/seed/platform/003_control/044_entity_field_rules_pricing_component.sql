-- ============================================================================
-- 044_entity_field_rules_pricing_component.sql
-- Concept: PC field editability rules (parent-status gated)
-- Depends on: 044_entity_field_pricing_component.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §15
--
-- Parent-status semantics (server-side in records.route.ts):
--   PC's status is read from the parent PI via:
--     • source_doc_id = purchase_invoice.id when source_line_id IS NULL
--     • OR purchase_invoice_line(source_line_id).purchase_invoice_id when set
--
-- v1.2 edit-gate vocabulary: ['draft','rejected'] only (proforma is NOT a status).
--
-- Cascade rule for business_intent_id is in 044_entity_field_rules_pc_cascade.sql.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

WITH pc_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'pricing_component'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    -- Identity / parent — locked at create
    ('term_type',           jsonb_build_array('draft','rejected')::jsonb,
        'Term type drives waterfall + GL routing; immutable after submit.'),
    ('condition_type_id',   jsonb_build_array('draft','rejected')::jsonb,
        'Condition type defines defaults; immutable after submit.'),
    ('sequence',            jsonb_build_array('draft','rejected')::jsonb,
        'Waterfall sequence locks at submit to preserve order.'),

    -- Basis & values
    ('basis',               jsonb_build_array('draft','rejected')::jsonb,
        'Computation basis is the contract; immutable after submit.'),
    ('rate_value',          jsonb_build_array('draft','rejected')::jsonb,
        'Percent / per-unit value; locks at submit.'),
    ('amount_value',        jsonb_build_array('draft','rejected')::jsonb,
        'Flat / amount value; locks at submit.'),
    ('base_for_calculation', jsonb_build_array('draft','rejected')::jsonb,
        'Pre-resolved waterfall base; audit field.'),

    -- Entry & apportionment
    ('entry_level',         jsonb_build_array('draft','rejected')::jsonb,
        'Header vs line scope is set at create.'),
    ('apportion_basis',     jsonb_build_array('draft','rejected')::jsonb,
        'Apportionment method for header→line distribution.'),

    -- Origin / cross-doc lineage (mostly system-set after inheritance)
    ('origin',              jsonb_build_array('draft','rejected')::jsonb,
        'Manual vs inherited indicator; user-editable at draft.'),

    -- Tax / withholding
    ('tax_group_id',        jsonb_build_array('draft','rejected')::jsonb,
        'Tax group drives rate + GL; locks at submit.'),
    ('is_inclusive',        jsonb_build_array('draft','rejected')::jsonb,
        'Inclusive / exclusive computation mode; locks at submit.'),
    ('recoverable_pct',     jsonb_build_array('draft','rejected')::jsonb,
        'Partial-recovery percentage; locks at submit.'),
    ('tax_section_code',    jsonb_build_array('draft','rejected')::jsonb,
        'Jurisdiction tax section code; locks at submit.'),

    -- Currency
    ('exchange_rate',       jsonb_build_array('draft','rejected')::jsonb,
        'FX rate; correctable pre-post.'),

    -- GL routing
    ('business_intent_id',  jsonb_build_array('draft','rejected')::jsonb,
        'Term-level intent override; locks at submit.'),
    ('posting_role_code',   jsonb_build_array('draft','rejected')::jsonb,
        'Strategy parameter for POSTING_ROLE source.'),
    ('account_source',      jsonb_build_array('draft','rejected')::jsonb,
        'Resolution strategy enum.'),

    -- Annotation
    ('tags',                jsonb_build_array('draft','rejected')::jsonb,
        'Operational tags.'),
    ('metadata',            jsonb_build_array('draft','rejected')::jsonb,
        'Free-form metadata.')

  ) AS rule(field_name, allowed_statuses, reason),
       pc_version
 WHERE ef.entity_version_id = pc_version.version_id
   AND ef.name              = rule.field_name;


-- =============================================================================
-- End of 044_entity_field_rules_pricing_component.sql
-- =============================================================================

COMMIT;
